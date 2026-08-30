# Hyperswitch Railway bundle

This folder contains the Railway deployment bundle for the local Hyperswitch ecosystem.

Services:
- `router`: Hyperswitch API, runs Diesel migrations on boot, then starts `/local/bin/router`.
- `web`: Hyperswitch Web SDK.
- `control-center`: Hyperswitch dashboard with runtime API/SDK URLs injected from Railway variables.
- `beta-gateway`: public sandbox policy gateway in front of the private router; Stripe test is active and VGS EU sandbox is selected but gated.
- `superposition`: Superposition demo service used by Hyperswitch config.
- `superposition-seed`: one-shot seed job for Superposition dimensions and defaults.
- `postgres-backup`: daily encrypted logical backup job with retention and a reusable restore verifier.

Expected Railway services in one project:
- `Postgres`
- `redis-plain`
- `superposition`
- `superposition-seed`
- `router`
- `web`
- `control-center`
- `beta-gateway`
- `postgres-backup`

The router image uses the local `config/railway.toml`, `payment_required_fields_v2.toml`, `superposition_seed.toml`, and copied Hyperswitch migrations. Runtime secrets and service URLs are set as Railway variables, not stored in this folder.

## Railway deployment

- Account: `msjmohabali@gmail.com`
- Workspace: `jsnmhbl's Projects`
- Project: `hyperswitch-eco-saas`
- Project ID: `065c038f-c543-409f-8bfb-1286268c27b0`
- Environment ID: `27336871-095d-4dfd-ade7-43cf5ecd3cb7`

Public endpoints:

- Protected API gateway: `https://beta-gateway-production.up.railway.app`
- Web SDK: `https://web-production-74a9a.up.railway.app/HyperLoader.js`
- Control center: `https://control-center-production-c0d3.up.railway.app`

Runtime image tags:

- `ghcr.io/pathtoresiliencebv/hyperswitch-railway-public:router-core-5b9f9a5-refund-fix`
- `ghcr.io/pathtoresiliencebv/hyperswitch-railway-public:router-c37c1a814a3b4e3a3cc471011bbb5a140c2034e0`
- `ghcr.io/pathtoresiliencebv/hyperswitch-railway-public:web-20260715-railway-hostfix`
- `ghcr.io/pathtoresiliencebv/hyperswitch-railway-public:control-center-20260808-beta-v2`
- `ghcr.io/pathtoresiliencebv/hyperswitch-railway-public:beta-gateway-c37c1a814a3b4e3a3cc471011bbb5a140c2034e0`
- `ghcr.io/pathtoresiliencebv/hyperswitch-railway-public:postgres-backup-20260807-v3`

Current deployment verification on 2026-08-30:

- All nine expected services reached Railway `SUCCESS`: PostgreSQL, Redis, Superposition, seed job, private router, policy gateway, Web SDK, control center, and backup job.
- `curl https://beta-gateway-production.up.railway.app/health` returned `200`, `health is good`, and `X-Hyperswitch-Beta-Mode: stripe-test-only`.
- `/beta-policy` reports `stripe_test_only`; a fake `sk_live_` connector request was rejected before the private router with `403 beta_live_credential_blocked`.
- VGS EU is selected but deliberately inactive: `/beta-policy` reports `external_vault=vgs_eu_pending`, `VGS_EU_SANDBOX_ENABLED=false` is set on the gateway, and a fake VGS connector request was rejected before the router with `403 beta_vgs_eu_not_enabled`.
- Commit `c37c1a814a3b4e3a3cc471011bbb5a140c2034e0` passed the GitHub verification, JavaScript tests, Gitleaks scan, and image publication. Railway router deployment `19ef47f7-b595-4e81-bffe-d55ba5bf7aee` and gateway deployment `05064423-95fa-4a64-b960-436ec1960a88` reached `SUCCESS`; post-deploy external smoke run `33337166095` passed.
- `https://web-production-74a9a.up.railway.app/HyperLoader.js` returned `200` and 4,134,119 bytes.
- `https://control-center-production-c0d3.up.railway.app` returned `200`, included the persistent `Sandbox beta` warning, and returned CSP, HSTS, MIME-sniffing, and frame-denial headers.
- Router migrations completed and the server listened on private port `8080`; Superposition returned healthy and the seed job logged `Seeding complete!`.
- Railway reported zero public domains and zero TCP proxies for the router, PostgreSQL, Redis, and Superposition.
- An encrypted backup written at `2026-08-30T21:15:31Z` passed checksum verification, `pg_restore --list`, and a complete restore into a fresh PostgreSQL 18 container.
- No live PSP credential, live payment, or external paid call was used during this deployment.

