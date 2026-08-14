import {
  loadActiveMap,
  loadContext,
  loadLinkedBundle,
  loadProducts,
  loadSourceSchema,
  login,
  formatSystemPrompt,
  loadJobsForNode,
  loadRawContext,
  reconcileJobs,
} from "./api"
import { buildTree, filterByCount, filterDisplay, parseRows } from "./source-tree"
import { buildPilotUrl, flagsFromAction, handlePluginMessage } from "./bridge"
import { formatModal, buildModal } from "./context-modal"

async function main() {
  const token = await login("tierenz", "tz123456")
  console.log("1 login", token.length > 0)

  const products = await loadProducts(token)
  console.log("2 products", products.length >= 1, !!products.find((p) => p.productId === 2))

  const map = await loadActiveMap(token, 2)
  console.log("3 map", map.mapId === 8, map.root?.children.length === 5, map.root?.name)

  const ctx = await loadContext(token, 128, "Employee Login")
  const sys = formatSystemPrompt({
    name: ctx.nodeName,
    eadScript: ctx.eadScript,
    aiPrompt: ctx.aiPrompt,
    markdown: ctx.markdown,
  })
  console.log("4 context", ctx.nodeName === "Main EAD", !!sys?.includes("Main EAD"))

  const schema = await loadSourceSchema(token, 2)
  const bundle = await loadLinkedBundle(token, 2, schema!.schemaId)
  const tree = buildTree(filterDisplay(parseRows(bundle.nodes)))
  const filtered = filterByCount(tree, bundle.eadCountByNodeId, bundle.pendingEadByNodePath, true)
  console.log("5 source", tree.length >= 1, filtered.length >= 1, filtered.map((n) => n.nodeName).join(","))

  const url = buildPilotUrl({
    productId: 2,
    productName: "SW Admin",
    nodeId: 128,
    nodeName: ctx.nodeName,
    mode: "opencode",
    ...flagsFromAction({ kind: "find" }),
  })
  console.log("6 pilotUrl", url.includes("mode=opencode"), url.includes("openAiFind=1"))

  let hooked = false
  handlePluginMessage({ type: "openSetupEadMap" }, { setToken: () => {}, queueSetup: () => (hooked = true) })
  console.log("7 bridge setup", hooked)

  const raw = await loadRawContext(token, 128)
  const jobs = await loadJobsForNode(token, 128)
  const modal = formatModal(buildModal("jobs", 128, ctx.nodeName, raw, jobs as never))
  console.log("8 modal jobs", modal.includes("AI Jobs"), jobs.length >= 0)

  // dry-run reconcile should not fail auth
  const counts = await reconcileJobs(token, { pfmNodeId: 128, dryRun: true }).catch((e) => {
    console.log("9 reconcile err", e instanceof Error ? e.message : e)
    return null
  })
  console.log("9 reconcile", counts ? `created=${counts.created}` : "failed")

  console.log("DONE")
}

await main()
