import { describe, expect, test } from "bun:test"
import {
  buildPilotShellUrl,
  buildPilotUrl,
  flagsFromAction,
  handlePluginMessage,
  hostClipboardCommand,
  openCrawlVision,
  openFindWizard,
  openHelpTip,
  openSetupMap,
  selectPfmSubSchema,
  updatePfmSelection,
} from "./bridge"
import { expandKey } from "./settings"
import { buildModal, formatModal, kindLabel } from "./context-modal"
import { clearPfmFilter, ownerSummary, readOwner, readPfmFilter, writeOwner, writePfmFilter } from "./filters"
import { formatJobCounts } from "./jobs"
import {
  buildTree,
  collectIds,
  filterByCount,
  filterByIds,
  filterDisplay,
  filterLinked,
  filterLinkedTree,
  filterPfm,
  filterSource,
  filteredCounts,
  hits,
  parseRows,
  pathIds,
  pathMatches,
  pathTrail,
  rollupCounts,
  underFolder,
} from "./source-tree"
import { collectProducts, collectGroups, productRole, formatSystemPrompt, authKind, parseFilterIds, parseOpenIds, parseFiles } from "./api"
import { queuePilot, takePilot, peekPilot, watchPilot } from "./actions"
import { t } from "./i18n"
import { beginDiag, formatDiag, noteDiag, readStartup } from "./diag"
import { applyEnv, eadApi, eadEnv, eadOrigin, eadServer, EAD_CURSOR_EXTENSION_VERSION, isEadHost } from "./urls"
import { tokenExpired } from "./auth"
import { mcpCandidates } from "./mcp"
import { enforce, VIRTUAL_MOVED, parseJson, configured } from "./top-level"
import { matches, parseBody, parseStep, SIGNAL, watch } from "./step-signal"

describe("ead urls", () => {
  test("tracks cursor extension version", () => {
    expect(EAD_CURSOR_EXTENSION_VERSION).toBe("1.0.222")
  })
})

describe("ead top-level", () => {
  const json = JSON.stringify([
    { name: "PPM Project Base", nodeId: 221, clientId: "dyn", isDynamic: true, sortOrder: 0 },
    { name: "User Manager", nodeId: 1143, clientId: "tl-um", isDynamic: false, sortOrder: 1 },
    { name: "System Settings", nodeId: 223, clientId: "tl-ss", isDynamic: false, sortOrder: 2 },
  ])

  test("orders configured tops and buckets extras", () => {
    const cfgs = parseJson(json, "PPM Project Base")
    expect(configured(cfgs)).toBe(true)
    expect(cfgs.map((n) => n.name)).toEqual(["PPM Project Base", "User Manager", "System Settings"])
    const next = enforce(
      [
        { nodeId: 221, nodeName: "PPM Project Base", children: [] },
        { nodeId: 1143, nodeName: "User Manager", children: [] },
        { nodeId: 223, nodeName: "System Settings", children: [{ nodeId: 1, nodeName: "Site Info" }] },
        { nodeId: 1546, nodeName: "Product Features", children: [] },
        { nodeId: 1547, nodeName: "Views", children: [] },
        { nodeId: 1543, nodeName: "To be moved", children: [{ nodeId: 99, nodeName: "Status Group" }] },
      ],
      {
        supportSubSchemas: true,
        topLevelNodesJson: json,
        dynamicTopLevelDisplayName: "PPM Project Base",
        dynamicTopLevelNodeId: 221,
      },
    )
    expect(next.map((n) => n.nodeName)).toEqual(["PPM Project Base", "User Manager", "System Settings", "To be moved"])
    expect(Number(next[3]?.nodeId)).toBe(1543)
    const names = (next[3]?.children || []).map((c) => c.nodeName)
    expect(names).toEqual(expect.arrayContaining(["Product Features", "Views", "Status Group"]))
    expect(names).not.toContain("System Settings")
  })

  test("uses virtual To be moved when no bucket exists", () => {
    const next = enforce(
      [
        { nodeId: 221, nodeName: "PPM Project Base", children: [] },
        { nodeId: 1143, nodeName: "User Manager", children: [] },
        { nodeId: 999, nodeName: "Orphan Module", children: [] },
      ],
      {
        supportSubSchemas: true,
        topLevelNodesJson: json,
        dynamicTopLevelDisplayName: "PPM Project Base",
      },
    )
    expect(Number(next[next.length - 1]?.nodeId)).toBe(VIRTUAL_MOVED)
  })
})

