# Juspay repository audit for the HyperSwitch Railway stack

Audit date: 2026-08-30

## Decision

Do not deploy the Juspay organization as one product. That would combine unrelated payment, AI, memory, scheduling, design-system, and mobile-SDK projects into an expensive and unsafe monolith.

The Railway sandbox should contain only:

1. [`juspay/hyperswitch`](https://github.com/juspay/hyperswitch) — the Rust payment router and API.
2. [`juspay/hyperswitch-web`](https://github.com/juspay/hyperswitch-web) — the browser payment SDK.
3. [`juspay/hyperswitch-control-center`](https://github.com/juspay/hyperswitch-control-center) — the merchant dashboard.
4. [`juspay/superposition`](https://github.com/juspay/superposition) — context-aware runtime configuration used by the selected router build.
5. PostgreSQL, Redis, the test-only policy gateway, encrypted backups, and health checks from this deployment bundle.

This is a controlled test sandbox. It is not authorization to process live money.

## Chosen commercial architecture: non-PCI orchestration

The target is a SaaS orchestration product for mid-size merchants following HyperSwitch's documented [SaaS orchestration with a third-party vault](https://docs.hyperswitch.io/integration-guide/workflows/vault/deployment-models/saas-orchestration-with-third-party-vault) model. VGS EU is the selected external vault; TokenEx is no longer the primary path. Cardholder data must flow directly from the VGS-controlled collection layer to VGS. HyperSwitch receives vault tokens and non-sensitive payment context, not PAN or CVV.

This is the only sensible commercial direction for the stated product. Self-hosting `hyperswitch-card-vault` on Railway would drag this company into key custody, vault availability, incident response, recovery, and materially larger PCI obligations. Calling the product “non-PCI” is still shorthand, not a legal fact: the final SDK flow, contracts, merchant responsibilities, SAQ obligations, logs, support access, and the vault provider's attestation must establish the actual residual scope.

The current Railway deployment is deliberately a test-only sandbox with a mock locker and a Stripe-test-only gateway. It must never receive real card data. A production release requires an explicit adapter and end-to-end proof for the selected external vault.

## Organization scan

The Juspay organization exposed 372 public repositories during this audit: 363 active repositories, 9 archived repositories, and 118 forks. Repository metadata, descriptions, activity, default branches, and detected licenses were scanned. The repositories below were then inspected more deeply because they were named by the project owner or are direct HyperSwitch dependencies.

## Deploy now

| Repository | Finding | License | Railway decision |
| --- | --- | --- | --- |
| [`hyperswitch`](https://github.com/juspay/hyperswitch) | Core payment orchestration API. PostgreSQL and Redis are required; Superposition is present in the current standalone composition. | Apache-2.0 | Deploy the pinned, previously regression-tested router image. Keep it private behind the beta gateway. |
| [`hyperswitch-web`](https://github.com/juspay/hyperswitch-web) | Browser SDK and `HyperLoader.js`; required for hosted web payment flows. | Apache-2.0 | Deploy publicly and point it at the protected gateway. |
| [`hyperswitch-control-center`](https://github.com/juspay/hyperswitch-control-center) | Merchant dashboard for accounts, connectors, payments, refunds, and routing configuration. | Apache-2.0 | Deploy publicly behind the hardened proxy and retain the sandbox warning. |
| [`superposition`](https://github.com/juspay/superposition) | Context-aware configuration service. The selected router configuration references it and has a local fallback seed. | Apache-2.0 | Deploy privately plus the idempotent seed job. |

## Important, but not part of this Railway sandbox

| Repository | Finding | Why it is not deployed now |
| --- | --- | --- |
| [`hyperswitch-card-vault`](https://github.com/juspay/hyperswitch-card-vault) | Separate vault for card and other sensitive payment data, with JWE/JWS and a custodian-key hierarchy. Apache-2.0. | A real vault changes the PCI scope and requires approved key custody, network isolation, rotation, recovery, and compliance operations. The sandbox uses the mock locker and must never receive real card data. |
| [`hyperswitch-encryption-service`](https://github.com/juspay/hyperswitch-encryption-service) | Encryption/decryption and data-encryption-key management service. Apache-2.0. | Useful for a production cryptographic boundary, but only after a real KMS/key-custody design and rotation procedure exist. |
| [`decision-engine`](https://github.com/juspay/decision-engine) | Optional payment-routing control plane with rule, success-rate, cost-aware, experiment, and audit features. | It is AGPL-3.0 and adds substantial operational dependencies such as a SQL store, Redis, ClickHouse, and Kafka in its documented full setup. It is not required for the baseline router and must be evaluated as a separate service and compliance decision. |
| [`hyperswitch-suite`](https://github.com/juspay/hyperswitch-suite) | Suite map, load tests, and extensive AWS/EKS Terraform. Apache-2.0. | This is reference/infrastructure code for AWS-oriented production deployments, not a Railway application service. Copying the AWS stack into Railway would be the wrong abstraction. |
| [`hyperswitch-client-core`](https://github.com/juspay/hyperswitch-client-core) and [`hyperswitch-sdk-utils`](https://github.com/juspay/hyperswitch-sdk-utils) | Shared client libraries used by the web/mobile SDK ecosystem. Apache-2.0. | Build-time libraries, not independently deployed server processes. |
| [`hyperswitch-prism`](https://github.com/juspay/hyperswitch-prism) | Lightweight multi-processor library. Apache-2.0. | An alternative integration shape, not an extra service needed beside the full router. |
| [`hyperswitch-data-backfill`](https://github.com/juspay/hyperswitch-data-backfill) | Replays database entries into Kafka for ClickHouse seeding. No detected root license. | Only relevant after Kafka/ClickHouse analytics is deliberately enabled; do not reuse until licensing is verified. |

## Client and commerce integrations: choose only when a product needs them

| Repository group | Finding | Decision |
| --- | --- | --- |
| [`hyperswitch-sdk-ios`](https://github.com/juspay/hyperswitch-sdk-ios), [`hyperswitch-sdk-android`](https://github.com/juspay/hyperswitch-sdk-android), [`react-native-hyperswitch`](https://github.com/juspay/react-native-hyperswitch), [`hyperswitch-sdk-react-native`](https://github.com/juspay/hyperswitch-sdk-react-native) | Official client SDKs for native/mobile applications. Apache-2.0 or MIT as declared by each repository. | Integrate into an actual mobile app; do not deploy them as Railway services. |
| [`hyper-js`](https://github.com/juspay/hyper-js) and [`react-hyper-js`](https://github.com/juspay/react-hyper-js) | Loader and React wrappers around the client SDK. Apache-2.0. | Consume from a merchant frontend when needed. |
| [`hyperswitch-woocommerce-plugin`](https://github.com/juspay/hyperswitch-woocommerce-plugin) | WooCommerce integration. Apache-2.0. | Install only in a WooCommerce store. |
| [`hyperswitch-saleor-payment-app`](https://github.com/juspay/hyperswitch-saleor-payment-app) | Saleor payment integration. GitHub license detection returned `NOASSERTION`. | Evaluate license and Saleor need before reuse. |
| [`flutter_hyperswitch`](https://github.com/juspay/flutter_hyperswitch) and [`hyperswitch-dotnet-sdk`](https://github.com/juspay/hyperswitch-dotnet-sdk) | Client SDKs with no root license detected by GitHub. | Do not copy or redistribute until repository licensing is explicit. |

## Requested repositories that are unrelated to the payment runtime

| Repository | Finding | License boundary | Decision |
| --- | --- | --- | --- |
| [`xyne-spaces`](https://github.com/juspay/xyne-spaces) | AI organization context and collaboration platform with its own PostgreSQL, Redis, Vespa, agent, and sandbox architecture. | Apache-2.0 | Separate product. Do not couple it to payment processing. |
| [`olai`](https://github.com/juspay/olai) | AI-native tree/document memory and agent workspace. | No root license detected. | Separate experiment/product; no reuse or resale until licensed. |
| [`oss.olai`](https://github.com/juspay/oss.olai) | Plain-text orchestration board and project memory, not a deployable HyperSwitch component. | No root license detected. | Exclude. |
| [`neurolink`](https://github.com/juspay/neurolink) | TypeScript abstraction across LLM providers, MCP, voice, RAG, and memory. | MIT | Useful only if a separately scoped AI feature is approved. Never place an LLM in the payment authorization path by default. |
| [`yama`](https://github.com/juspay/yama) | AI-assisted code-review workflow with stored review memory. | MIT | Development tooling, not runtime infrastructure. |
| [`clairvoyance`](https://github.com/juspay/clairvoyance) | Real-time audio/text companion built around FastAPI and AI agents. | No root license detected. | Separate product; exclude. |
| [`kronos`](https://github.com/juspay/kronos) | Durable HTTP/Kafka/Redis job scheduler with PostgreSQL/pg_cron. | No root license detected. | Potential future scheduler, but HyperSwitch does not need it for the selected baseline and reuse is not cleared. |
| [`parquet-hs`](https://github.com/juspay/parquet-hs) | Haskell bindings around `parquet-rs`. | A nested package license exists, but no root repository license was detected. | Library work unrelated to the Railway payment runtime. |
| [`blend-design-system`](https://github.com/juspay/blend-design-system) | React design system used by Juspay products. The README says MIT, but the repository has no root `LICENSE` file and GitHub detects no license. | Ambiguous until a real license file or maintainer confirmation exists. | Do not copy components into the control center. Upstream accessibility defects should be fixed in the dashboard source under its own Apache license instead. |

## Requested iOS wrapper repositories

[`hyperplaid-ios`](https://github.com/juspay/hyperplaid-ios), [`hyperupi-ios`](https://github.com/juspay/hyperupi-ios), [`hypertrident-ios`](https://github.com/juspay/hypertrident-ios), [`hyperqr-ios`](https://github.com/juspay/hyperqr-ios), and [`hyperpayu-ios`](https://github.com/juspay/hyperpayu-ios) are thin Swift Package Manager wrappers for specific Juspay/partner mobile capabilities. None exposed a root license during this audit. They are not HyperSwitch server components and must not be copied, redistributed, or deployed to Railway without a specific iOS product requirement and verified rights.

## Production gates that remain outside a test deployment

- Owned custom domains and DNS.
- Approved live PSP accounts and credentials.
- A non-mock vault, key custody, rotation, escrow, and recovery.
- PCI DSS scope and evidence; GDPR/AVG records and retention policy.
- Transactional email, account recovery, abuse controls, and support operations.
- Native point-in-time recovery. The independent encrypted daily backup and full restore path are proven, but they do not provide point-in-time recovery.
- Monitoring, alert ownership, incident response, and an uptime target.
- Human keyboard, zoom/reflow, screen-reader, legal, and privacy review of the dashboard.

Passing Railway health checks is not proof of commercial production readiness.