The following evidence belongs to the previous Railway project, which was no longer available on 2026-08-30. It is retained only as historical regression and image-provenance evidence; its old Web SDK and control-center URLs must not be treated as live endpoints.

Historical verification on 2026-08-08:

- `curl https://beta-gateway-production.up.railway.app/health` returned `200` with `health is good` and `X-Hyperswitch-Beta-Mode: stripe-test-only`.
- The gateway rejects fake live Stripe keys and inline payment credentials with `403`, while CORS preflight and the sandbox payment API remain available.
- The then-current Web SDK and control-center endpoints returned `200`.
- Railway health checks are configured for `/health`, `/health`, `/HyperLoader.js`, and `/` on the router, gateway, Web SDK, and control center respectively.
- Beta gateway deployment `5c23d842-650e-45c3-b2c6-eb774880fd45` reached `SUCCESS` with image digest `sha256:aaaf193ac74c747e39c3d61bf8a7ecc42af7dc08f6a7680021e341d455718a7a`.
- Control center deployment `ae9dab6f-9d19-4148-af78-46783083f242` reached `SUCCESS` with image digest `sha256:0d2e23eceef43ddd234dd0a6f2643aa811b547ed6fc289401387c3f74de5db50`. Its dashboard points to the protected gateway, shows a persistent sandbox warning, and reflows without horizontal overflow at an emulated 320 CSS px viewport.
- The Stripe CLI regression through the public gateway completed a EUR 15.99 payment and EUR 4.00 partial refund, with matching Stripe objects and events. All temporary tenant, key, connector, and webhook resources were cleaned up; no live-mode action was attempted.
- Router deployment `175ecfca-1d03-4692-9a8a-3c7d615e8e20` reached `SUCCESS` after the health-check release.
- Router deployment `559c7ec9-af61-4f4a-92f2-ca85b02c344b` reached `SUCCESS` after production console logging was reduced from `DEBUG` to `INFO`.
- Router deployment `fed36664-2654-43aa-9a2f-55b02c75ea12` reached `SUCCESS` after the fixed example API-key hash key was replaced by a unique 32-byte Railway secret. The database contained zero API keys before rotation.
- Router deployment `651ef761-bf5b-482a-945e-37d1f67c4735` reached `SUCCESS` with image `ghcr.io/pathtoresiliencebv/hyperswitch-railway-public:router-20260807-stripe-refund-fix` and digest `sha256:33bbcda2335f5805438a708764284953e14a9ef8f9a446e1b5c5bf78fbc87f9d`. The image is pinned to upstream commit `5b9f9a52038e3420d496fdc04c19f6dcd49d9474` plus the two-line processor-token `payment_method_type` persistence fix. The local release build disabled LTO to stay inside the available Docker memory; the immutable image digest and source commit are the provenance source of truth because the worktree build could not embed Git metadata.
- The patched core was also published separately as `router-core-5b9f9a5-refund-fix`, digest `sha256:abc8a953ad48d997b8fc5d735c280c613083c9d2ac3757d6af63f50dedbdc3eb`. `router/Dockerfile` pins this digest so rebuilding the Railway wrapper cannot silently fall back to the unpatched vendor router.
- Router deployment `2f19418b-eba4-4383-9fc3-27c96431e4c9` reached `SUCCESS` after the fixed `user_auth_methods.encryption_key` example was replaced by a unique Railway secret. The table contained zero authentication methods and zero encrypted private configs before rotation, so no existing login data required re-encryption.
- After that rotation, Stripe CLI regression merchant `codex_stripe_20260807232705` completed a second EUR 15.99 payment (`pay_kKmHvwuV2995QEncPg90`, Stripe `pi_3U1vIaHFISIZOKrl1bSTjkp9`) and EUR 4.00 partial refund (`ref_puJT8Kml6XFJlg42ZBII`, Stripe `re_3U1vIaHFISIZOKrl1zikQcga`). Matching Stripe events were found, the temporary webhook was deleted, and cleanup completed. No live-mode action was attempted.
- Backup deployment `4129bc10-d18b-4d7b-85fb-417bbedcfdb6` reached `SUCCESS` with image `ghcr.io/pathtoresiliencebv/hyperswitch-railway-public:postgres-backup-20260807-v3` and digest `sha256:ad8fb8149da954c529825ba8f3f6a10e8f2652b149834cc9f57b31c69b989f9d`.
- Web SDK deployment `59b7f6dc-cf21-48a1-bb4f-9849627e0b64` reached `SUCCESS` after the health-check release.
- Control center deployment `68ddda92-595f-4985-be84-b8e0b1da4a57` reached `SUCCESS` after the health-check release.
- Hardened control center deployment `ed64b8bc-cbe0-4317-8c1f-7190e92285bd` reached `SUCCESS` with image digest `sha256:a2f64f6d790f95028a21c14e4ef4c1eaebc3560d3640eafbcd9e6e097f8e45ce`. Its public domain targets port `9001`.
- A public self-service signup returned `200`, produced a merchant, organization, and profile, and completed the optional 2FA decision flow with a `user_info` session.
- A newly registered QA merchant created an API key, created a EUR payment intent, received `200` with `requires_payment_method`, and revoked the temporary API key successfully.
- A separate ephemeral hardening test created a merchant, API key, default profile, and built-in `fauxpay` sandbox connector. A confirmed EUR card payment returned `200`, `succeeded`, and identified `fauxpay` as its connector. Cleanup was verified directly in PostgreSQL: the temporary merchant count was `0`.
- The full merchant, API-key, profile, `fauxpay`, and successful EUR payment flow was repeated after the API hash-key rotation. Every step returned `200`; cleanup left zero temporary merchants and zero API keys in PostgreSQL.
- The patched router was verified end to end with Stripe CLI against ephemeral merchant `codex_stripe_20260807225427`. Stripe CLI created PaymentMethod `pm_1U1un5HFISIZOKrlYO717Kme` and webhook endpoint `we_1U1umyHFISIZOKrl5WkadQNr`; the signing secret was stored through the encrypted merchant-connector configuration and was never printed or committed.
- A EUR 15.99 processor-token payment succeeded through Hyperswitch as `pay_soXnoZxyxih0nkNT0hwB`; its response retained `payment_method_type=credit`. Stripe independently returned PaymentIntent `pi_3U1unBHFISIZOKrl1qCuY2ZU` as `succeeded`, amount `1599`, currency `eur`, with matching event `evt_3U1unBHFISIZOKrl1HQemDXc`.
- Hyperswitch `POST /refunds` then created EUR 4.00 partial refund `ref_ybxtD4wi9G6nOoKbIpMX`. Stripe independently returned connector refund `re_3U1unBHFISIZOKrl1tvbbM3y` as `succeeded`, amount `400`, with matching event `evt_3U1unBHFISIZOKrl1sNaNKIJ`. This closes the previous `IR_04 Missing required param: payment_method_type` blocker for the tested processor-token flow.
- Railway router logs recorded eight signed Stripe deliveries for the ephemeral endpoint as `IncomingWebhookReceive`, all with Stripe's webhook user agent and HTTP `200`. The temporary endpoint was deleted (`0` matching endpoints remained); connector deletion, API-key revocation, and merchant deletion all returned `200`. No Stripe live-mode charge or refund was attempted.
- During the last-hour verification window, the public router, Web SDK, and control center recorded no HTTP `5xx` responses.

