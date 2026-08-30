# VGS EU rollout

## Decision and current state

- Selected provider: VGS.
- Selected first environment: VGS EU sandbox (`sandbox-eu-1`).
- HyperSwitch connector type: `vault_processor`.
- HyperSwitch credential shape: `SignatureKey`.
- Railway activation flag: `VGS_EU_SANDBOX_ENABLED=false` until every gate below passes.
- Railway vault allowlist: `VGS_EU_SANDBOX_VAULT_IDS` must contain only vault
  IDs whose `sandbox-eu-1` region was read back in the VGS dashboard.
- Live VGS endpoints, live credentials, real PAN, real CVV, and live payments are out of scope.

The router uses VGS Vault API v2's tenant hostname:
`https://{vault-id}.sandbox.vault-api.verygoodvault.com/`. EU residency is set
when the vault is created as `sandbox-eu-1`; it is not inferred from the generic
hostname. OAuth access tokens are requested from VGS's authentication service.
The public gateway still rejects VGS account creation while the activation flag
is false.

## Credential mapping

Create a VGS EU sandbox vault and a least-privilege service account. Enter the
three values directly into the HyperSwitch connector form or API over the
protected Railway gateway. Never paste them into chat, issues, logs, Git, or
documentation.

| HyperSwitch field | VGS value |
| --- | --- |
| `api_key` | service-account client ID / username |
| `key1` | service-account client secret / password |
| `api_secret` | EU sandbox vault ID |
| `auth_type` | literal `SignatureKey` |

Use `connector_name=vgs`, `connector_type=vault_processor`, and
`test_mode=true`. VGS permissions must be limited to the alias operations the
tested flow actually needs. Do not grant broad administrative permissions.

## Activation gates

1. Accept VGS terms and verify in the VGS dashboard that the vault region is EU
   sandbox. Save the DPA, subprocessor list, data-residency statement, PCI AOC,
   retention terms, and cross-border-transfer terms for legal review.
2. Create a dedicated least-privilege sandbox service account. Store its secret
   only in the encrypted HyperSwitch connector account through Railway; do not
   add it as source code or a shared environment variable.
3. **Completed on 2026-08-30:** deploy the pinned HyperSwitch Prism Unified
   Connector Service privately and connect the router path required by
   `/confirm-intent/external-vault-proxy`. Router logs confirm the connection;
   the previous missing-UCS warning is gone.
4. Configure VGS Collect for `sandbox-eu-1`. Load Collect.js 3.3.0 from
   `https://js.verygoodvault.com/vgs-collect/3.3.0/vgs-collect.js` with its
   published Subresource Integrity value
   `sha384-YXvleED0q049Gx5rqUHI/hOTud/jKaLiL757lVq26oVFAd9SjTDHBoOviWw6XmPo`.
   PAN, expiry, and CVV must travel directly from VGS-controlled iframe fields
   to VGS. Configure every sensitive field with VGS `UUID` tokenization so the
   result is a
   `tok_sandbox_...` alias; format-preserving aliases are intentionally rejected
   by the public gateway because they cannot be distinguished safely from raw
   card values. Set CVV alias storage to `VOLATILE`. HyperSwitch, Railway,
   browser analytics, support tooling, and application logs may receive only
   aliases and non-sensitive context. The browser may receive a short-lived VGS
   OAuth access token from a backend endpoint, but never the VGS client secret.
5. Create the VGS `vault_processor` connector using the mapping above, attach it
   to one disposable QA merchant/profile. Put its verified vault ID in
   `VGS_EU_SANDBOX_VAULT_IDS`, then enable `VGS_EU_SANDBOX_ENABLED=true` only for
   that controlled test window. The gateway deliberately refuses to start in
   VGS mode without the allowlist.
6. Prove insert, retrieve/proxy, payment confirmation, failure, retry, and
   deletion/retention behaviour with VGS sandbox test data. Verify the separate
   iDEAL and later Wero paths do not depend on card detokenization.
7. Scan router, gateway, control-center, database, Redis, backups, error traces,
   analytics, and support exports for the unique test PAN/CVV markers. Any match
   outside VGS is a release blocker.
8. Disable the flag after the test unless the complete QA evidence and security
   review are accepted. Live activation requires a separate change, separate
   live credentials, explicit approval, and a fresh end-to-end proof.

The gateway applies this rule to all `POST`, `PUT`, and `PATCH` mutations below
the v1/v2 payment, payment-method, and payment-method-session paths, including
v1 confirm and v2 `confirm-intent/external-vault-proxy`. It blocks recursively
nested inline connector credentials, Stripe live-key patterns, ordinary raw
card fields, decrypted-wallet PAN fields, VGS aliases while the rollout flag is
disabled, and non-UUID external-vault values after activation. The unbounded v2
generic tokenization endpoint is blocked entirely. Stored Stripe test processor
tokens remain supported.

## Implementation references

