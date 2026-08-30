import http from "node:http";
import { pathToFileURL } from "node:url";

import {
  evaluateBetaPolicy,
  requestNeedsPolicyInspection,
} from "./policy.mjs";

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const inspectedBodyLimit = 1024 * 1024;

export function createBetaGateway({
  upstreamUrl,
  requestTimeoutMs = 60_000,
  rateLimitPerMinute = 240,
  vgsEuSandboxEnabled = environmentFlagEnabled(
    process.env.VGS_EU_SANDBOX_ENABLED,
  ),
  vgsEuSandboxVaultIds = environmentList(
    process.env.VGS_EU_SANDBOX_VAULT_IDS,
  ),
} = {}) {
  const upstream = new URL(
    upstreamUrl ??
      process.env.HYPERSWITCH_UPSTREAM_URL ??
      "http://router.railway.internal:8080",
  );

  if (upstream.protocol !== "http:") {
    throw new Error("HYPERSWITCH_UPSTREAM_URL must use http inside Railway");
  }

  if (vgsEuSandboxEnabled && vgsEuSandboxVaultIds.length === 0) {
    throw new Error(
      "VGS_EU_SANDBOX_VAULT_IDS must contain a verified EU sandbox vault ID when VGS is enabled",
    );
  }

  const rateLimiter = createRateLimiter(rateLimitPerMinute);

  const server = http.createServer(async (request, response) => {
    try {
      if (!rateLimiter.allow(clientIdentifier(request))) {
        sendJson(response, 429, {
          error: {
            code: "beta_rate_limit_exceeded",
            message: "Too many requests. Retry after one minute.",
            type: "rate_limit_error",
          },
        });
        return;
      }

      const requestUrl = new URL(request.url ?? "/", "http://gateway.invalid");

      if (requestUrl.pathname === "/gateway-health") {
        sendJson(response, 200, {
          mode: "stripe_test_only",
          status: "ok",
        });
        return;
      }

      if (requestUrl.pathname === "/beta-policy") {
        sendJson(response, 200, {
          connectors: "stripe_test_only",
          external_vault: vgsEuSandboxEnabled
            ? "vgs_eu_sandbox"
            : "vgs_eu_pending",
          inline_connector_credentials: "blocked",
          live_credentials: "blocked",
          mode: "sandbox_beta",
          raw_card_data: "blocked",
          vgs_alias_format: "uuid_only",
        });
        return;
      }

      if (request.method === "CONNECT" || request.headers.upgrade) {
        sendJson(response, 405, {
          error: {
            code: "beta_protocol_not_allowed",
            message: "Protocol upgrades are not available on this API gateway.",
            type: "invalid_request",
          },
        });
        return;
      }

      let bufferedBody;
      if (
        requestNeedsPolicyInspection(request.method ?? "GET", requestUrl.pathname)
      ) {
        bufferedBody = await readJsonBody(request, inspectedBodyLimit);
        const policy = evaluateBetaPolicy(
          request.method ?? "GET",
          requestUrl.pathname,
          bufferedBody.parsed,
          { vgsEuSandboxEnabled, vgsEuSandboxVaultIds },
        );

        if (!policy.allowed) {
          sendJson(response, 403, {
            error: {
              code: policy.code,
              message: policy.message,
              type: "invalid_request",
            },
          });
          return;
        }
      }

      proxyRequest({
        bufferedBody: bufferedBody?.raw,
        request,
        requestTimeoutMs,
        response,
        upstream,
      });
    } catch (error) {
      const statusCode = error?.statusCode ?? 400;
      sendJson(response, statusCode, {
        error: {
          code: error?.code ?? "beta_invalid_request",
          message: error?.publicMessage ?? "The request could not be processed.",
          type: "invalid_request",
        },
      });
    }
  });

  server.on("clientError", (_error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  return server;
}

function proxyRequest({
  bufferedBody,
  request,
  requestTimeoutMs,
  response,
  upstream,
}) {
  const headers = forwardedHeaders(request, upstream, bufferedBody);
  const upstreamPath = `${upstream.pathname.replace(/\/$/, "")}${
    request.url ?? "/"
  }`;

  const upstreamRequest = http.request(
    {
      headers,
      hostname: upstream.hostname,
      method: request.method,
      path: upstreamPath,
      port: upstream.port || 80,
    },
    (upstreamResponse) => {
      response.statusCode = upstreamResponse.statusCode ?? 502;

      for (const [name, value] of Object.entries(upstreamResponse.headers)) {
        if (value !== undefined && !hopByHopHeaders.has(name.toLowerCase())) {
          response.setHeader(name, value);
        }
      }

      response.setHeader("X-Hyperswitch-Beta-Mode", "stripe-test-only");
      upstreamResponse.pipe(response);
    },
  );

  upstreamRequest.setTimeout(requestTimeoutMs, () => {
    upstreamRequest.destroy(new Error("Upstream request timed out"));
  });

  upstreamRequest.on("error", (error) => {
    if (!response.headersSent) {
      sendJson(response, 502, {
        error: {
          code: "beta_upstream_unavailable",
          message: "The payment API is temporarily unavailable.",
          type: "api_error",
        },
      });
    } else {
      response.destroy(error);
    }
  });

  if (bufferedBody !== undefined) {
    upstreamRequest.end(bufferedBody);
  } else {
    request.pipe(upstreamRequest);
  }
}

function forwardedHeaders(request, upstream, bufferedBody) {
  const headers = {};

  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined && !hopByHopHeaders.has(name.toLowerCase())) {
      headers[name] = value;
    }
  }

  const existingForwardedFor = request.headers["x-forwarded-for"];
  const remoteAddress = request.socket.remoteAddress ?? "unknown";
  headers.host = upstream.host;
  headers["x-forwarded-for"] = existingForwardedFor
    ? `${existingForwardedFor}, ${remoteAddress}`
    : remoteAddress;
  headers["x-forwarded-host"] = request.headers.host ?? "";
  headers["x-forwarded-proto"] = "https";

  if (bufferedBody !== undefined) {
    headers["content-length"] = String(bufferedBody.length);
  }

  return headers;
}

