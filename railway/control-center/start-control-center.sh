#!/usr/bin/env bash
set -euo pipefail

: "${HYPERSWITCH_API_URL:?HYPERSWITCH_API_URL is required}"
: "${HYPERSWITCH_SDK_URL:?HYPERSWITCH_SDK_URL is required}"

sed \
  -e "s#__HYPERSWITCH_API_URL__#${HYPERSWITCH_API_URL}#g" \
  -e "s#__HYPERSWITCH_SDK_URL__#${HYPERSWITCH_SDK_URL}#g" \
  /tmp/dashboard-config.toml.template > /tmp/dashboard-config.toml

exec node /usr/local/lib/secure-proxy.mjs
