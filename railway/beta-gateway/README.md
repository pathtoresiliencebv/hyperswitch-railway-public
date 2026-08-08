# Stripe-test-only beta gateway

This small Node.js reverse proxy is the only public API entry point for the
current Hyperswitch sandbox beta. Railway private networking connects it to the
router at `router.railway.internal:8080`.

The gateway:

- rejects Stripe credentials containing live-mode key prefixes;
- rejects new non-Stripe connector accounts;
- requires `test_mode: true` when Stripe credentials are configured;
- rejects inline connector credentials on payment creation;
- rate-limits requests per client IP;
- caps protected JSON request bodies at 1 MiB;
- never logs request bodies or credentials;
- exposes `/gateway-health` for its own process status, `/health` for the
  upstream router health, and `/beta-policy` for machine-readable policy state.

This is a risk-reduction boundary for a public test environment. It does not
replace owned domains, transactional email, legal pages, native PITR, dedicated
alerting, support operations, or a security review required for a commercial
live-money launch.
