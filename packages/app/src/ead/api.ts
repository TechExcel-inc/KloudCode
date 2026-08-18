import { eadHttp } from "./http"
import { eadApi } from "./urls"

export type Product = {
  productId: number
  name: string
}

export type PfmNode = {
  nodeId: number
  name: string
  children: PfmNode[]
}

export type ActiveContext = {
  nodeId: number
  nodeName: string
  eadScript: string
  aiPrompt: string
  markdown: string
}

type AuthResult = {
  success?: boolean
  token?: string
  message?: string
}

type TreeNode = {
  productId?: number | string
  id?: number | string
  name?: string
  productName?: string
  label?: string
  children?: TreeNode[]
  products?: TreeNode[]
}

type MapPayload = {
  mapId?: number | string
  rootNode?: unknown
}

type ContextPayload = {
  pfmNode?: {
    id?: number
    title?: string
    nodeKey?: string
    note?: string
    workType?: string
    projectId?: number
  }
  product?: {
    productId?: number
    productName?: string
    projectId?: number
    projectName?: string
  }
  eadScript?: string
  aiPrompt?: string
  aiApi?: string
  linkedSkills?: Array<{
    skillId?: number
    title?: string
    description?: string
    skillType?: string
    version?: string
  }>
  sourceContext?: {
    schema?: Record<string, unknown> | null
    repositories?: Array<Record<string, unknown>>
    legacyRepositories?: Array<Record<string, unknown>>
    nodeSourceCodeFiles?: string
  }
  warnings?: string[]
  updatedAt?: string
  eadEntityId?: number
  eadEntityName?: string
}

type Http = typeof fetch

function headers(token: string) {
  const out: Record<string, string> = { Accept: "application/json" }
  if (token) out.Authorization = `Bearer ${token}`
  return out
}

