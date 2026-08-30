import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

import { createBetaGateway } from "./server.mjs";

let gateway;
let gatewayUrl;
let upstream;
let upstreamUrl;
let vgsGateway;
let vgsGatewayUrl;
const receivedRequests = [];

before(async () => {
  upstream = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    receivedRequests.push({
      body: Buffer.concat(chunks).toString("utf8"),
      method: request.method,
      url: request.url,
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"upstream":true}\n');
  });
  await listen(upstream);
  upstreamUrl = serverUrl(upstream);

  gateway = createBetaGateway({ upstreamUrl });
  await listen(gateway);
  gatewayUrl = serverUrl(gateway);

  vgsGateway = createBetaGateway({
    upstreamUrl,
    vgsEuSandboxEnabled: true,
    vgsEuSandboxVaultIds: ["sandbox_eu_vault_id"],
  });
  await listen(vgsGateway);
  vgsGatewayUrl = serverUrl(vgsGateway);
});

after(async () => {
  await Promise.all([close(gateway), close(vgsGateway), close(upstream)]);
});

test("reports gateway health", async () => {
  const response = await fetch(`${gatewayUrl}/gateway-health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    mode: "stripe_test_only",
    status: "ok",
  });
});

test("publishes the machine-readable beta restrictions", async () => {
  const response = await fetch(`${gatewayUrl}/beta-policy`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    connectors: "stripe_test_only",
    external_vault: "vgs_eu_pending",
    inline_connector_credentials: "blocked",
    live_credentials: "blocked",
    mode: "sandbox_beta",
    raw_card_data: "blocked",
    vgs_alias_format: "uuid_only",
  });
});

test("reports VGS EU sandbox when its rollout gate is enabled", async () => {
  const response = await fetch(`${vgsGatewayUrl}/beta-policy`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).external_vault, "vgs_eu_sandbox");
});

test("refuses to start VGS without a verified EU vault allowlist", () => {
  assert.throws(
    () => createBetaGateway({ upstreamUrl, vgsEuSandboxEnabled: true }),
    /VGS_EU_SANDBOX_VAULT_IDS/,
  );
});

test("forwards a valid Stripe test connector", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest("/account/merchant/connectors", {
    connector_account_details: {
      api_key: "sk_test_example_safe_value",
      auth_type: "HeaderKey",
    },
    connector_name: "stripe",
    connector_type: "payment_processor",
    test_mode: true,
  });

  assert.equal(response.status, 200);
  assert.equal(receivedRequests.length, beforeCount + 1);
  assert.equal(receivedRequests.at(-1).url, "/account/merchant/connectors");
});

test("blocks live Stripe credentials before the upstream", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest("/account/merchant/connectors", {
    connector_account_details: {
      api_key: "sk_live_example_blocked_value",
    },
    connector_name: "stripe",
    test_mode: false,
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "beta_live_credential_blocked");
  assert.equal(receivedRequests.length, beforeCount);
});

test("blocks non-Stripe connector creation", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest("/account/merchant/connectors", {
    connector_account_details: { api_key: "test_value" },
    connector_name: "adyen",
    test_mode: true,
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "beta_stripe_only");
  assert.equal(receivedRequests.length, beforeCount);
});

test("blocks VGS before the EU sandbox rollout gate is enabled", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest("/account/merchant/connectors", vgsPayload());

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "beta_vgs_eu_not_enabled");
  assert.equal(receivedRequests.length, beforeCount);
});

test("forwards a valid VGS EU sandbox vault connector when enabled", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/account/merchant/connectors",
    vgsPayload(),
    { baseUrl: vgsGatewayUrl },
  );

  assert.equal(response.status, 200);
  assert.equal(receivedRequests.length, beforeCount + 1);
});

test("rejects VGS configured as a payment processor", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/account/merchant/connectors",
    vgsPayload({ connector_type: "payment_processor" }),
    { baseUrl: vgsGatewayUrl },
  );

  assert.equal(response.status, 403);
  assert.equal(
    (await response.json()).error.code,
    "beta_vgs_vault_processor_required",
  );
  assert.equal(receivedRequests.length, beforeCount);
});

test("rejects incomplete VGS SignatureKey credentials", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/account/merchant/connectors",
    vgsPayload({
      connector_account_details: {
        api_key: "sandbox_service_account_id",
        auth_type: "SignatureKey",
        key1: "",
      },
    }),
    { baseUrl: vgsGatewayUrl },
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "beta_vgs_credentials_required");
  assert.equal(receivedRequests.length, beforeCount);
});

test("rejects a VGS vault outside the verified EU sandbox allowlist", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/account/merchant/connectors",
    vgsPayload({
      connector_account_details: {
        api_key: "sandbox_service_account_id",
        api_secret: "unverified_vault_id",
        auth_type: "SignatureKey",
        key1: "sandbox_service_account_password",
      },
    }),
    { baseUrl: vgsGatewayUrl },
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "beta_vgs_eu_vault_not_allowed");
  assert.equal(receivedRequests.length, beforeCount);
});

test("allows a webhook-only connector update", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/account/merchant/connectors/mca_example",
    {
      connector_type: "payment_processor",
      connector_webhook_details: { merchant_secret: "whsec_test_value" },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(receivedRequests.length, beforeCount + 1);
});

test("blocks inline payment credentials", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest("/payments", {
    amount: 1599,
    currency: "EUR",
    merchant_connector_details: { connector_name: "stripe" },
  });

  assert.equal(response.status, 403);
  assert.equal(
    (await response.json()).error.code,
    "beta_inline_credentials_blocked",
  );
  assert.equal(receivedRequests.length, beforeCount);
});

test("blocks inline credentials on payment confirm routes", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest("/payments/pay_example/confirm", {
    merchant_connector_details: { connector_name: "stripe" },
    payment_token: "pm_test_processor_token",
  });

  assert.equal(response.status, 403);
  assert.equal(
    (await response.json()).error.code,
    "beta_inline_credentials_blocked",
  );
  assert.equal(receivedRequests.length, beforeCount);
});

test("blocks raw card data on v1 payment confirm", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest("/payments/pay_example/confirm", {
    payment_method_data: {
      card: {
        card_cvc: "123",
        card_exp_month: "12",
        card_exp_year: "30",
        card_number: "4111111111111111",
      },
    },
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "beta_raw_card_data_blocked");
  assert.equal(receivedRequests.length, beforeCount);
});

test("blocks raw card data on v2 payment intent confirm", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/v2/payments/pay_example/confirm-intent",
    {
      payment_method_data: {
        card: {
          card_cvc: "123",
          card_exp_month: "12",
          card_exp_year: "30",
          card_number: "4111111111111111",
        },
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "beta_raw_card_data_blocked");
  assert.equal(receivedRequests.length, beforeCount);
});

test("blocks raw card data on PUT payment updates", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/v2/payments/pay_example",
    {
      payment_method_data: {
        card: {
          card_number: "4111111111111111",
        },
      },
    },
    { method: "PUT" },
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "beta_raw_card_data_blocked");
  assert.equal(receivedRequests.length, beforeCount);
});

test("blocks inline credentials on PATCH payment updates", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/payments/pay_example",
    {
      metadata: {
        merchant_connector_details: { connector_name: "stripe" },
      },
    },
    { method: "PATCH" },
  );

  assert.equal(response.status, 403);
  assert.equal(
    (await response.json()).error.code,
    "beta_inline_credentials_blocked",
  );
  assert.equal(receivedRequests.length, beforeCount);
});

test("blocks VGS aliases on payment confirm until rollout activation", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/payments/pay_example/confirm",
    externalVaultPaymentPayload(),
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "beta_vgs_eu_not_enabled");
  assert.equal(receivedRequests.length, beforeCount);
});

test("rejects raw-looking values disguised as VGS aliases", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/payments/pay_example/confirm",
    externalVaultPaymentPayload({ card_cvc: "123" }),
    { baseUrl: vgsGatewayUrl },
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "beta_vgs_alias_required");
  assert.equal(receivedRequests.length, beforeCount);
});

test("forwards UUID-style VGS aliases on v1 confirm when enabled", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/payments/pay_example/confirm",
    externalVaultPaymentPayload(),
    { baseUrl: vgsGatewayUrl },
  );

  assert.equal(response.status, 200);
  assert.equal(receivedRequests.length, beforeCount + 1);
  assert.equal(receivedRequests.at(-1).url, "/payments/pay_example/confirm");
});

test("forwards UUID-style VGS aliases on v2 external-vault confirm", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/v2/payments/pay_example/confirm-intent/external-vault-proxy",
    {
      payment_method_data: {
        proxy_card: externalVaultCardAliases(),
      },
      payment_method_subtype: "credit",
      payment_method_type: "card",
    },
    { baseUrl: vgsGatewayUrl },
  );

  assert.equal(response.status, 200);
  assert.equal(receivedRequests.length, beforeCount + 1);
});

test("requires a UUID-style CVC alias on v2 vault-token confirms", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest(
    "/v2/payments/pay_example/confirm-intent/external-vault-proxy",
    {
      payment_method_data: {
        vault_token: {},
      },
      payment_method_subtype: "credit",
      payment_method_type: "card",
      payment_token: "pm_external_vault_token",
    },
    { baseUrl: vgsGatewayUrl },
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "beta_vgs_alias_required");
  assert.equal(receivedRequests.length, beforeCount);
});

test("keeps stored Stripe processor-token confirms available", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest("/payments/pay_example/confirm", {
    payment_method: "card",
    payment_method_type: "credit",
    payment_token: "pm_test_processor_token",
  });

  assert.equal(response.status, 200);
  assert.equal(receivedRequests.length, beforeCount + 1);
});

test("blocks live credentials nested in payment confirm", async () => {
  const beforeCount = receivedRequests.length;
  const response = await jsonRequest("/payments/pay_example/confirm", {
    metadata: { accidental_key: "sk_live_example_blocked_value" },
    payment_token: "pm_test_processor_token",
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "beta_live_credential_blocked");
  assert.equal(receivedRequests.length, beforeCount);
});

test("proxies ordinary API requests", async () => {
  const response = await fetch(`${gatewayUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-hyperswitch-beta-mode"), "stripe-test-only");
  assert.deepEqual(await response.json(), { upstream: true });
});

function jsonRequest(
  pathname,
  payload,
  { baseUrl = gatewayUrl, method = "POST" } = {},
) {
  return fetch(`${baseUrl}${pathname}`, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    method,
  });
}

function vgsPayload(overrides = {}) {
  return {
    connector_account_details: {
      api_key: "sandbox_service_account_id",
      api_secret: "sandbox_eu_vault_id",
      auth_type: "SignatureKey",
      key1: "sandbox_service_account_password",
    },
    connector_name: "vgs",
    connector_type: "vault_processor",
    test_mode: true,
    ...overrides,
  };
}

function externalVaultPaymentPayload(aliasOverrides = {}) {
  return {
    payment_method: "card",
    payment_method_data: {
      vault_data_card: externalVaultCardAliases(aliasOverrides),
    },
    payment_method_type: "credit",
  };
}

function externalVaultCardAliases(overrides = {}) {
  return {
    card_cvc: "tok_sandbox_cvc_alias",
    card_exp_month: "tok_sandbox_exp_month_alias",
    card_exp_year: "tok_sandbox_exp_year_alias",
    card_holder_name: "tok_sandbox_holder_alias",
    card_number: "tok_sandbox_pan_alias",
    ...overrides,
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function serverUrl(server) {
  const address = server.address();
  assert(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}
