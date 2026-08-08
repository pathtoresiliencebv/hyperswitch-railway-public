import http from "node:http";
import { spawn } from "node:child_process";

import { injectBetaBanner } from "./beta-banner.mjs";

const publicPort = Number.parseInt(process.env.PORT ?? "9001", 10);
const upstreamPort = Number.parseInt(
  process.env.CONTROL_CENTER_UPSTREAM_PORT ?? "9000",
  10,
);

if (!Number.isInteger(publicPort) || !Number.isInteger(upstreamPort)) {
  throw new Error("PORT and CONTROL_CENTER_UPSTREAM_PORT must be integers");
}

const dashboard = spawn("npm", ["run", "serve"], {
  env: { ...process.env, PORT: String(upstreamPort) },
  stdio: "inherit",
});

const blockedUpstreamHeaders = new Set([
  "access-control-allow-headers",
  "access-control-allow-origin",
  "x-powered-by",
]);

const securityHeaders = {
  "Content-Security-Policy":
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const proxy = http.createServer((request, response) => {
  const upstreamRequest = http.request(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: request.url,
      method: request.method,
      headers: {
        ...request.headers,
        "accept-encoding": "identity",
        "x-forwarded-host": request.headers.host ?? "",
        "x-forwarded-proto": "https",
      },
    },
    (upstreamResponse) => {
      response.statusCode = upstreamResponse.statusCode ?? 502;

      const contentType = String(upstreamResponse.headers["content-type"] ?? "");
      const shouldInjectBanner =
        response.statusCode === 200 && contentType.toLowerCase().includes("text/html");

      for (const [name, value] of Object.entries(upstreamResponse.headers)) {
        if (
          value !== undefined &&
          !blockedUpstreamHeaders.has(name) &&
          (!shouldInjectBanner || !["content-length", "etag"].includes(name))
        ) {
          response.setHeader(name, value);
        }
      }

      for (const [name, value] of Object.entries(securityHeaders)) {
        response.setHeader(name, value);
      }

      if (!shouldInjectBanner) {
        upstreamResponse.pipe(response);
        return;
      }

      const chunks = [];
      upstreamResponse.on("data", (chunk) => chunks.push(chunk));
      upstreamResponse.on("end", () => {
        const source = Buffer.concat(chunks).toString("utf8");
        const html = injectBetaBanner(source, process.env.BETA_GUIDE_URL);
        const body = Buffer.from(html);
        response.setHeader("Content-Length", String(body.length));
        response.setHeader("Cache-Control", "no-store");
        response.end(body);
      });
    },
  );

  upstreamRequest.on("error", (error) => {
    if (!response.headersSent) {
      response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    }
    response.end("Control center is starting. Please retry shortly.\n");
    console.error("Control center upstream error", error.message);
  });

  request.pipe(upstreamRequest);
});

proxy.listen(publicPort, "0.0.0.0", () => {
  console.log(
    `Security proxy listening on 0.0.0.0:${publicPort}, upstream 127.0.0.1:${upstreamPort}`,
  );
});

dashboard.on("exit", (code, signal) => {
  console.error(
    `Control center server exited (code=${String(code)}, signal=${String(signal)})`,
  );
  proxy.close(() => process.exit(code ?? 1));
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down control center`);
  proxy.close(() => dashboard.kill(signal));
  setTimeout(() => dashboard.kill("SIGKILL"), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