async function call(http: Http, path: string, token: string, init?: RequestInit) {
  const res = await http(`${eadApi()}${path}`, {
    ...init,
    headers: {
      ...headers(token),
      ...(init?.headers ?? {}),
    },
  }).catch((err) => {
    throw new Error(err instanceof Error ? err.message : "Load failed")
  })
  if (res.status === 401 || res.status === 403) throw new Error("AUTH_EXPIRED")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function walk(nodes: TreeNode[], out: Product[]) {
  for (const node of nodes) {
    const id = Number(node.productId ?? 0)
    const name = String(node.name ?? node.productName ?? node.label ?? "").trim()
    if (Number.isFinite(id) && id > 0 && name) {
      out.push({ productId: id, name })
    }
    if (Array.isArray(node.children)) walk(node.children, out)
    if (Array.isArray(node.products)) walk(node.products, out)
  }
}

export function collectProducts(tree: TreeNode[]): Product[] {
  const out: Product[] = []
  walk(tree, out)
  const seen = new Set<number>()
  return out.filter((item) => {
    if (seen.has(item.productId)) return false
    seen.add(item.productId)
    return true
  })
}

function asNode(raw: unknown): PfmNode | undefined {
  if (!raw || typeof raw !== "object") return
  const row = raw as Record<string, unknown>
  const id = Number(row.nodeId ?? row.id ?? 0)
  if (!Number.isFinite(id) || id <= 0) return
  const kids = Array.isArray(row.children) ? row.children : []
  return {
    nodeId: id,
    name: String(row.name ?? row.nodeName ?? `Node ${id}`),
    children: kids.flatMap((child) => {
      const next = asNode(child)
      return next ? [next] : []
    }),
  }
}

function repos(list: Array<Record<string, unknown>> | undefined) {
  if (!list?.length) return "_No repositories linked._"
  return list
    .map((row) => {
      const name = String(row.name ?? row.repoName ?? row.path ?? "repo")
      const url = String(row.url ?? row.gitUrl ?? "")
      return url ? `- ${name}: ${url}` : `- ${name}`
    })
    .join("\n")
}

export function formatContextMarkdown(ctx: ContextPayload, fallback: { nodeId: number; nodeName: string }) {
  const node = ctx.pfmNode ?? {}
  const product = ctx.product ?? {}
  const source = ctx.sourceContext ?? {}
  const schema = source.schema ?? {}
  const skills = Array.isArray(ctx.linkedSkills) ? ctx.linkedSkills : []
  const warnings = Array.isArray(ctx.warnings) ? ctx.warnings : []
  const title = node.title || fallback.nodeName || "Unknown"
  const id = node.id || fallback.nodeId

  return [
    "# Active EAD PFM Context",
    "",
    "_Auto-synced by KloudCode EAD Map when you select a PFM node._",
    "",
    "## Node",
    `- Product: ${product.productName || "Unknown"}${product.productId ? ` (${product.productId})` : ""}`,
    `- Project: ${product.projectName || "Unknown"}${product.projectId ? ` (${product.projectId})` : ""}`,
    `- PFM Node: ${title}${id ? ` (${id})` : ""}`,
    `- Node Key: ${node.nodeKey || "-"}`,
    `- Work Type: ${node.workType || "-"}`,
    ctx.updatedAt ? `- Updated At: ${ctx.updatedAt}` : "",
    "",
    "## EAD Workflow",
    `- Entity ID: ${ctx.eadEntityId ?? node.id ?? "-"}`,
    `- Title: ${ctx.eadEntityName || node.title || title}`,
    `- Workflow key: ${node.nodeKey || "-"}`,
    node.note?.trim() ? ["", "### Workflow spec", node.note.trim()].join("\n") : "_No EAD workflow spec documented yet._",
    "",
    "## Warnings",
    warnings.length ? warnings.map((w) => `- ${w}`).join("\n") : "- None",
    "",
    "## AI Prompt Info",
    ctx.aiPrompt?.trim() || "_No saved AI Prompt Info for this node._",
    "",
    "## EAD Script",
    ctx.eadScript?.trim() ? ["```text", ctx.eadScript.trim(), "```"].join("\n") : "_No saved EAD Script for this node._",
    "",
    "## AI API Context",
    ctx.aiApi?.trim() || "_No saved AI API context for this node._",
    "",
    "## Linked EAD Skills",
    skills.length
      ? skills
          .map((skill) =>
            [
              `### ${skill.title || `Skill ${skill.skillId || ""}`}`.trim(),
              `- Type: ${skill.skillType || "-"}`,
              `- Version: ${skill.version || "-"}`,
              "",
              skill.description || "_No skill description._",
            ].join("\n"),
          )
          .join("\n\n")
      : "_No linked EAD Skills for this node._",
    "",
    "## Linked Source Code",
    `- Schema: ${String(schema.name || "Not linked")}${schema.schemaId ? ` (${String(schema.schemaId)})` : ""}`,
    `- Work Type: ${String(schema.workType || "-")}`,
    `- Node Source Files: ${source.nodeSourceCodeFiles || "-"}`,
    "",
    "### Current Repositories",
    repos(source.repositories),
    "",
    "### Legacy Repositories",
    repos(source.legacyRepositories),
  ]
    .filter((line) => line !== "")
    .join("\n")
}

export function formatSystemPrompt(input: { name: string; eadScript?: string; aiPrompt?: string; markdown?: string }) {
  const name = input?.name?.trim()
  if (!name) return
  const script = input.eadScript?.trim()
  const prompt = input.aiPrompt?.trim()
  if (!script && !prompt && !input.markdown?.trim()) {
    return [`<pfm-node-context>`, `You are currently working on the PFM node: ${name}`, `</pfm-node-context>`].join("\n")
  }
  return [
    `<pfm-node-context>`,
    `You are currently working on the PFM node: ${name}`,
    prompt ? `<ai-prompt>${prompt}</ai-prompt>` : "",
    script ? `<ead-script>${script}</ead-script>` : "",
    input.markdown?.trim() ? `<ead-context-markdown>\n${input.markdown.trim()}\n</ead-context-markdown>` : "",
    `</pfm-node-context>`,
  ]
    .filter(Boolean)
    .join("\n")
}

export async function login(identifier: string, password: string, http: Http = eadHttp()) {
  const body = {
    loginMethod: "password",
    identifier: identifier.trim(),
    password: btoa(password),
  }
  const res = await http(`${eadApi()}/auth/login`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((err) => {
    throw new Error(err instanceof Error ? err.message : "Load failed")
  })
  const data = (await res.json()) as AuthResult
  if (!res.ok || !data.success || !data.token) {
    throw new Error(data.message || `Login failed (HTTP ${res.status})`)
  }
  return data.token
}

export async function loadProducts(token: string, http: Http = eadHttp()) {
  const tree = (await call(http, `/products/tree`, token)) as TreeNode[]
  return collectProducts(Array.isArray(tree) ? tree : [])
}

export async function loadActiveMap(
  token: string,
  productId: number,
  http: Http = eadHttp(),
  subSchemaId?: number,
) {
  const q = subSchemaId && subSchemaId > 0 ? `?subSchemaId=${subSchemaId}` : ""
  const map = (await call(http, `/pfm-maps/product/${productId}/active${q}`, token)) as MapPayload & {
    supportSubSchemas?: boolean | number
    baseMapId?: number | string
    mapName?: string
  }
  const mapId = Number(map.mapId ?? 0)
  const base = Number(map.baseMapId ?? 0)
  const root = asNode(map.rootNode)
  const name = String(map.mapName || "").trim()
  return {
    mapId: Number.isFinite(mapId) && mapId > 0 ? mapId : 0,
    root,
    supportSubSchemas: map.supportSubSchemas === true || map.supportSubSchemas === 1,
    baseMapId: Number.isFinite(base) && base > 0 ? base : 0,
    mapName: name,
  }
}

export type SubSchema = { id: number; name: string }

export async function loadSubSchemas(token: string, mapId: number, http: Http = eadHttp()) {
  const data = (await call(http, `/pfm-map-sub/maps/${mapId}`, token).catch(() => null)) as {
    subSchemas?: Array<{ id?: number | string; name?: string }>
  } | null
  if (!data) return [] as SubSchema[]
  return (data.subSchemas ?? []).flatMap((row) => {
    const id = Number(row.id)
    if (!Number.isFinite(id) || id <= 0) return []
    return [{ id, name: String(row.name || `Schema ${id}`) }]
  })
}

export type LinkedBundle = {
  nodes: Array<Record<string, unknown>>
  eadCountByNodeId: Record<string, number>
  pendingEadByNodePath: Record<string, boolean>
  openJobCountByNodeId: Record<string, number>
  openTestCaseCountByNodeId: Record<string, number>
  expandByDefaultPaths: string[]
  linkedFilePaths: string[]
}

export async function loadLinkedBundle(
  token: string,
  productId: number,
  schemaId: number,
  http: Http = eadHttp(),
  sync = false,
): Promise<LinkedBundle> {
  const empty: LinkedBundle = {
    nodes: [],
    eadCountByNodeId: {},
    pendingEadByNodePath: {},
    openJobCountByNodeId: {},
    openTestCaseCountByNodeId: {},
    expandByDefaultPaths: [],
    linkedFilePaths: [],
  }
  if (sync) {
    await http(`${eadApi()}/source-code-pfm-node-tree/schema/${schemaId}/sync-pfm-linked-paths`, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    }).catch(() => undefined)
  }
  const data = (await call(
    http,
    `/source-code-pfm-node-tree/schema/${schemaId}/linked-source-tree?productId=${productId}`,
    token,
  )) as {
    nodes?: Array<Record<string, unknown>>
    eadCountByNodePath?: Record<string, number>
    pendingEadByNodePath?: Record<string, boolean>
    expandByDefaultPaths?: string[]
    linkedFilePaths?: string[]
  }
  const nodes = Array.isArray(data.nodes) ? data.nodes : []
  const pathCounts = data.eadCountByNodePath && typeof data.eadCountByNodePath === "object" ? data.eadCountByNodePath : {}
  const eadCountByNodeId: Record<string, number> = {}
  for (const row of nodes) {
    const id = Number(row.nodeId)
    const path = typeof row.nodePath === "string" ? row.nodePath : ""
    const count = pathCounts[path]
    if (Number.isFinite(id) && id > 0 && typeof count === "number" && count > 0) {
      eadCountByNodeId[String(id)] = count
    }
  }
  const pending =
    data.pendingEadByNodePath && typeof data.pendingEadByNodePath === "object" ? data.pendingEadByNodePath : {}
  const pendingEadByNodePath: Record<string, boolean> = {}
  for (const [path, value] of Object.entries(pending)) {
    if (value) pendingEadByNodePath[path] = true
  }
  let openJobCountByNodeId: Record<string, number> = {}
  let openTestCaseCountByNodeId: Record<string, number> = {}
  try {
    const jobs = (await call(http, `/v1/ai-coding-jobs/source-node-open-counts?schemaId=${schemaId}`, token)) as Record<
      string,
      number
    >
    if (jobs && typeof jobs === "object") openJobCountByNodeId = jobs
  } catch {
    openJobCountByNodeId = {}
  }
  try {
    const tests = (await call(http, `/ai-test-cases/source-node-open-counts?schemaId=${schemaId}`, token)) as Record<
      string,
      number
    >
    if (tests && typeof tests === "object") openTestCaseCountByNodeId = tests
  } catch {
    openTestCaseCountByNodeId = {}
  }
  return {
    ...empty,
    nodes,
    eadCountByNodeId,
    pendingEadByNodePath,
    openJobCountByNodeId,
    openTestCaseCountByNodeId,
    expandByDefaultPaths: Array.isArray(data.expandByDefaultPaths) ? data.expandByDefaultPaths : [],
    linkedFilePaths: Array.isArray(data.linkedFilePaths) ? data.linkedFilePaths.filter((p) => typeof p === "string") : [],
  }
}

export async function loadJobsForNode(token: string, nodeId: number, http: Http = eadHttp()) {
  const data = await call(http, `/v1/ai-coding-jobs/node/${nodeId}`, token)
  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []
}

export function parseFiles(raw: string | null | undefined) {
  if (!raw?.trim()) return [] as string[]
  const trimmed = raw.trim()
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []))
    } catch {
      return []
    }
  }
  return trimmed
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export async function loadLinkPaths(token: string, nodeId: number, http: Http = eadHttp()) {
  if (!(nodeId > 0)) return [] as string[]
  const node = (await call(http, `/nodes/${nodeId}`, token).catch(() => null)) as
    | { sourceCodeFiles?: string | null }
    | null
  return parseFiles(node?.sourceCodeFiles)
}