- [VGS Collect.js integration](https://docs.verygoodsecurity.com/vault/developer-tools/vgs-collect/js/integration)
- [VGS Collect tokenization API](https://docs.verygoodsecurity.com/vault/developer-tools/vgs-collect/js/collect-tokenization-api)
- [VGS vault APIs and regions](https://docs.verygoodsecurity.com/vault/developer-tools/apis/vault-apis-and-region)
- [HyperSwitch external-vault connector flow](https://docs.hyperswitch.io/integration-guide/workflows/vault/connect-external-vaults-to-hyperswitch-orchestration)

## Release evidence

Record the VGS vault region, service-account ID (never its secret), connector
account ID, disposable merchant/profile IDs, Railway deployment IDs, timestamps,
HTTP results, VGS request IDs, negative data scans, and cleanup readback. A green
build or a Railway `SUCCESS` status alone is not proof that the vault flow works.

## Railway preparation evidence: 2026-08-30

- Source commit: `c37c1a814a3b4e3a3cc471011bbb5a140c2034e0`.
- GitHub verify and image-publication run: `33336975081` (`SUCCESS`).
- UCS service: `c5730333-bb91-41ac-98b7-b2353775112b`, deployment
  `b9b655e0-121d-4c39-b690-5713732f9137` (`SUCCESS`).
- UCS image: `ghcr.io/juspay/hyperswitch-prism:2026.07.02.1`, pinned at runtime
  to amd64 digest
  `sha256:da12c49a601251e08f9d834fff8e4a26a404e3d0fe5ee37f246a9a4168dc227e`.
- Router deployment after UCS configuration:
  `075a734f-50cf-4cce-b403-df55515944e7` (`SUCCESS`). Router logs report
  `Successfully connected to Unified Connector Service`.
- Router readiness deployment after private SQLx analytics configuration:
  `71804ab0-3974-4273-952d-dc8cf8d91ee3` (`SUCCESS`). Public readback from
  `/health/ready` returned `200` with database, Redis, analytics, outgoing
  request, and Unified Connector Service checks all `true`.
- Railway now uses `/health/ready` instead of the shallow `/health` endpoint as
  the router deployment health check. Redeployment
  `735cd715-8044-4461-9c74-7d623e708f6e` reached `SUCCESS` through that stricter
  release gate.
- Scheduled deep-readiness smoke run `33338215839` and verification, test,
  Gitleaks, and image-publication run `33338215846` completed successfully.
- Gateway deployment: `05064423-95fa-4a64-b960-436ec1960a88` (`SUCCESS`).
- Post-deploy external smoke run: `33337166095` (`SUCCESS`).
- Public readback: `/beta-policy` returned `external_vault=vgs_eu_pending`.
- Negative readback: fake VGS connector creation returned
  `403 beta_vgs_eu_not_enabled`; a fake live Stripe key still returned
  `403 beta_live_credential_blocked`.
- Non-PCI mutation-policy commit:
  `48f0644376e791d81ae2176532fe7a4db63b9f2e`. Verification, 30 automated
  gateway/control-center tests, Gitleaks, and image publication completed in
  GitHub Actions run `33338924829` (`SUCCESS`).
- Gateway readiness deployment:
  `0af20f3f-fe4f-4a24-8b3a-71f80821c20c` (`SUCCESS`), using the exact
  `beta-gateway-48f0644376e791d81ae2176532fe7a4db63b9f2e` image and Railway
  health check `/health/ready`.
- Public policy readback returned `raw_card_data=blocked`,
  `vgs_alias_format=uuid_only`, and `external_vault=vgs_eu_pending`. Deep
  readiness returned `200` with every dependency `true`.
- Public negative probes on v1/v2 payment confirm routes returned
  `403 beta_raw_card_data_blocked`, `403 beta_inline_credentials_blocked`,
  `403 beta_vgs_eu_not_enabled`, and `403 beta_live_credential_blocked` before
  router authentication. Railway HTTP logs contained only method, path, status,
  and duration; no request bodies or credentials were logged.
- A follow-up ingress audit found the v1 `/payment_methods` and
  `/payment_methods/tokenize-card` paths plus future v2 payment-method-session
  and generic-tokenization paths. Final policy commit
  `6f33546416ceb650f9eb2a1bfa5d3c918bceb671` closes those routes as well.
  Verification, 38 automated tests, Gitleaks, and image publication completed
  in GitHub Actions run `33339313646` (`SUCCESS`).
- Definitive gateway deployment:
  `bb772047-cb81-48ae-81c0-0bd5280fcf73` (`SUCCESS`), using image
  `beta-gateway-6f33546416ceb650f9eb2a1bfa5d3c918bceb671` and Railway health
  check `/health/ready`.
- Public negative readback additionally proved raw payment-method creation,
  raw tokenize-card, decrypted-wallet PAN, and generic v2 tokenization all
  return the expected gateway `403` before router authentication. A
  stored-processor-token-shaped request passed the gateway and reached the
  router's normal authentication boundary (`400 IR_04` without an API key).
- Final external smoke run `33339456588` completed successfully against the
  gateway, deep readiness endpoint, Web SDK, control center, and security
  headers.
- Network readback: the router and UCS have no public domain and no TCP proxy.
- Remaining hard blocker: no VGS EU sandbox account, verified EU vault,
  least-privilege service account, or VGS Collect integration is available yet.
  No VGS credential, alias operation, PAN, CVV, or paid/live transaction has
  been used.
