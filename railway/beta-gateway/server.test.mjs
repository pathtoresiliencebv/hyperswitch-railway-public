import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

import { createBetaGateway } from "./server.mjs";

let gateway;
let gatewayUrl;
let upstream;
let upstreamUrl;
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
});

after(async () => {
  await Promise.all([close(gateway), close(upstream)]);
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
    inline_connector_credentials: "blocked",
    live_credentials: "blocked",
    mode: "sandbox_beta",
  });
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

test("proxies ordinary API requests", async () => {
  const response = await fetch(`${gatewayUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-hyperswitch-beta-mode"), "stripe-test-only");
  assert.deepEqual(await response.json(), { upstream: true });
});

function jsonRequest(pathname, payload) {
  return fetch(`${gatewayUrl}${pathname}`, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
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
