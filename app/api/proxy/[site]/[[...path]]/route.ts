import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
import http from "node:http";

const TARGETS: Record<string, string> = {
  webapp: "https://transportationsolutions.abb.com",
  "abb-global": "https://www.abb.com",
};

const DEFAULT_PATHS: Record<string, string> = {
  webapp: "/",
  "abb-global": "/global/en",
};

const STRIP_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "x-content-security-policy",
  "x-webkit-csp",
]);

const agent = new https.Agent({ rejectUnauthorized: false });

function proxyFetch(
  url: string,
  headers: Record<string, string>
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, headers }, (res) => {
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        const redirect = res.headers.location.startsWith("http")
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        proxyFetch(redirect, headers).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 200,
          headers: res.headers,
          body: Buffer.concat(chunks),
        })
      );
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

function buildInterceptScript(site: string, origin: string): string {
  return `<script data-proxy="true">
(function(){
  var P="/api/proxy/${site}/";
  var O="${origin}";
  function rw(u){
    if(typeof u!=="string")return u;
    if(u.startsWith(O+"/"))return P+u.slice(O.length+1);
    if(u.startsWith("/")&&!u.startsWith("/api/")&&!u.startsWith("/_next/"))return P+u.slice(1);
    return u;
  }
  var _f=window.fetch;
  window.fetch=function(u,o){
    if(typeof u==="string"){u=rw(u);}
    else if(u instanceof Request&&u.url!==rw(u.url)){u=new Request(rw(u.url),u);}
    return _f.call(this,u,o);
  };
  var _o=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    arguments[1]=rw(u);
    return _o.apply(this,arguments);
  };
})();
</script>`;
}

function rewriteHtml(html: string, site: string, origin: string): string {
  const proxyBase = `/api/proxy/${site}/`;

  html = html.replaceAll(`"${origin}/`, `"${proxyBase}`);
  html = html.replaceAll(`'${origin}/`, `'${proxyBase}`);

  html = html.replace(
    /((?:src|href|action|srcset|poster|data-src|data-href)\s*=\s*)(["'])\/(?!api\/|_next\/)/gi,
    `$1$2${proxyBase}`
  );

  html = html.replace(
    /url\(\s*(['"]?)\/(?!api\/|_next\/)/gi,
    `url($1${proxyBase}`
  );

  return html;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ site: string; path?: string[] }> }
) {
  const { site, path } = await params;
  const origin = TARGETS[site];
  if (!origin) {
    return NextResponse.json({ error: "Unknown site" }, { status: 404 });
  }

  const extraPath =
    path && path.length > 0 ? "/" + path.join("/") : DEFAULT_PATHS[site];
  const search = request.nextUrl.search ?? "";
  const targetUrl = `${origin}${extraPath}${search}`;

  try {
    const upstream = await proxyFetch(targetUrl, {
      "User-Agent": request.headers.get("user-agent") ?? "",
      Accept: request.headers.get("accept") ?? "text/html",
      "Accept-Encoding": "identity",
    });

    const contentType = upstream.headers["content-type"] ?? "";
    const isHtml = contentType.includes("text/html");

    if (!isHtml) {
      const res = new NextResponse(new Uint8Array(upstream.body), { status: upstream.status });
      for (const [key, value] of Object.entries(upstream.headers)) {
        if (value && !STRIP_HEADERS.has(key.toLowerCase())) {
          res.headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
      }
      STRIP_HEADERS.forEach((h) => res.headers.delete(h));
      return res;
    }

    let html = upstream.body.toString("utf-8");

    const interceptScript = buildInterceptScript(site, origin);
    html = html.replace(/<head([^>]*)>/i, `<head$1>${interceptScript}`);
    html = rewriteHtml(html, site, origin);

    const res = new NextResponse(html, { status: upstream.status });
    res.headers.set("content-type", contentType);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