export async function loadSubtreePaths(token: string, ids: number[], http: Http = eadHttp()) {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))]
  if (!unique.length) return [] as string[]
  const batches = await Promise.all(unique.map((id) => loadLinkPaths(token, id, http)))
  const merged = new Set<string>()
  for (const paths of batches) {
    for (const path of paths) {
      if (path) merged.add(path)
    }
  }
  return [...merged]
}

export async function createJob(
  token: string,
  input: { pfmNodeId: number; title: string; description?: string; projectId?: number },
  http: Http = eadHttp(),
) {
  let projectId = Number(input.projectId || 0)
  if (!(projectId > 0)) {
    const jobs = await loadJobsForNode(token, input.pfmNodeId, http).catch(() => [])
    for (const job of jobs) {
      const id = Number(job.projectId)
      if (Number.isFinite(id) && id > 0) {
        projectId = id
        break
      }
    }
  }
  const body: Record<string, unknown> = {
    pfmNodeId: input.pfmNodeId,
    title: input.title,
    description: input.description?.trim() || null,
    jobStatus: 0,
  }
  if (projectId > 0) body.projectId = projectId
  const res = await http(`${eadApi()}/v1/ai-coding-jobs`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((err) => {
    throw new Error(err instanceof Error ? err.message : "Load failed")
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    let detail = ""
    try {
      const parsed = JSON.parse(text) as { message?: string }
      if (parsed.message) detail = parsed.message
    } catch {
      detail = text.trim().slice(0, 200)
    }
    throw new Error(detail || `Failed to create task (HTTP ${res.status}).`)
  }
  return res.json() as Promise<Record<string, unknown>>
}

export async function reconcileJobs(
  token: string,
  input: {
    pfmNodeId?: number | null
    sourceCodePfmNodeId?: number | null
    eadEntityId?: number | null
    parentPfmNode?: string | null
    userDescription?: string | null
    createTasks?: boolean
    dryRun?: boolean
  },
  http: Http = eadHttp(),
) {
  const res = await http(`${eadApi()}/v1/ai-coding-jobs/generate-jobs`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "auto",
      pfmNodeId: input.pfmNodeId ?? null,
      sourceCodePfmNodeId: input.sourceCodePfmNodeId ?? null,
      eadEntityId: input.eadEntityId ?? null,
      parentPfmNode: input.parentPfmNode ?? null,
      userDescription: input.userDescription ?? null,
      createTasks: input.createTasks !== false,
      dryRun: input.dryRun === true,
    }),
  }).catch((err) => {
    throw new Error(err instanceof Error ? err.message : "Load failed")
  })
  if (!res.ok) throw new Error(`Failed to reconcile AI coding jobs (HTTP ${res.status}).`)
  const data = (await res.json()) as Record<string, unknown>
  const jobs = Array.isArray(data.jobs) ? data.jobs : []
  return {
    created: jobs.length,
    updated: Array.isArray(data.updatedJobIds) ? data.updatedJobIds.length : 0,
    linked: Array.isArray(data.linkJobIds) ? data.linkJobIds.length : 0,
    deleted: Array.isArray(data.deletedJobIds) ? data.deletedJobIds.length : 0,
    warnings: Array.isArray(data.warnings) ? data.warnings.length : 0,
  }
}

