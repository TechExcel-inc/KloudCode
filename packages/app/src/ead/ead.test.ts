import { describe, expect, test } from "bun:test"
import {
  buildPilotUrl,
  flagsFromAction,
  handlePluginMessage,
  openFindWizard,
  openSetupMap,
} from "./bridge"
import { buildModal, formatModal, kindLabel } from "./context-modal"
import { clearPfmFilter, ownerSummary, readOwner, readPfmFilter, writeOwner, writePfmFilter } from "./filters"
import { formatJobCounts } from "./jobs"
import {
  buildTree,
  filterByCount,
  filterByIds,
  filterDisplay,
  filterPfm,
  filterSource,
  parseRows,
} from "./source-tree"
import { collectProducts, formatSystemPrompt, authKind, parseFilterIds } from "./api"
import { queuePilot, takePilot, peekPilot } from "./actions"

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
    expect(url.searchParams.get("_t")).toBe("3")
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
      { type: "eadPfmPersistAuthToken", token: "fresh" },
      {
        setToken: (t) => {
          token = t
        },
      },
    )
    expect(calls).toEqual(["beat", "find:5", "jobs:r1", "product:2:SW"])
    expect(token).toBe("fresh")
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

  test("owner + pfm filters", () => {
    writeOwner(2, { enabled: true, active: true, memberEmail: "a@b.c" })
    expect(ownerSummary(readOwner(2))).toContain("a@b.c")
    writePfmFilter([10, 11], true)
    expect(readPfmFilter()).toEqual({ ids: [10, 11], active: true })
    clearPfmFilter()
    expect(readPfmFilter().active).toBe(false)
  })

  test("queuePilot take/peek", () => {
    queuePilot({ kind: "setup" })
    expect(peekPilot()?.kind).toBe("setup")
    expect(takePilot()?.kind).toBe("setup")
    expect(takePilot()).toBeUndefined()
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
})
