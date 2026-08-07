#!/usr/bin/env bash
set -euo pipefail

required_variables=(
  DATABASE_URL
  AWS_ENDPOINT_URL
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_S3_BUCKET_NAME
  BACKUP_ENCRYPTION_KEY
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    printf 'Missing required variable: %s\n' "$variable_name" >&2
    exit 1
  fi
done

export AWS_EC2_METADATA_DISABLED=true
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"

backup_prefix="${BACKUP_PREFIX:-postgres/daily}"
retention_days="${BACKUP_RETENTION_DAYS:-35}"
timestamp="$(date -u +'%Y-%m-%dT%H-%M-%SZ')"
backup_name="hyperswitch-${timestamp}.dump.enc"
temporary_directory="$(mktemp -d)"
plain_dump="${temporary_directory}/hyperswitch.dump"
encrypted_dump="${temporary_directory}/${backup_name}"
checksum_file="${encrypted_dump}.sha256"
manifest_file="${encrypted_dump}.json"

cleanup() {
  rm -rf "$temporary_directory"
}
trap cleanup EXIT

case "${AWS_S3_URL_STYLE:-virtual}" in
  virtual-host) aws configure set default.s3.addressing_style virtual ;;
  auto|path|virtual) aws configure set default.s3.addressing_style "${AWS_S3_URL_STYLE:-virtual}" ;;
esac

printf 'Creating PostgreSQL custom-format dump at %s\n' "$timestamp"
pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$plain_dump"

printf 'Validating PostgreSQL dump catalog before encryption\n'
pg_restore --list "$plain_dump" >/dev/null

printf 'Encrypting backup with AES-256-CBC and PBKDF2\n'
openssl enc \
  -aes-256-cbc \
  -salt \
  -pbkdf2 \
  -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$plain_dump" \
  -out "$encrypted_dump"

rm -f "$plain_dump"

checksum="$(sha256sum "$encrypted_dump" | awk '{print $1}')"
printf '%s  %s\n' "$checksum" "$backup_name" > "$checksum_file"

jq -n \
  --arg created_at "$timestamp" \
  --arg object_key "${backup_prefix}/${backup_name}" \
  --arg sha256 "$checksum" \
  --arg pg_dump_version "$(pg_dump --version)" \
  --arg encryption "AES-256-CBC PBKDF2 200000 iterations" \
  '{created_at:$created_at,object_key:$object_key,sha256:$sha256,pg_dump_version:$pg_dump_version,dump_catalog_verified:true,encryption:$encryption}' \
  > "$manifest_file"

s3_root="s3://${AWS_S3_BUCKET_NAME}/${backup_prefix}"
aws_options=(--endpoint-url "$AWS_ENDPOINT_URL")

printf 'Uploading encrypted backup to private object storage\n'
aws "${aws_options[@]}" s3 cp "$encrypted_dump" "${s3_root}/${backup_name}" --only-show-errors
aws "${aws_options[@]}" s3 cp "$checksum_file" "${s3_root}/${backup_name}.sha256" --only-show-errors
aws "${aws_options[@]}" s3 cp "$manifest_file" "${s3_root}/${backup_name}.json" --content-type application/json --only-show-errors

aws "${aws_options[@]}" s3api head-object \
  --bucket "$AWS_S3_BUCKET_NAME" \
  --key "${backup_prefix}/${backup_name}" \
  >/dev/null

cutoff="$(date -u -d "${retention_days} days ago" +'%Y-%m-%dT%H:%M:%SZ')"
printf 'Removing backup objects older than %s\n' "$cutoff"
aws "${aws_options[@]}" s3api list-objects-v2 \
  --bucket "$AWS_S3_BUCKET_NAME" \
  --prefix "${backup_prefix}/" \
  --output json \
  | jq -r --arg cutoff "$cutoff" '.Contents[]? | select(.LastModified < $cutoff) | .Key' \
  | while IFS= read -r object_key; do
      [[ -n "$object_key" ]] || continue
      aws "${aws_options[@]}" s3 rm "s3://${AWS_S3_BUCKET_NAME}/${object_key}" --only-show-errors
    done

printf 'BACKUP_OK object=%s sha256=%s\n' "${backup_prefix}/${backup_name}" "$checksum"