## Browser security

The control center runs its original vendor server behind the small proxy in `control-center/secure-proxy.mjs`. This keeps the application unchanged while applying browser security controls to every response:

- `Content-Security-Policy` blocks framing, plugins, unsafe base URLs, and insecure subresources.
- `X-Frame-Options: DENY` blocks clickjacking on older clients.
- `X-Content-Type-Options: nosniff` blocks MIME sniffing.
- HSTS is enabled for one year.
- Referrers are limited to their origin for cross-origin requests.
- Camera, microphone, and geolocation access are disabled.
- The vendor server's wildcard CORS headers and `X-Powered-By` disclosure are stripped from dashboard responses.

The live root page, `app.js`, and a deep SPA route all returned `200` after this change. Railway WAF Under Attack Mode is available but remains disabled during normal operation because its browser challenge can reject API clients and payment webhooks with `429`. Enable it only as a temporary incident response measure, and prefer a domain-level WAF with route-aware rules once owned domains are connected.

## Network and data hardening

- PostgreSQL is reachable by the application only through Railway private networking at `postgres.railway.internal:5432`.
- Railway reported zero public domains and zero TCP proxies for PostgreSQL, Redis, Superposition, and the router on 2026-08-30.
- PostgreSQL uses Railway volume `032c8318-5c0d-49f2-b757-9ac2ef6c1d0f` mounted at `/var/lib/postgresql/data`.
- Redis uses Railway volume `6e81d4de-ced5-4312-80eb-847cc3893ae8` mounted at `/data`. Neither datastore depends on container-local ephemeral storage.
- Native point-in-time recovery is **not configured or proven** in the current project. The independent encrypted logical backup is operational, but it does not replace native PITR.