async function readJsonBody(request, maximumBytes) {
  const contentType = String(request.headers["content-type"] ?? "");
  if (!contentType.toLowerCase().includes("application/json")) {
    throw publicError(
      415,
      "beta_json_required",
      "This protected endpoint requires an application/json request body.",
    );
  }

  const chunks = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;
    if (receivedBytes > maximumBytes) {
      throw publicError(
        413,
        "beta_request_too_large",
        "The request body exceeds the 1 MiB beta gateway limit.",
      );
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks);
  try {
    return { parsed: JSON.parse(raw.toString("utf8")), raw };
  } catch {
    throw publicError(
      400,
      "beta_invalid_json",
      "The request body is not valid JSON.",
    );
  }
}

function createRateLimiter(limitPerMinute) {
  let windowStartedAt = Date.now();
  const counts = new Map();

  return {
    allow(identifier) {
      const now = Date.now();
      if (now - windowStartedAt >= 60_000) {
        counts.clear();
        windowStartedAt = now;
      }

      const nextCount = (counts.get(identifier) ?? 0) + 1;
      counts.set(identifier, nextCount);
      return nextCount <= limitPerMinute;
    },
  };
}

function clientIdentifier(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] ?? "")
    .split(",")[0]
    .trim();
  return forwardedFor || request.socket.remoteAddress || "unknown";
}

function publicError(statusCode, code, publicMessage) {
  const error = new Error(publicMessage);
  error.code = code;
  error.publicMessage = publicMessage;
  error.statusCode = statusCode;
  return error;
}

function environmentFlagEnabled(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function environmentList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sendJson(response, statusCode, payload) {
  if (response.headersSent) {
    return;
  }

  const body = Buffer.from(`${JSON.stringify(payload)}\n`);
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": String(body.length),
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Hyperswitch-Beta-Mode": "stripe-test-only",
  });
  response.end(body);
}

async function run() {
  const port = Number.parseInt(process.env.PORT ?? "8080", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const server = createBetaGateway();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Beta gateway listening on 0.0.0.0:${port}`);
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}; shutting down beta gateway`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
