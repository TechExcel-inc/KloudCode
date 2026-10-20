import { afterEach, describe, expect, test } from "bun:test"
import { allowed, crawl, ensure, handle, rewrite, stop, unreachable } from "../../src/ead/proxy"

afterEach(async () => {
  await stop()
})

describe("ead plugin proxy", () => {
  test("maps crawl-vision paths to the local executor", () => {
    expect(crawl("/api/crawl-vision/discover?x=1")).toBe("/crawl-pfm-tree?x=1")
    expect(crawl("/api/crawl-vision/sessions/abc")).toBe("/crawl-pfm-sessions/abc")
    expect(crawl("/api/crawl-vision/coding-tool-discovery")).toBe(null)
    expect(crawl("/api/crawl-vision/interpret-dynamic-tops")).toBe(null)
    expect(crawl("/api/foo")).toBe(null)
  })

  test("allows eadfm and local vite only", () => {
    expect(allowed("https://eadfm.com")).toBe("https://eadfm.com")
    expect(allowed("https://eadfm.com/plugin/ai-code")).toBe("https://eadfm.com")
    expect(allowed("http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173")
    expect(allowed("http://localhost:3000")).toBe("http://localhost:3000")
    expect(allowed("http://127.0.0.1:8088")).toBe("")
    expect(allowed("https://evil.example")).toBe("")
  })

  test("rewrites plugin url onto the proxy port", () => {
    expect(rewrite("https://eadfm.com/plugin/ai-code?mode=cursor", 5190)).toBe(
      "http://127.0.0.1:5190/plugin/ai-code?mode=cursor",
    )
  })

  test("strips frame blockers and rewrites location", async () => {
    using up = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === "/plugin/ai-code") {
          return new Response("pilot", {
            headers: {
              "content-security-policy": "frame-ancestors 'none'",
              "x-frame-options": "DENY",
            },
          })
        }
        if (url.pathname === "/go") {
          return new Response(null, { status: 302, headers: { location: "/plugin/ai-code" } })
        }
        return new Response("no", { status: 404 })
      },
    })
    const target = `http://127.0.0.1:${up.port}`
    const page = await handle(new Request("http://127.0.0.1:5190/plugin/ai-code"), target, 5190)
    expect(page.status).toBe(200)
    expect(await page.text()).toBe("pilot")
    expect(page.headers.get("content-security-policy")).toBeNull()
    expect(page.headers.get("x-frame-options")).toBeNull()

    const go = await handle(new Request("http://127.0.0.1:5190/go"), target, 5190)
    expect(go.status).toBe(302)
    expect(go.headers.get("location")).toBe("http://127.0.0.1:5190/plugin/ai-code")
  })

  test("retries a page load that fails while eadfm.com is briefly unreachable", async () => {
    // Pick a free port, leave it closed for the first try, then start the server before the retry.
    const probe = Bun.serve({ port: 0, fetch: () => new Response("") })
    const port = probe.port
    probe.stop(true)
    let server: ReturnType<typeof Bun.serve> | undefined
    setTimeout(() => {
      server = Bun.serve({ port, fetch: () => new Response("<html>pilot</html>", { headers: { "content-type": "text/html" } }) })
    }, 100)
    try {
      const res = await handle(
        new Request("http://127.0.0.1:5190/plugin/ai-code", { headers: { accept: "text/html" } }),
        `http://127.0.0.1:${port}`,
        5190,
      )
      expect(res.status).toBe(200)
      expect(await res.text()).toBe("<html>pilot</html>")
    } finally {
      server?.stop(true)
    }
  })

  test("shows a self-refreshing page when eadfm.com stays unreachable", async () => {
    const probe = Bun.serve({ port: 0, fetch: () => new Response("") })
    const target = `http://127.0.0.1:${probe.port}`
    probe.stop(true)

    const page = await handle(new Request("http://127.0.0.1:5190/plugin/ai-code", { headers: { accept: "text/html" } }), target, 5190)
    expect(page.status).toBe(502)
    expect(page.headers.get("content-type")).toContain("text/html")
    const html = await page.text()
    expect(html).toContain('http-equiv="refresh" content="5"')
    expect(html).toContain(`Can't reach ${target} right now`)

    const api = await handle(new Request("http://127.0.0.1:5190/api/x", { headers: { accept: "application/json" } }), target, 5190)
    expect(api.status).toBe(502)
    expect(api.headers.get("content-type")).toContain("text/plain")
    expect(unreachable("https://eadfm.com", "<b>")).toContain("&lt;b&gt;")
  })

  test("ensure binds a loopback ping", async () => {
    const info = await ensure("http://127.0.0.1:5173")
    expect(info.origin.startsWith("http://127.0.0.1:518")).toBe(true)
    expect(info.target).toBe("http://127.0.0.1:5173")
    const ping = await fetch(`${info.origin}/__ead_proxy_ping`)
    expect(ping.ok).toBe(true)
    expect(ping.headers.get("x-ead-proxy-target")).toBe("http://127.0.0.1:5173")
    expect(ping.headers.get("x-ead-proxy-host")).toBe("kloudcode")
  })
})