describe("ead auth", () => {
  test("tokenExpired reads jwt exp", () => {
    const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
    const past = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 }))
    expect(tokenExpired(`${header}.${past}.`)).toBe(true)
    const future = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))
    expect(tokenExpired(`${header}.${future}.`)).toBe(false)
  })
})

describe("ead source-tree", () => {
  test("parseRows + buildTree + hide index", () => {
    const rows = parseRows([
      { nodeId: 1, nodePath: "src", nodeName: "src", nodeType: "FOLDER", parentNodeId: null },
      { nodeId: 2, nodePath: "src/index.tsx", nodeName: "index.tsx", nodeType: "FILE", parentNodeId: 1 },
      { nodeId: 3, nodePath: "src/app.tsx", nodeName: "app.tsx", nodeType: "FILE", parentNodeId: 1 },
    ])
    expect(filterDisplay(rows).map((r) => r.nodeId)).toEqual([1, 3])
    const tree = buildTree(filterDisplay(rows))
    expect(tree).toHaveLength(1)
    expect(tree[0]!.children.map((c) => c.nodeName)).toEqual(["app.tsx"])
  })

  test("filterByCount keeps pending ancestors", () => {
    const tree = buildTree(
      parseRows([
        { nodeId: 1, nodePath: "a", nodeName: "a", nodeType: "FOLDER" },
        { nodeId: 2, nodePath: "a/b.ts", nodeName: "b.ts", nodeType: "FILE", parentNodeId: 1 },
      ]),
    )
    const only = filterByCount(tree, {}, { "a/b.ts": true }, true)
    expect(only[0]?.nodeId).toBe(1)
    expect(only[0]?.children[0]?.nodeId).toBe(2)
  })

  test("filterByIds and search", () => {
    const nodes = [
      { nodeId: 1, name: "Root", children: [{ nodeId: 2, name: "Child", children: [] }] },
    ]
    expect(filterByIds(nodes, new Set([2]))[0]?.children).toHaveLength(1)
    expect(filterPfm(nodes, "child")[0]?.children[0]?.name).toBe("Child")
    const source = buildTree(parseRows([{ nodeId: 9, nodePath: "x/y.ts", nodeName: "y.ts", nodeType: "FILE" }]))
    expect(filterSource(source, "y.ts")).toHaveLength(1)
  })

  test("rollupCounts + pathIds + collectIds", () => {
    const nodes = [
      {
        nodeId: 1,
        name: "Root",
        children: [
          { nodeId: 2, name: "A", children: [{ nodeId: 4, name: "A1", children: [] }] },
          { nodeId: 3, name: "B", children: [] },
        ],
      },
    ]
    expect(collectIds(nodes).sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
    const rolled = rollupCounts(nodes, { "4": 2, "3": 1 })
    expect(rolled["4"]).toBe(2)
    expect(rolled["2"]).toBe(2)
    expect(rolled["1"]).toBe(3)
    expect(rolled["3"]).toBe(1)
    expect(pathIds(nodes, 4)).toEqual([1, 2])
    expect(pathIds(nodes, 99)).toEqual([])
  })

  test("pathTrail returns ancestor source paths", () => {
    const nodes = buildTree([
      { nodeId: 1, nodeName: "a", nodePath: "a", parentNodeId: null },
      { nodeId: 2, nodeName: "b", nodePath: "a/b", parentNodeId: 1 },
      { nodeId: 3, nodeName: "c", nodePath: "a/b/c", parentNodeId: 2 },
    ])
    expect(pathTrail(nodes, 3)).toEqual(["a", "a/b"])
    expect(pathTrail(nodes, 1)).toEqual([])
    expect(pathTrail(nodes, 99)).toEqual([])
  })

  test("expandKey matches product:map:subSchema", () => {
    expect(expandKey(2, 10, 3)).toBe("2:10:3")
    expect(expandKey(2, 0, 0)).toBe("2:0:0")
  })

  test("filterLinked keeps ancestors of matched files", () => {
    const rows = parseRows([
      { nodeId: 1, nodePath: "src", nodeName: "src", nodeType: "FOLDER" },
      { nodeId: 2, nodePath: "src/auth/login.ts", nodeName: "login.ts", nodeType: "FILE", parentNodeId: 1 },
      { nodeId: 3, nodePath: "src/other.ts", nodeName: "other.ts", nodeType: "FILE", parentNodeId: 1 },
    ])
    expect(pathMatches("src/auth/login.ts", ["src/auth/login.ts"])).toBe(true)
    const kept = filterLinked(rows, ["src/auth/login.ts"])
    expect(kept.map((r) => r.nodeId).sort((a, b) => a - b)).toEqual([1, 2])
    const tree = filterLinkedTree(buildTree(rows), ["src/auth/login.ts"])
    expect(tree[0]?.children.map((c) => c.nodeName)).toEqual(["login.ts"])
    expect(filterLinked(rows, [])).toEqual([])
  })

  test("filteredCounts remaps PFM eads onto linked source paths", () => {
    expect(hits("src/auth/login.ts", "src/auth/login.ts")).toBe(true)
    expect(underFolder("src/auth/login.ts", "src/auth")).toBe(true)
    const counts = filteredCounts(
      ["src/auth", "src/auth/login.ts", "src/other.ts"],
      [{ nodeId: 128, paths: ["src/auth/login.ts"] }],
      { 128: 3 },
    )
    expect(counts["src/auth/login.ts"]).toBe(3)
    expect(counts["src/auth"]).toBe(3)
    expect(counts["src/other.ts"]).toBeUndefined()
  })

  test("underFolder allows Legacy ASP.NET / VB source paths", () => {
    expect(underFolder("Web/Login.aspx", "Web")).toBe(true)
    expect(underFolder("App_Code/Helper.vb", "App_Code")).toBe(true)
    expect(underFolder("ServiceWise.csproj", "")).toBe(false)
    expect(underFolder("notes.txt", "docs")).toBe(false)
  })
})

describe("ead bridge", () => {
  test("buildPilotUrl defaults to opencode", () => {
    const url = new URL(
      buildPilotUrl({
        productId: 2,
        productName: "SW Admin",
        nodeId: 128,
        nodeName: "Login",
        openAiPilot: true,
        language: "zh",
        mode: "opencode",
        bust: 3,
      }),
    )
    expect(url.searchParams.get("mode")).toBe("opencode")
    expect(url.searchParams.get("productId")).toBe("2")
    expect(url.searchParams.get("pfmNodeId")).toBe("128")
    expect(url.searchParams.get("openAiPilot")).toBe("1")
    expect(url.searchParams.get("lang")).toBe("zh")
    expect(url.searchParams.get("_cb")).toBe("3")
  })

  test("buildPilotShellUrl is product-scoped shell", () => {
    const url = new URL(
      buildPilotShellUrl({
        productId: 2,
        productName: "SW Admin",
        subSchemaId: 7,
        language: "zh",
        mode: "cursor",
        bust: 3,
      }),
    )
    expect(url.searchParams.get("mode")).toBe("cursor")
    expect(url.searchParams.get("productId")).toBe("2")
    expect(url.searchParams.get("subSchemaId")).toBe("7")
    expect(url.searchParams.get("pfmNodeId")).toBeNull()
    expect(url.searchParams.get("openAiPilot")).toBeNull()
    expect(url.searchParams.get("_cb")).toBe("3")
  })

  test("buildPilotUrl includes subSchemaId", () => {
    const url = new URL(
      buildPilotUrl({
        productId: 2,
        subSchemaId: 7,
        mode: "opencode",
      }),
    )
    expect(url.searchParams.get("subSchemaId")).toBe("7")
  })

  test("source selection prefers sourceCodeNodeId", () => {
    const url = new URL(
      buildPilotUrl({
        sourceId: 99,
        sourceName: "file.ts",
        sourcePath: "src/file.ts",
        nodeId: 1,
        mode: "opencode",
      }),
    )
    expect(url.searchParams.get("sourceCodeNodeId")).toBe("99")
    expect(url.searchParams.get("pfmNodeId")).toBeNull()
    expect(url.searchParams.get("sourceCodeNodePath")).toBe("src/file.ts")
  })

  test("flagsFromAction", () => {
    expect(flagsFromAction({ kind: "find" }).openAiFind).toBe(true)
    expect(flagsFromAction({ kind: "setup" }).openSetupEadMap).toBe(true)
    expect(flagsFromAction({ kind: "setupSource" }).openSetup).toBe(true)
    expect(flagsFromAction({ kind: "mindmap" }).openPfmFilter).toBe(true)
  })

  test("handlePluginMessage auth + find + jobs hooks", () => {
    const calls: string[] = []
    let token = ""
    handlePluginMessage({ type: "pluginHeartbeat" }, { setToken: () => {}, noteHeartbeat: () => calls.push("beat") })
    handlePluginMessage(
      { type: "openAiFindWizard", sourceCodeNodeId: 5, sourceCodeNodeName: "x" },
      {
        setToken: () => {},
        queueFind: (opts) => calls.push(`find:${opts?.sourceId}`),
      },
    )
    handlePluginMessage(
      { type: "injectAiCodingJobs", playbook: "hi", requestId: "r1" },
      {
        setToken: () => {},
        codingJobs: (msg) => calls.push(`jobs:${msg.requestId}`),
      },
    )
    handlePluginMessage(
      { type: "pluginSessionSync", token: "stale", productId: 2, productName: "SW" },
      {
        setToken: (t) => {
          token = t
        },
        setProduct: (id, name) => calls.push(`product:${id}:${name}`),
      },
    )
    handlePluginMessage(
      { type: "eadPfmPersistAuthToken", token: "fresh", productId: 9, productName: "X" },
      {
        setToken: (t) => {
          token = t
        },
        setProduct: (id, name) => calls.push(`product:${id}:${name}`),
      },
    )
    expect(calls).toEqual(["beat", "find:5", "jobs:r1"])
    expect(token).toBe("fresh")
  })

  test("hostBridgeReady invokes bridgeReady", () => {
    const calls: string[] = []
    handlePluginMessage(
      { type: "hostBridgeReady" },
      {
        setToken: () => {},
        noteHeartbeat: () => calls.push("beat"),
        bridgeReady: () => calls.push("ready"),
      },
    )
    expect(calls).toEqual(["beat", "ready"])
  })

  test("openExternalUrl and openEadPilotWebApp route to hooks", () => {
    const calls: string[] = []
    handlePluginMessage(
      { type: "openExternalUrl", url: "https://eadfm.com", windowName: "ead" },
      {
        setToken: () => {},
        openExternal: (url, name) => calls.push(`ext:${url}:${name}`),
      },
    )
    handlePluginMessage(
      { type: "openEadPilotWebApp", productId: 2, productName: "SW", openEditProduct: "1" },
      {
        setToken: () => {},
        openWebApp: (opts) => calls.push(`web:${opts?.productId}:${opts?.openEditProduct}`),
      },
    )
    expect(calls).toEqual(["ext:https://eadfm.com:ead", "web:2:true"])
  })

  test("autoImproveStepComplete routes to hook", () => {
    const calls: string[] = []
    handlePluginMessage(
      { type: "autoImproveStepComplete", pfmNodeId: 42, reason: "done", at: "t1" },
      {
        setToken: () => {},
        stepComplete: (msg) => calls.push(`${msg.type}:${msg.pfmNodeId}`),
      },
    )
    handlePluginMessage(
      { type: "aiFindStepComplete", pfmNodeId: 7 },
      {
        setToken: () => {},
        stepComplete: (msg) => calls.push(`${msg.type}:${msg.pfmNodeId}`),
      },
    )
    expect(calls).toEqual(["autoImproveStepComplete:42", "aiFindStepComplete:7"])
  })

  test("writeClipboardText routes to hook", () => {
    const calls: string[] = []
    handlePluginMessage(
      { type: "writeClipboardText", requestId: "w1", text: "hello" },
      {
        setToken: () => {},
        writeClipboard: (id, text) => calls.push(`${id}:${text}`),
      },
    )
    expect(calls).toEqual(["w1:hello"])
  })

  test("flags include crawl and help", () => {
    expect(flagsFromAction({ kind: "crawl" }).openCrawlVision).toBe(true)
    expect(flagsFromAction({ kind: "help", tipId: "pfm-tree-filter" }).helpTipId).toBe("pfm-tree-filter")
    expect(flagsFromAction({ kind: "pfm" })).toEqual({})
  })

  test("updatePfmSelection / openCrawlVision post host messages", () => {
    const posted: unknown[] = []
    const frame = {
      contentWindow: {
        postMessage: (payload: unknown) => posted.push(payload),
      },
    } as unknown as HTMLIFrameElement
    updatePfmSelection(frame, { productId: 2, nodeId: 128, nodeName: "Login" })
    openCrawlVision(frame, { productId: 2, productName: "SW" })
    openHelpTip(frame, "ead-map-search-setup")
    expect((posted[0] as { type: string }).type).toBe("updatePfmSelection")
    expect((posted[1] as { type: string }).type).toBe("openCrawlVisionWizard")
    expect((posted[2] as { type: string; helpTipId: string }).helpTipId).toBe("ead-map-search-setup")
  })

  test("openFindWizard / openSetupMap post host messages", () => {
    const posted: unknown[] = []
    const frame = {
      contentWindow: {
        postMessage: (payload: unknown) => posted.push(payload),
      },
    } as unknown as HTMLIFrameElement
    openFindWizard(frame, { productId: 2, sourceId: 9, sourceName: "a" })
    openSetupMap(frame, { productId: 2, productName: "SW" })
    expect((posted[0] as { type: string }).type).toBe("openAiFindWizard")
    expect((posted[1] as { type: string }).type).toBe("openSetupEadMap")
  })

  test("selectPfmSubSchema and hostClipboardCommand post host messages", () => {
    const posted: unknown[] = []
    const frame = {
      contentWindow: {
        postMessage: (payload: unknown) => posted.push(payload),
      },
    } as unknown as HTMLIFrameElement
    selectPfmSubSchema(frame, { productId: 2, subSchemaId: 7 })
    hostClipboardCommand(frame, "copy")
    expect(posted[0]).toEqual({
      source: "ead-pfm-host",
      type: "selectPfmSubSchema",
      productId: 2,
      subSchemaId: 7,
    })
    expect(posted[1]).toEqual({
      source: "ead-pfm-host",
      type: "hostClipboardCommand",
      command: "copy",
    })
  })
})

describe("ead context-modal + jobs + filters + actions", () => {
  test("format modal kinds", () => {
    expect(kindLabel("jobs")).toBe("AI Jobs")
    const prompt = formatModal(
      buildModal("prompt", 1, "N", { aiPrompt: "do it", eadScript: "script" }),
    )
    expect(prompt).toContain("do it")
    expect(prompt).toContain("script")
    const jobs = formatModal(buildModal("jobs", 1, "N", {}, [{ jobId: 7, title: "T", description: "D" }]))
    expect(jobs).toContain("#7")
    expect(jobs).toContain("D")
  })

  test("formatJobCounts", () => {
    expect(formatJobCounts({ created: 1, updated: 2, linked: 3, deleted: 0, warnings: 1 })).toContain("1 note")
  })

  test("owner + pfm filters persist per product and keep paths", () => {
    writeOwner(2, { enabled: true, active: true, memberEmail: "a@b.c" })
    expect(ownerSummary(readOwner(2), "en")).toContain("a@b.c")
    writePfmFilter([10, 11], true, ["src/a.ts"], 2)
    expect(readPfmFilter(2)).toEqual({ ids: [10, 11], active: true, paths: ["src/a.ts"] })
    writePfmFilter([10, 11], false, undefined, 2)
    expect(readPfmFilter(2).active).toBe(false)
    expect(readPfmFilter(2).paths).toEqual(["src/a.ts"])
    writePfmFilter([], true, ["x"], 2)
    expect(readPfmFilter(2)).toEqual({ ids: [], active: false, paths: ["x"] })
    clearPfmFilter(2)
    expect(readPfmFilter(2).active).toBe(false)
  })

  test("queuePilot take/peek", () => {
    const seen: string[] = []
    const stop = watchPilot((a) => seen.push(a.kind))
    queuePilot({ kind: "setup" })
    expect(peekPilot()?.kind).toBe("setup")
    expect(seen).toEqual(["setup"])
    expect(takePilot()?.kind).toBe("setup")
    expect(takePilot()).toBeUndefined()
    stop()
  })
})

describe("ead api helpers", () => {
  test("collectProducts + authKind + system prompt", () => {
    expect(authKind("a@b.com")).toBe("email")
    expect(authKind("13800138000")).toBe("phone")
    const products = collectProducts([
      { productId: 2, name: "SW Admin", children: [{ productId: 2, name: "dup" }] },
    ])
    expect(products).toEqual([{ productId: 2, name: "SW Admin" }])
    const groups = collectGroups([
      {
        id: "team-1",
        name: "Ops",
        children: [
          { type: "product", productId: 2, name: "SW Admin", supportsSiblingProducts: true },
          { type: "product", productId: 3, name: "SW Twin", baseProductId: 2 },
        ],
      },
    ])
    expect(groups).toEqual([
      {
        id: "team-1",
        name: "Ops",
        products: [
          { productId: 2, name: "SW Admin", siblings: true },
          { productId: 3, name: "SW Twin", baseId: 2 },
        ],
      },
    ])
    expect(productRole(groups[0]!.products[0]!)).toBe("base")
    expect(productRole(groups[0]!.products[1]!)).toBe("sibling")
    const sys = formatSystemPrompt({ name: "Node", aiPrompt: "p", eadScript: "s" })
    expect(sys).toContain("<pfm-node-context>")
    expect(sys).toContain("<ai-prompt>p</ai-prompt>")
  })

  test("parseFilterIds accepts object and array shapes", () => {
    expect(parseFilterIds({ any: [128, 54], open: [128, 126], active: [] }).sort((a, b) => a - b)).toEqual([
      54, 126, 128,
    ])
    expect(parseFilterIds([9, 0, "8"])).toEqual([9, 8])
    expect(parseFilterIds(null)).toEqual([])
  })

  test("parseOpenIds prefers open list", () => {
    expect(parseOpenIds({ any: [1, 2], open: [9, 8] }).sort((a, b) => a - b)).toEqual([8, 9])
    expect(parseOpenIds({ any: [3, 4] }).sort((a, b) => a - b)).toEqual([3, 4])
    expect(parseOpenIds([5, 6])).toEqual([5, 6])
  })

  test("parseFiles accepts json array and csv", () => {
    expect(parseFiles('["a.ts","b.ts"]')).toEqual(["a.ts", "b.ts"])
    expect(parseFiles("a.ts, b.ts")).toEqual(["a.ts", "b.ts"])
    expect(parseFiles("")).toEqual([])
  })
})

describe("ead i18n + env + mcp", () => {
  test("map i18n covers ja and ko", () => {
    expect(t("ja", "title")).toContain("マップ")
    expect(t("ko", "title")).toContain("맵")
    expect(t("zh", "aiPilot")).toBe("AI 领航")
    expect(t("en", "pfmFilterPrefix", { count: 3 })).toContain("3")
    expect(t("zh", "confirmPassword")).toBe("确认密码")
    expect(t("en", "createTask")).toContain("task")
    expect(t("en", "aiCode")).toBe("AI Code View")
    expect(t("zh", "aiCode")).toBe("AI 代码视图")
    expect(t("en", "groupPfmVsSource")).toBe("PFM vs. Source Code")
    expect(t("zh", "showFilteredOnly")).toBe("仅显示已筛选的 PFM 节点")
    expect(t("zh", "showDebug")).toBe("显示调试消息")
    expect(t("en", "scopeFiltered")).toBe("Filtered PFM nodes only")
    expect(t("zh", "sourceWithPfm")).toBe("显示含 PFM 节点的源代码")
    expect(t("zh", "badgePending")).toBe("待创建")
  })

  test("applyEnv switches api and origin", () => {
    applyEnv("localhost")
    expect(eadEnv()).toBe("localhost")
    expect(eadServer()).toContain("127.0.0.1")
    expect(eadApi()).toContain("8081")
    expect(isEadHost(eadOrigin())).toBe(true)
    applyEnv("production")
    expect(eadApi()).toContain("eadfm.com")
    expect(isEadHost("https://eadfm.com")).toBe(true)
    expect(isEadHost("http://localhost:5173")).toBe(true)
  })

  test("mcpCandidates walks to sibling EAD_PFM-Editor", () => {
    const list = mcpCandidates("/Users/me/Projects/TX/KloudCode", "")
    expect(list.some((p) => p.includes("EAD_PFM-Editor/mcp-eadpfm/dist/index.js"))).toBe(true)
  })

  test("diag pipeline records ok and fail steps", () => {
    beginDiag()
    noteDiag("Auth", true, "ok")
    noteDiag("Map", false, "timeout")
    expect(formatDiag()).toBe("ok Auth: ok\nfail Map: timeout")
    expect(readStartup()).toEqual({ text: "✗ Map: timeout", kind: "error" })
  })
})

describe("ead step-signal", () => {
  test("parses MCP payload and path", () => {
    const step = parseBody(
      `{"type":"autoImproveStepComplete","pfmNodeId":9,"reason":"ok","at":"2026-09-09T01:00:00.000Z"}`,
    )
    expect(step?.pfmNodeId).toBe(9)
    expect(parseStep({ type: "nope" })).toBeUndefined()
    expect(parseBody("{")).toBeUndefined()
    expect(matches(SIGNAL)).toBe(true)
    expect(matches(`/tmp/${SIGNAL}`)).toBe(true)
    expect(matches("other.json")).toBe(false)
  })

  test("skips leftover then fires on new at", () => {
    const seen = watch()
    const a = parseStep({ type: "autoImproveStepComplete", pfmNodeId: 1, at: "t1", reason: "a" })!
    const b = parseStep({ type: "autoImproveStepComplete", pfmNodeId: 1, at: "t2", reason: "b" })!
    expect(seen.hit(a, 1000)).toBe(false)
    expect(seen.hit(a, 3000)).toBe(false)
    expect(seen.hit(b, 3000)).toBe(true)
    expect(seen.hit(b, 5000)).toBe(false)
  })

  test("fires first write after miss", () => {
    const seen = watch()
    seen.miss()
    const a = parseStep({ type: "autoImproveStepComplete", pfmNodeId: null, at: "t1", reason: "new" })!
    expect(seen.hit(a, 1000)).toBe(true)
  })
})