export async function loadRawContext(
  token: string,
  nodeId: number,
  http: Http = eadHttp(),
  kind: "pfm" | "source" = "pfm",
) {
  const path = kind === "source" ? `/v1/ai-code/context/source-node/${nodeId}` : `/v1/ai-code/context/${nodeId}`
  return (await call(http, path, token)) as ContextPayload
}

export function parseFilterIds(data: unknown) {
  if (!data) return [] as number[]
  if (Array.isArray(data)) {
    return data.flatMap((id) => {
      const n = Number(id)
      return Number.isFinite(n) && n > 0 ? [n] : []
    })
  }
  if (typeof data !== "object") return [] as number[]
  const row = data as { any?: number[]; open?: number[]; active?: number[] }
  const raw = [...(row.any ?? []), ...(row.open ?? []), ...(row.active ?? [])]
  const ids = new Set<number>()
  for (const id of raw) {
    const n = Number(id)
    if (Number.isFinite(n) && n > 0) ids.add(n)
  }
  return [...ids]
}

export async function loadFilterNodeIds(token: string, mapId: number, http: Http = eadHttp()) {
  const data = await call(http, `/v1/ai-coding-jobs/map/${mapId}/filter-node-ids`, token).catch(() => null)
  return parseFilterIds(data)
}