### Independent database backups

- Private Railway bucket: `hyperswitch-pg-backups` (`91e6bdd8-8345-4f78-9c76-9175a01b0c46`) in EU West (`ams`).
- Backup service: `postgres-backup` (`c4197612-8d1c-4873-aec5-e42bdfcd393e`).
- Schedule: every day at `02:00 UTC` with 35-day application-managed retention.
- Format: PostgreSQL 18 custom-format dump, encrypted client-side with AES-256-CBC, PBKDF2, and 200,000 iterations. The encrypted dump, SHA-256 checksum, and JSON manifest are stored as three private objects.
- Every scheduled run validates the unencrypted dump catalog with `pg_restore --list` before encryption and upload. A structurally invalid dump fails the job instead of being stored as a successful backup.
- Latest verified backup: `postgres/daily/hyperswitch-2026-08-30T21-15-31Z.dump.enc`, SHA-256 `1d5711f6d8196fa69ffce9038ce2144542cefbe5c62d2219b474598636e7730e`.
- Latest restore drill passed: download, checksum, decryption, `pg_restore --list`, and a complete restore into a fresh PostgreSQL 18 container all succeeded. The new sandbox database contained 0 merchant accounts, 0 users, and 0 API keys at backup time. The temporary 5-minute schedule was reverted; the active schedule is `02:00 UTC`.

The encryption key currently lives only as a Railway service variable. Escrow it in an external password manager or secrets vault before relying on this backup for company-wide disaster recovery.

Railway dashboard:

- `https://railway.com/project/065c038f-c543-409f-8bfb-1286268c27b0?environmentId=27336871-095d-4dfd-ade7-43cf5ecd3cb7`

## Production boundary

The platform and tenant onboarding are live as a controlled sandbox beta. Stripe test mode has been proven for payment, signed webhook delivery, and a Hyperswitch-initiated partial refund. The public gateway intentionally prevents merchants from configuring live Stripe credentials or creating connector types other than Stripe test and the still-gated VGS EU vault path. Never commit PSP credentials to this bundle; store test credentials through the control center.

The intended commercial architecture is reduced-scope payment orchestration for mid-size merchants using VGS EU as the selected third-party PCI-compliant vault. Cardholder data must be collected and tokenized by VGS; the Railway router may receive only vault tokens and non-sensitive orchestration data. This reduces PCI scope but is not, by itself, a compliance certificate or a truthful basis for claiming "non-PCI." The current mock locker is test-only and must never receive real PAN or CVV data.

The current deployment uses Railway-provided domains. Add owned custom domains and transactional email before presenting this as a fully branded commercial product. The router's `release` feature set includes email support, but the live config still contains the local MailHog SMTP placeholders and Railway has no SMTP/SES variables. Signup works, while email verification and password-reset delivery are not operational until a real transactional-email provider is configured and tested.

Do not call this production-ready for real customers until all four remaining gates are closed:

1. Contract VGS for an EU sandbox/data plane, complete tokenization and tightly controlled detokenization integration, document residual PCI scope, and prove that PAN/CVV never reaches the router, logs, database, or support tooling.
2. Enable Railway PITR and prove a native point-in-time restore. The independent daily encrypted dump and full restore test already provide a second recovery path, but its encryption key still needs external escrow.
3. Configure owned API, SDK, and control-center domains with final CORS and redirect settings.
4. Ship transactional email, legal pages, privacy/retention rules, monitoring alerts, and a customer-support process.
