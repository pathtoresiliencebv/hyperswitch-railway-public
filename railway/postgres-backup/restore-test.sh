#!/usr/bin/env bash
set -euo pipefail

required_variables=(
  RESTORE_DATABASE_URL
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

case "${AWS_S3_URL_STYLE:-virtual}" in
  virtual-host) aws configure set default.s3.addressing_style virtual ;;
  auto|path|virtual) aws configure set default.s3.addressing_style "${AWS_S3_URL_STYLE:-virtual}" ;;
esac

backup_prefix="${BACKUP_PREFIX:-postgres/daily}"
temporary_directory="$(mktemp -d)"
encrypted_dump="${temporary_directory}/backup.dump.enc"
checksum_file="${temporary_directory}/backup.dump.enc.sha256"
manifest_file="${temporary_directory}/backup.dump.enc.json"
plain_dump="${temporary_directory}/backup.dump"
aws_options=(--endpoint-url "$AWS_ENDPOINT_URL")

cleanup() {
  rm -rf "$temporary_directory"
}
trap cleanup EXIT

latest_key="$(
  aws "${aws_options[@]}" s3api list-objects-v2 \
    --bucket "$AWS_S3_BUCKET_NAME" \
    --prefix "${backup_prefix}/" \
    --output json \
    | jq -r '[.Contents[]? | select(.Key | endswith(".dump.enc"))] | sort_by(.LastModified) | last | .Key // empty'
)"

if [[ -z "$latest_key" ]]; then
  printf 'No encrypted PostgreSQL backup found under %s\n' "$backup_prefix" >&2
  exit 1
fi

for suffix in '' '.sha256' '.json'; do
  destination="$encrypted_dump"
  case "$suffix" in
    .sha256) destination="$checksum_file" ;;
    .json) destination="$manifest_file" ;;
  esac

  aws "${aws_options[@]}" s3 cp \
    "s3://${AWS_S3_BUCKET_NAME}/${latest_key}${suffix}" \
    "$destination" \
    --only-show-errors
done

expected_checksum="$(awk '{print $1}' "$checksum_file")"
actual_checksum="$(sha256sum "$encrypted_dump" | awk '{print $1}')"

if [[ "$expected_checksum" != "$actual_checksum" ]]; then
  printf 'Backup checksum mismatch\n' >&2
  exit 1
fi

openssl enc \
  -d \
  -aes-256-cbc \
  -pbkdf2 \
  -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$encrypted_dump" \
  -out "$plain_dump"

pg_restore --list "$plain_dump" >/dev/null
pg_restore \
  --dbname="$RESTORE_DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$plain_dump"

restored_counts="$(
  psql "$RESTORE_DATABASE_URL" -tAq -c \
    "SELECT json_build_object('merchant_accounts',(SELECT count(*) FROM merchant_account),'users',(SELECT count(*) FROM users),'api_keys',(SELECT count(*) FROM api_keys));"
)"

jq -n \
  --arg object_key "$latest_key" \
  --arg sha256 "$actual_checksum" \
  --arg created_at "$(jq -r '.created_at' "$manifest_file")" \
  --argjson restored_counts "$restored_counts" \
  '{backup_created_at:$created_at,object_key:$object_key,checksum_verified:true,sha256:$sha256,pg_restore_list_verified:true,full_restore_verified:true,restored_counts:$restored_counts}'