/** Prefer `open` ids for Jobs-filtered PFM tree (Cursor jobFilterNodeIds.open). */
export function parseOpenIds(data: unknown) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const open = (data as { open?: number[] }).open
    if (Array.isArray(open) && open.length) return parseFilterIds(open)
  }
  return parseFilterIds(data)
}

export async function loadOpenFilterNodeIds(token: string, mapId: number, http: Http = eadHttp()) {
  const data = await call(http, `/v1/ai-coding-jobs/map/${mapId}/filter-node-ids`, token).catch(() => null)
  return parseOpenIds(data)
}

function chunk<T>(list: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export async function loadPfmEadCounts(token: string, nodeIds: number[], http: Http = eadHttp()) {
  const ids = [...new Set(nodeIds.filter((id) => id > 0))]
  const out: Record<string, number> = {}
  for (const part of chunk(ids, 200)) {
    const data = await call(http, `/ead/nodes/ead-counts?pfmNodeIds=${part.join(",")}`, token).catch(() => null)
    if (!data || typeof data !== "object") continue
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const n = Number(value)
      if (Number.isFinite(n) && n > 0) out[String(key)] = n
    }
  }
  return out
}

export async function loadPfmJobCounts(token: string, nodeIds: number[], http: Http = eadHttp()) {
  const ids = [...new Set(nodeIds.filter((id) => id > 0))]
  if (!ids.length) return {} as Record<string, number>
  const data = await call(http, `/v1/ai-coding-jobs/node-summary?pfmNodeIds=${ids.join(",")}`, token).catch(
    () => null,
  )
  const out: Record<string, number> = {}
  if (!Array.isArray(data)) return out
  for (const row of data) {
    if (!row || typeof row !== "object") continue
    const id = Number((row as { pfmNodeId?: number }).pfmNodeId)
    const open = Number((row as { openJobCount?: number }).openJobCount || 0)
    if (Number.isFinite(id) && id > 0 && open > 0) out[String(id)] = open
  }
  return out
}

