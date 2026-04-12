import type { Context, Config } from "@netlify/edge-functions";

// ---------------------------------------------------------------------------
// Universal trailing-slash normalizer
// ---------------------------------------------------------------------------
// Netlify's default behavior 301-redirects /path → /path/ for directory-style
// pages. Google Search Console reports every such redirect as
// "Page with redirect", hurting indexing.
//
// This edge function intercepts requests WITHOUT a trailing slash and
// internally rewrites them to the trailing-slash version so the response is
// a direct 200 — no redirect ever reaches Google.
//
// The canonical <link> on every page already points to the trailing-slash URL,
// so Google consolidates correctly without any mixed signals.
// ---------------------------------------------------------------------------

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const { pathname } = url;

  // 1. Already has trailing slash or is the root — nothing to do
  if (pathname === "/" || pathname.endsWith("/")) {
    return; // empty return = skip (most performant per Netlify docs)
  }

  // 2. Has a file extension (e.g. .css, .js, .xml, .jpg, .png, .ico, .woff2)
  //    These are real files — let them pass through unchanged
  if (/\.[a-zA-Z0-9]{1,10}$/.test(pathname)) {
    return;
  }

  // 3. Rewrite: serve the trailing-slash version's content at this URL
  //    This avoids Netlify's implicit 301 redirect
  const trailingUrl = new URL(url);
  trailingUrl.pathname = pathname + "/";
  const modifiedReq = new Request(trailingUrl.toString(), {
    method: req.method,
    headers: req.headers,
  });
  return context.nextRequest(modifiedReq);
};

export const config: Config = {
  path: "/*",
  excludedPath: ["/go/*", "/api/*", "/.netlify/*"],
  onError: "bypass",
};
