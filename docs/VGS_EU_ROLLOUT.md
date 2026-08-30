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
3. Configure and verify the HyperSwitch Unified Connector Service path required
   by `/confirm-intent/external-vault-proxy`. The current router warning that UCS
   configuration is missing must be gone before external-vault proxy traffic is
   allowed.
4. Configure VGS Collect for `sandbox-eu-1`. PAN, expiry, and CVV must travel
   directly from VGS-controlled fields to VGS. HyperSwitch, Railway, browser
   analytics, support tooling, and application logs may receive only aliases and
   non-sensitive context. CVV aliases must be volatile.
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

## Release evidence

Record the VGS vault region, service-account ID (never its secret), connector
account ID, disposable merchant/profile IDs, Railway deployment IDs, timestamps,
HTTP results, VGS request IDs, negative data scans, and cleanup readback. A green
build or a Railway `SUCCESS` status alone is not proof that the vault flow works.

## Railway preparation evidence: 2026-08-30

- Source commit: `c37c1a814a3b4e3a3cc471011bbb5a140c2034e0`.
- GitHub verify and image-publication run: `33336975081` (`SUCCESS`).
- Router deployment: `19ef47f7-b595-4e81-bffe-d55ba5bf7aee` (`SUCCESS`).
- Gateway deployment: `05064423-95fa-4a64-b960-436ec1960a88` (`SUCCESS`).
- Post-deploy external smoke run: `33337166095` (`SUCCESS`).
- Public readback: `/beta-policy` returned `external_vault=vgs_eu_pending`.
- Negative readback: fake VGS connector creation returned
  `403 beta_vgs_eu_not_enabled`; a fake live Stripe key still returned
  `403 beta_live_credential_blocked`.
- Network readback: the router has no public domain and no TCP proxy.
- Remaining hard blocker: router startup still reports
  `Unified Connector Service config is missing`. No VGS account, credentials,
  alias operation, PAN, CVV, or paid/live transaction has been used.