export async function loadPfmTestCounts(token: string, nodeIds: number[], http: Http = eadHttp()) {
  const ids = [...new Set(nodeIds.filter((id) => id > 0))]
  const out: Record<string, number> = {}
  for (const part of chunk(ids, 200)) {
    const data = await call(
      http,
      `/ai-test-cases/pfm-node-open-counts?pfmNodeIds=${part.join(",")}`,
      token,
    ).catch(() => null)
    if (!data || typeof data !== "object") continue
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const n = Number(value)
      if (Number.isFinite(n) && n > 0) out[String(key)] = n
    }
  }
  return out
}

export async function suggestProduct(
  token: string,
  products: Product[],
  folder: string,
  http: Http = eadHttp(),
) {
  const name = folder.trim().toLowerCase()
  if (!name || !products.length) return
  for (const product of products) {
    const res = await http(`${eadApi()}/products/${product.productId}/source-code-schema`, {
      headers: headers(token),
    }).catch(() => null)
    if (!res || !res.ok) continue
    const schema = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!schema) continue
    const repos = (schema.linkedRepos ?? schema.linked_repos) as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(repos)) continue
    for (const repo of repos) {
      const short = String(repo.shortName || "").trim().toLowerCase()
      const vcs = String(repo.vcsRepo || "").trim().toLowerCase()
      const base = vcs.split("/").filter(Boolean).pop() || ""
      const hitShort = short && (name === short || name.includes(short) || short.includes(name))
      const hitBase = base && (name === base || name.includes(base) || base.includes(name))
      if (hitShort || hitBase) return product
    }
  }
}

export async function selectSourcePath(token: string, schemaId: number, nodePath: string, http: Http = eadHttp()) {
  if (!nodePath.trim()) return
  await http(`${eadApi()}/source-code-pfm-node-tree/schema/${schemaId}/select`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ nodePath: nodePath.trim() }),
  }).catch(() => undefined)
}

export async function loadContext(
  token: string,
  nodeId: number,
  nodeName: string,
  http: Http = eadHttp(),
  kind: "pfm" | "source" = "pfm",
): Promise<ActiveContext> {
  const path = kind === "source" ? `/v1/ai-code/context/source-node/${nodeId}` : `/v1/ai-code/context/${nodeId}`
  const raw = (await call(http, path, token)) as ContextPayload
  const eadTitle = String(raw.pfmNode?.title || "").trim()
  const label = nodeName.trim() || eadTitle || `Node ${nodeId}`
  return {
    nodeId,
    nodeName: label,
    eadScript: String(raw.eadScript ?? ""),
    aiPrompt: String(raw.aiPrompt ?? ""),
    markdown: formatContextMarkdown(raw, { nodeId, nodeName: eadTitle || label }),
  }
}

export type SourceSchema = {
  schemaId: number
  name: string
  workType?: string
  candidates: number[]
}

export async function loadSourceSchema(token: string, productId: number, http: Http = eadHttp()): Promise<SourceSchema | undefined> {
  const res = await http(`${eadApi()}/products/${productId}/source-code-schema`, {
    headers: headers(token),
  }).catch((err) => {
    throw new Error(err instanceof Error ? err.message : "Load failed")
  })
  if (res.status === 404) return
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const schema = (await res.json()) as Record<string, unknown>
  const legacy = Number(schema.legacySourceSchemaId ?? schema.legacy_source_schema_id ?? 0)
  const schemaId = Number(schema.schemaId ?? schema.schema_id ?? schema.id ?? 0)
  const candidates: number[] = []
  if (Number.isFinite(schemaId) && schemaId > 0) candidates.push(schemaId)
  if (Number.isFinite(legacy) && legacy > 0 && !candidates.includes(legacy)) candidates.push(legacy)
  if (!candidates.length) return
  return {
    schemaId: candidates[0]!,
    name: String(schema.name ?? schema.schemaName ?? "Source schema"),
    workType: typeof schema.workType === "string" ? schema.workType : undefined,
    candidates,
  }
}

export async function loadLinkedSource(
  token: string,
  productId: number,
  schemaId: number,
  http: Http = eadHttp(),
  sync = false,
) {
  if (sync) {
    await http(`${eadApi()}/source-code-pfm-node-tree/schema/${schemaId}/sync-pfm-linked-paths`, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    }).catch(() => undefined)
  }
  const data = (await call(
    http,
    `/source-code-pfm-node-tree/schema/${schemaId}/linked-source-tree?productId=${productId}`,
    token,
  )) as { nodes?: Array<Record<string, unknown>> }
  return Array.isArray(data.nodes) ? data.nodes : []
}

