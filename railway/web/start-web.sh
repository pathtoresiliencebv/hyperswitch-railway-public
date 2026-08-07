#!/usr/bin/env bash
set -euo pipefail

: "${ENV_BACKEND_URL:=https://sandbox.hyperswitch.io}"

node <<'NODE'
const fs = require("fs");

const configPath = "/usr/src/app/webpack.dev.js";
const backendBase = (process.env.ENV_BACKEND_URL || "https://sandbox.hyperswitch.io").replace(/\/+$/, "");
const backendPayments = `${backendBase}/payments`;

let source = fs.readFileSync(configPath, "utf8");
source = source.replace(
  'local: "https://sandbox.hyperswitch.io/payments", // Default or local environment endpoint',
  `local: ${JSON.stringify(backendPayments)}, // Railway backend endpoint`
);

if (!source.includes('allowedHosts: "all"')) {
  source = source.replace("const devServer = {\n", 'const devServer = {\n  allowedHosts: "all",\n');
}

fs.writeFileSync(configPath, source);
NODE

exec npm run start
