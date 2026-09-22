import { Log } from "@/util/log"

const log = Log.create({ service: "ead-proxy" })
const PING = "/__ead_proxy_ping"
const LOCAL = [5180, 5181, 5182, 5183, 5184, 5185]
const PROD = [5190, 5191, 5192, 5193, 5194, 5195]

let server: ReturnType<typeof Bun.serve> | undefined
let bound = 0
let upstream = ""

/** Map `/api/crawl-vision/*` Playwright endpoints → local executor paths. */
export function crawl(requestUrl: string): string | null {
  const url = URL.canParse(requestUrl, "http://127.0.0.1") ? new URL(requestUrl, "http://127.0.0.1") : undefined
  if (!url) return null
  if (!url.pathname.startsWith("/api/crawl-vision/")) return null
  const rest = url.pathname.slice("/api/crawl-vision".length)
  if (
    rest === "/coding-tool-discovery" ||
    rest.startsWith("/coding-tool-discovery/") ||
    rest === "/interpret-dynamic-tops" ||
    rest.startsWith("/interpret-dynamic-tops/")
  ) {
    return null
  }
  if (rest === "/discover" || rest.startsWith("/discover/")) return `/crawl-pfm-tree${url.search}`
  if (rest === "/sessions" || rest.startsWith("/sessions/")) {
    return `/crawl-pfm-sessions${rest.slice("/sessions".length)}${url.search}`
  }
  return null
}

export function rewrite(plugin: string, port: number) {
  const parsed = new URL(plugin)
  return `http://127.0.0.1:${port}${parsed.pathname}${parsed.search}`
}

export function allowed(raw: string) {
  const url = URL.canParse(raw) ? new URL(raw) : undefined
  if (!url) return ""
  const host = url.hostname.toLowerCase()
  if (url.protocol === "https:" && (host === "eadfm.com" || host === "www.eadfm.com")) {
    return `${url.protocol}//${url.host}`
  }
  if (url.protocol !== "http:") return ""
  if (host !== "127.0.0.1" && host !== "localhost") return ""
  const port = url.port || "80"
  if (port !== "5173" && port !== "3000") return ""
  return `http://${host}:${port}`
}

function executor() {
  return (process.env.EAD_TEST_EXECUTOR_URL || "http://127.0.0.1:8082").replace(/\/+$/, "")
}

async function ping(port: number, want: string) {
  const res = await fetch(`http://127.0.0.1:${port}${PING}`, { signal: AbortSignal.timeout(750) }).catch(() => undefined)
  if (!res?.ok) return false
  return (res.headers.get("x-ead-proxy-target") || "").replace(/\/+$/, "") === want.replace(/\/+$/, "")
}

function result(target: string, port: number) {
  return { origin: `http://127.0.0.1:${port}`, port, target }
}

export async function ensure(serverUrl: string) {
  const target = allowed(serverUrl)
  if (!target) throw new Error("unsupported EAD proxy target")
  if (server && upstream === target && bound > 0 && (await ping(bound, target))) return result(target, bound)
  await stop()
  const port = await listen(target, serverUrl)
  return result(target, port)
}

export async function stop() {
  if (!server) {
    bound = 0
    upstream = ""
    return
  }
  const current = server
  server = undefined
  bound = 0
  upstream = ""
  current.stop(true)
}

async function listen(target: string, serverUrl: string) {
  const candidates = /eadfm\.com/i.test(serverUrl) ? PROD : LOCAL
  for (const port of candidates) {
    if (await ping(port, target)) continue
    const next = serve(target, port)
    if (!next?.port) continue
    server = next
    bound = next.port
    upstream = target
    log.info("listening", { port: bound, target })
    return bound
  }
  throw new Error(`Could not bind EAD plugin proxy on ports ${candidates[0]}–${candidates[candidates.length - 1]}`)
}

function serve(target: string, port: number) {
  try {
    return Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch: (req) => handle(req, target, port),
    })
  } catch {
    return
  }
}

export async function handle(req: Request, target: string, port: number) {
  const url = new URL(req.url)
  if (url.pathname === PING || url.pathname.startsWith(`${PING}/`)) {
    return new Response("ok", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-ead-proxy-target": target,
        "x-ead-proxy-host": "kloudcode",
        "cache-control": "no-store",
      },
    })
  }

  const mapped = crawl(url.pathname + url.search)
  if (mapped) return pipe(req, executor(), mapped, { crawl: true, port, target })
  return pipe(req, target, url.pathname + url.search, { port, target })
}

async function pipe(
  req: Request,
  dest: string,
  path: string,
  opts: { crawl?: boolean; port: number; target: string },
) {
  const base = dest.replace(/\/+$/, "")
  const headers = new Headers(req.headers)
  headers.set("host", new URL(base).host)
  headers.set("origin", base)
  if (opts.crawl) headers.delete("accept-encoding")
  else headers.set("accept-encoding", "gzip, deflate, br")
  const referer = headers.get("referer")
  if (referer?.includes("127.0.0.1")) {
    const ref = URL.canParse(referer) ? new URL(referer) : undefined
    if (ref) headers.set("referer", `${base}${ref.pathname}${ref.search}`)
    else headers.delete("referer")
  }
  headers.delete("connection")
  headers.delete("keep-alive")
  headers.delete("transfer-encoding")

  const method = req.method.toUpperCase()
  const upstream = await fetch(`${base}${path}`, {
    method: req.method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : req.body,
    redirect: "manual",
  }).catch((err: unknown) => err)

  if (!(upstream instanceof Response)) {
    const detail = upstream instanceof Error ? upstream.message : "Unknown proxy error"
    const refused = /ECONNREFUSED|connection refused/i.test(detail)
    if (opts.crawl) {
      return Response.json(
        {
          error: refused
            ? "Crawl executor is not running on this computer (port 8082). Start the ead-test executor, then try Explore again. Target URLs such as http://localhost:8088 are opened by Playwright on your machine — not on eadfm.com."
            : `Crawl executor request failed: ${detail}`,
          executorUrl: base,
        },
        { status: 503 },
      )
    }
    return new Response(`EAD plugin proxy could not reach ${base}: ${detail}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    })
  }

  const out = new Headers(upstream.headers)
  out.delete("content-security-policy")
  out.delete("x-frame-options")
  out.delete("content-encoding")
  out.delete("content-length")
  out.delete("transfer-encoding")
  out.set("x-ead-proxy-target", opts.crawl ? base : opts.target)
  if (opts.crawl) out.set("x-ead-crawl-executor", "local")

  const loc = out.get("location")
  if (loc && !opts.crawl) {
    const next = URL.canParse(loc, opts.target) ? new URL(loc, opts.target) : undefined
    if (next && next.origin === new URL(opts.target).origin) {
      out.set("location", `http://127.0.0.1:${opts.port}${next.pathname}${next.search}${next.hash}`)
    }
  }

  return new Response(upstream.body, { status: upstream.status, headers: out })
}
