const defaultGuideUrl =
  "https://github.com/pathtoresiliencebv/hyperswitch-railway-public/blob/main/docs/SANDBOX_QUICKSTART.md";

export function injectBetaBanner(html, guideUrl = defaultGuideUrl) {
  if (html.includes('id="hyperswitch-beta-notice"')) {
    return html;
  }

  const safeGuideUrl = escapeAttribute(guideUrl);
  const styles = `<style id="hyperswitch-beta-notice-styles">
#hyperswitch-beta-notice{box-sizing:border-box;width:100%;padding:.625rem 1rem;background:#172033;color:#fff;border-bottom:.25rem solid #f7c948;display:flex;align-items:center;justify-content:center;gap:.75rem;flex-wrap:wrap;font:600 .875rem/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;position:relative;z-index:2147483647}
#hyperswitch-beta-notice strong{font-size:1rem}
#hyperswitch-beta-notice a{color:#fff;text-decoration:underline;text-decoration-thickness:.125rem;text-underline-offset:.2em;display:inline-flex;align-items:center;min-height:2.75rem;padding:0 .5rem;border-radius:.25rem}
#hyperswitch-beta-notice a:hover{text-decoration-thickness:.2rem}
#hyperswitch-beta-notice a:focus-visible{outline:.1875rem solid #f7c948;outline-offset:.1875rem}
#hyperswitch-beta-notice .hs-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
@media(max-width:30rem){#hyperswitch-beta-notice{align-items:flex-start;justify-content:flex-start;padding:.75rem}#hyperswitch-beta-notice a{box-sizing:border-box;width:100%;justify-content:center;border:.125rem solid currentColor}#app{min-width:0}#app .mobile\\:w-30-rem{box-sizing:border-box;width:100%!important;max-width:30rem;padding-inline:.75rem}#app .w-96{width:100%!important;max-width:100%}#app .w-screen{width:100%!important}}
</style>`;
  const notice = `<aside id="hyperswitch-beta-notice" aria-label="Sandbox beta restrictions">
<span aria-hidden="true">⚠</span>
<strong>Sandbox beta</strong>
<span>Test mode only. Do not use real customer data or live payment credentials. Email recovery is unavailable.</span>
<a href="${safeGuideUrl}" target="_blank" rel="noopener noreferrer">Open the safe test guide<span class="hs-visually-hidden"> (opens in a new tab)</span></a>
</aside>`;

  const withStyles = html.includes("</head>")
    ? html.replace("</head>", `${styles}</head>`)
    : `${styles}${html}`;

  const appMarker = '<div id="app">';
  if (withStyles.includes(appMarker)) {
    return withStyles.replace(appMarker, `${notice}${appMarker}`);
  }

  return withStyles.replace(/<body([^>]*)>/i, `<body$1>${notice}`);
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