export async function me(token: string, http: Http = eadHttp()) {
  const data = (await call(http, `/auth/me`, token)) as {
    email?: string
    name?: string
    userName?: string
    fullName?: string
    username?: string
    user?: {
      email?: string
      name?: string
      userName?: string
      fullName?: string
      username?: string
    }
  }
  const row = data.user ?? data
  return {
    email: row.email,
    name: row.fullName || row.name || row.userName || row.username,
    userName: row.username || row.userName,
  }
}

export function authKind(target: string): "email" | "phone" {
  return target.includes("@") ? "email" : "phone"
}

async function authPost(path: string, body: Record<string, unknown>, http: Http) {
  const res = await http(`${eadApi()}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((err) => {
    throw new Error(err instanceof Error ? err.message : "Load failed")
  })
  const data = (await res.json()) as AuthResult & {
    code?: string
    signupToken?: string
  }
  return { ok: res.ok, data }
}

export async function sendCode(
  target: string,
  intent: "signup" | "reset" = "signup",
  http: Http = eadHttp(),
) {
  const trimmed = target.trim()
  if (!trimmed) throw new Error("Please enter email or phone.")
  const kind = authKind(trimmed)
  const { ok, data } = await authPost(
    `/auth/send-code`,
    {
      type: kind === "phone" ? 1 : 2,
      target: encodeURIComponent(trimmed),
      productId: 1,
      intent,
    },
    http,
  )
  if (!ok || !data.success) throw new Error(data.message || "Failed to send code.")
  return { code: data.code, message: data.message || "Verification code sent." }
}

export async function verifyCode(target: string, code: string, http: Http = eadHttp()) {
  const trimmed = target.trim()
  const digits = code.trim()
  if (!trimmed || !digits) throw new Error("Please enter the 6-digit verification code.")
  const { ok, data } = await authPost(
    `/auth/verify-code`,
    {
      target: encodeURIComponent(trimmed),
      code: encodeURIComponent(digits),
      issueSignupToken: true,
    },
    http,
  )
  if (!ok || !data.success || !data.signupToken) {
    throw new Error(data.message || "Invalid or expired code.")
  }
  return data.signupToken
}

export async function signup(
  input: { target: string; username: string; password: string; signupToken: string },
  http: Http = eadHttp(),
) {
  const target = input.target.trim()
  const username = input.username.trim()
  if (!target || !username || !input.password || !input.signupToken) {
    throw new Error("Please complete all sign up fields.")
  }
  const kind = authKind(target)
  const { ok, data } = await authPost(
    `/auth/signup`,
    {
      email: kind === "email" ? target : undefined,
      phone: kind === "phone" ? target : undefined,
      username,
      password: btoa(input.password),
      role: "user",
      encryptOption: "0",
      signupToken: input.signupToken,
    },
    http,
  )
  if (!ok || !data.success || !data.token) throw new Error(data.message || "Sign up failed.")
  return data.token
}

export async function resetPassword(
  input: { target: string; code: string; password: string },
  http: Http = eadHttp(),
) {
  const target = input.target.trim()
  const code = input.code.trim()
  if (!target || !code || !input.password) {
    throw new Error("Please complete all reset password fields.")
  }
  const kind = authKind(target)
  const { ok, data } = await authPost(
    `/auth/reset-password`,
    {
      email: kind === "email" ? target : undefined,
      mobile: kind === "phone" ? target : undefined,
      code,
      password: btoa(input.password),
    },
    http,
  )
  if (!ok || !data.success) throw new Error(data.message || "Failed to reset password.")
  return data.message || "Password reset successfully."
}

export type TeamMember = { email: string; label: string }

export async function loadTeamMembers(token: string, productId: number, http: Http = eadHttp()) {
  const data = (await call(http, `/applicable-team-members/products/${productId}/resolved-members`, token)) as {
    members?: Array<Record<string, unknown>>
  }
  return (data.members ?? []).flatMap((row) => {
    const email = String(row.email ?? row.userEmail ?? "").trim()
    if (!email) return []
    const label = String(row.label ?? row.name ?? row.fullName ?? row.username ?? email).trim()
    return [{ email, label: label || email }]
  })
}
