# Hyperswitch Railway Public Images

This repository contains the non-secret, reproducible deployment source for the Hyperswitch Railway SaaS stack and publishes its public images to:

`ghcr.io/pathtoresiliencebv/hyperswitch-railway-public`

The deployable bundle lives in `railway/`. Runtime credentials, encryption keys, database URLs, PSP credentials, and service URLs remain Railway variables and must never be committed here.

Customer-facing test-mode onboarding is documented in [`docs/SANDBOX_QUICKSTART.md`](docs/SANDBOX_QUICKSTART.md). It explicitly stays inside the current beta boundary and includes the Stripe CLI payment, webhook, and partial-refund verification path.

The Juspay organization scan and the deploy/exclude decision for the related
repositories are documented in
[`docs/JUSPAY_REPOSITORY_AUDIT.md`](docs/JUSPAY_REPOSITORY_AUDIT.md).

The selected VGS EU rollout and its remaining activation gates are documented
in [`docs/VGS_EU_ROLLOUT.md`](docs/VGS_EU_ROLLOUT.md).

## Public beta boundary

The public API endpoint is the policy gateway at
`https://beta-gateway-production.up.railway.app`. The underlying router has no
public Railway domain and is reachable only over Railway private networking.
The gateway allows the tested Stripe sandbox path while rejecting live Stripe
credentials, new payment connectors, and payment requests containing inline
connector credentials. VGS EU is the selected external vault, but its sandbox
route remains disabled until the documented activation gates pass. This is a
temporary public sandbox boundary, not a claim that this deployment is ready to
process real customer money.

## Patched router provenance

The production router is based on upstream Hyperswitch commit `5b9f9a52038e3420d496fdc04c19f6dcd49d9474` with one reviewed patch:

`railway/router/patches/0001-preserve-processor-token-payment-method-type.patch`

That patch preserves `payment_method_type` for processor-payment-token flows so a later Hyperswitch refund can supply Stripe's required payment-method type. The patched core image is immutable:

- tag: `router-core-5b9f9a5-refund-fix`
- digest: `sha256:abc8a953ad48d997b8fc5d735c280c613083c9d2ac3757d6af63f50dedbdc3eb`

The Railway router wrapper pins that digest. The full production wrapper is currently:

- tag: `router-20260807-stripe-refund-fix`
- digest: `sha256:33bbcda2335f5805438a708764284953e14a9ef8f9a446e1b5c5bf78fbc87f9d`

Use the manual `Publish patched router core` workflow only when rebuilding the Rust core. Regular bundle changes are built by `Verify and publish Railway images`.

Router migrations are intentionally not duplicated in Git. Run `railway/router/prepare-context.sh` before a local router-wrapper build; CI runs it automatically and fetches migrations from the same pinned upstream commit.

The pinned Juspay Web SDK and control-center bases are mirrored into the same GHCR package. Their wrapper Dockerfiles use the mirrored digests, avoiding `docker.juspay.io` rate limits without changing the vendor image contents.

## Production smoke monitoring

`.github/workflows/smoke.yml` schedules an external synthetic check every 15 minutes and can also be triggered manually. GitHub may delay scheduled dispatches, so this is baseline monitoring rather than a strict 15-minute SLA. It verifies:

- the protected gateway's shallow router health response and beta-mode header;
- deep router readiness for PostgreSQL, Redis, SQLx analytics, outbound HTTP,
  and the private Unified Connector Service;
- the published beta policy;
- that the published Web SDK is present and non-trivial;
- that the control-center application shell and sandbox warning are present;
- the control center's CSP, HSTS, MIME-sniffing, and frame-denial headers.

The workflow has no repository-token permissions, uses bounded retries and timeouts, and cancels stale overlapping runs. GitHub Actions failures provide a baseline operational signal; connect a dedicated alerting channel before a commercial launch.
