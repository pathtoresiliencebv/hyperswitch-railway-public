# HyperSwitch Prism Unified Connector Service

This Railway service is the private gRPC connector process required by the
router's external-vault proxy. It uses the upstream image version pinned by the
router source:

- tag: `ghcr.io/juspay/hyperswitch-prism:2026.07.02.1`
- amd64 digest: `sha256:da12c49a601251e08f9d834fff8e4a26a404e3d0fe5ee37f246a9a4168dc227e`
- upstream commit: `a070ef74a8d36aeca23f8e90d4d8bb0cc4db77ca`
- license: Apache-2.0

Railway service ID: `c5730333-bb91-41ac-98b7-b2353775112b`.

Runtime settings:

| Setting | Value |
| --- | --- |
| gRPC port | `8000` (Railway private network only) |
| metrics port | `8080` |
| health check | `GET /metrics` on port `8080` |
| environment | `CS__COMMON__ENVIRONMENT=sandbox` |
| raw connector data | `CS__COMMON__RETURN_RAW_CONNECTOR_DATA=false` |
| console log level | `CS__LOG__CONSOLE__LEVEL=INFO` |

The router connects to `http://ucs.railway.internal:8000`. Do not add a public
domain or TCP proxy to this service. VGS credentials belong in the encrypted
HyperSwitch connector account, not in this service or this repository.
