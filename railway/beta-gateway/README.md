# Sandbox beta policy gateway

This small Node.js reverse proxy is the only public API entry point for the
current Hyperswitch sandbox beta. Railway private networking connects it to the
router at `router.railway.internal:8080`.

The gateway:

- rejects Stripe credentials containing live-mode key prefixes;
- rejects connector accounts other than Stripe test and the gated VGS EU path;
- keeps the selected VGS EU sandbox vault route disabled until
  `VGS_EU_SANDBOX_ENABLED=true` is set after the activation gates pass;
- refuses to start in VGS mode unless `VGS_EU_SANDBOX_VAULT_IDS` contains at
  least one verified EU sandbox vault ID;
- when enabled, accepts only a VGS `vault_processor` using HyperSwitch's
  `SignatureKey` credential shape and `test_mode: true`;
- requires `test_mode: true` when Stripe credentials are configured;
- rejects inline connector credentials and raw card fields on every v1/v2
  payment create, update, and confirm mutation;
- permits external-vault card payloads only after VGS activation and only when
  every sensitive value uses VGS's UUID-style `tok_sandbox_...` alias format;
- keeps stored Stripe test processor-token confirms available without allowing
  inline card data;
- rate-limits requests per client IP;
- caps protected JSON request bodies at 1 MiB;
- never logs request bodies or credentials;
- exposes `/gateway-health` for its own process status, `/health` for the
  upstream router health, and `/beta-policy` for machine-readable policy state.

This is a risk-reduction boundary for a public test environment. It does not
replace owned domains, transactional email, legal pages, native PITR, dedicated
alerting, support operations, or a security review required for a commercial
live-money launch.
