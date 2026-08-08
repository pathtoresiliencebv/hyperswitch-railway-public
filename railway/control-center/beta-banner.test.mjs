import assert from "node:assert/strict";
import test from "node:test";

import { injectBetaBanner } from "./beta-banner.mjs";

const source =
  '<!doctype html><html lang="en"><head><title>Dashboard</title></head><body><div id="app"></div></body></html>';

test("injects one semantic in-flow beta notice before the application", () => {
  const output = injectBetaBanner(source, "https://example.com/guide");

  assert.match(output, /<aside id="hyperswitch-beta-notice"/);
  assert.match(output, /aria-label="Sandbox beta restrictions"/);
  assert.match(output, /Test mode only/);
  assert.match(output, /opens in a new tab/);
  assert.match(output, /min-height:2\.75rem/);
  assert.match(output, /:focus-visible/);
  assert.match(output, /#app \.mobile\\:w-30-rem/);
  assert.match(output, /#app \.w-96\{width:100%!important/);
  assert.ok(
    output.indexOf('id="hyperswitch-beta-notice"') <
      output.indexOf('id="app"'),
  );
});

test("does not duplicate an existing notice", () => {
  const once = injectBetaBanner(source);
  const twice = injectBetaBanner(once);

  assert.equal(twice, once);
  assert.equal(twice.match(/id="hyperswitch-beta-notice"/g)?.length, 1);
});

test("escapes the configured guide URL", () => {
  const output = injectBetaBanner(source, 'https://example.com/?q="unsafe"&x=1');
  assert.match(output, /q=&quot;unsafe&quot;&amp;x=1/);
});
