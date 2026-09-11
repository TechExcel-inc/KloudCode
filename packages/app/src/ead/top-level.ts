/** Cursor extension 1.0.228 pfmTopLevelEnforce — top-level skeleton + "To be moved". */

export const MOVED = "To be moved"
export const UNPLACED = "Unplaced"
export const VIRTUAL_MOVED = -1543

type Cfg = {
  id: string
  name: string
  dyn: boolean
  order: number
  nodeId?: number | null
}

export type Raw = {
  nodeId?: number | string | null
  nodeName?: string | null
  isDynamicTopLevel?: boolean | number | null
  isDynamicPfmSchema?: boolean | number | null
  subSchemaId?: number | string | null
  children?: Raw[]
  [key: string]: unknown
}

export type Opts = {
  topLevelNodesJson?: string | null
  supportSubSchemas?: boolean | number | null
  dynamicTopLevelNodeId?: number | string | null
  dynamicTopLevelDisplayName?: string | null
  dynamicSchemaTypeNames?: string[] | null
  subSchemaTypes?: Array<{ id: number; name: string }> | null
}

function norm(s: string | null | undefined) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
}

export function isMoved(name: string | null | undefined) {
  const n = norm(name)
  return n === MOVED.toLowerCase() || n === UNPLACED.toLowerCase()
}

function cid() {
  return `tl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function dynCfg(name: string): Cfg {
  return { id: "dyn", name: name.trim() || "Dynamic Node", dyn: true, order: 0 }
}

export function normalize(nodes: Cfg[] | null | undefined, dynName: string): Cfg[] {
  const list = Array.isArray(nodes) ? [...nodes] : []
  const fallback = dynName.trim() || "Dynamic Node"
  const idx = list.findIndex((n) => n.dyn === true)
  const dyn =
    idx >= 0
      ? {
          id: (list[idx]!.id || "").trim() || "dyn",
          name: fallback,
          dyn: true,
          order: idx,
          nodeId: list[idx]!.nodeId != null && Number(list[idx]!.nodeId) > 0 ? Number(list[idx]!.nodeId) : null,
        }
      : dynCfg(fallback)

  const out: Cfg[] = []
  let placed = false
  for (const n of list) {
    if (n.dyn) {
      if (!placed) {
        out.push(dyn)
        placed = true
      }
      continue
    }
    const name = String(n.name || "").trim()
    if (!name) continue
    if (name.toLowerCase() === UNPLACED.toLowerCase()) continue
    out.push({
      id: (n.id || "").trim() || cid(),
      name,
      dyn: false,
      order: out.length,
      nodeId: n.nodeId != null && Number(n.nodeId) > 0 ? Number(n.nodeId) : null,
    })
  }
  if (!placed) out.push(dyn)
  return out.map((n, i) => ({ ...n, order: i }))
}

export function parseJson(raw: unknown, dynName: string): Cfg[] {
  if (raw == null || raw === "") return normalize([], dynName)
  const parsed =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown
          } catch {
            return null
          }
        })()
      : raw
  if (!Array.isArray(parsed)) return normalize([], dynName)
  const mapped: Cfg[] = parsed.map((row: Record<string, unknown>, i: number) => ({
    id: String(row.clientId ?? row.id ?? cid()),
    name: String(row.name ?? row.title ?? "").trim(),
    dyn: row.isDynamic === true || row.dynamic === true,
    order: Number(row.sortOrder ?? i),
    nodeId: row.nodeId != null && Number.isFinite(Number(row.nodeId)) && Number(row.nodeId) > 0 ? Number(row.nodeId) : null,
  }))
  return normalize(mapped, dynName)
}

export function configured(nodes: Cfg[] | null | undefined, dynName?: string) {
  return normalize(nodes, dynName || "Dynamic Node").some((n) => !n.dyn && n.name.trim().length > 0)
}

function sid(node: Raw) {
  return String(Number(node.nodeId) || "")
}

function matches(node: Raw, cfg: Cfg, opts: Opts) {
  const nid = Number(node.nodeId)
  if (cfg.dyn) {
    const apiDynId = Number(opts.dynamicTopLevelNodeId)
    if (
      cfg.nodeId != null &&
      cfg.nodeId > 0 &&
      nid === cfg.nodeId &&
      !(Number.isFinite(apiDynId) && apiDynId > 0 && apiDynId !== cfg.nodeId)
    ) {
      return true
    }
    if (node.isDynamicTopLevel === true || node.isDynamicTopLevel === 1) return true
    if (Number.isFinite(apiDynId) && apiDynId > 0 && nid === apiDynId) return true
    const label = norm(opts.dynamicTopLevelDisplayName || cfg.name)
    if (label && norm(node.nodeName) === label) return true
    return false
  }
  if (cfg.nodeId != null && cfg.nodeId > 0 && nid === cfg.nodeId) return true
  const cfgName = norm(cfg.name)
  return cfgName.length > 0 && norm(node.nodeName) === cfgName
}

function pick<T extends Raw>(nodes: T[], cfg: Cfg, opts: Opts): T | null {
  const hits = nodes.filter((n) => matches(n, cfg, opts))
  if (!hits.length) return null
  if (cfg.dyn) {
    const apiDynId = Number(opts.dynamicTopLevelNodeId)
    if (Number.isFinite(apiDynId) && apiDynId > 0) {
      const byDynId = hits.find((n) => Number(n.nodeId) === apiDynId)
      if (byDynId) return byDynId
    }
    const sub = hits.find((n) => n.isDynamicPfmSchema === true || n.isDynamicPfmSchema === 1)
    if (sub) return sub
    const dyn = hits.find((n) => n.isDynamicTopLevel === true || n.isDynamicTopLevel === 1)
    if (dyn) return dyn
    const label = norm(opts.dynamicTopLevelDisplayName || cfg.name)
    if (label) {
      const byName = hits.find((n) => norm(n.nodeName) === label)
      if (byName) return byName
    }
  }
  if (cfg.nodeId != null && cfg.nodeId > 0) {
    const byId = hits.find((n) => Number(n.nodeId) === cfg.nodeId)
    if (byId) return byId
  }
  return hits[0] ?? null
}

function typeNames(opts: Opts) {
  return new Set((opts.dynamicSchemaTypeNames ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean))
}

function titleIds(opts: Opts) {
  const out = new Map<string, number>()
  for (const row of opts.subSchemaTypes ?? []) {
    const id = Number(row.id)
    const name = String(row.name ?? "")
      .trim()
      .toLowerCase()
    if (Number.isFinite(id) && id > 0 && name) out.set(name, id)
  }
  return out
}

function tagged(node: Raw, map: Map<string, number>) {
  const id = node.subSchemaId != null ? Number(node.subSchemaId) : null
  if (id == null || !Number.isFinite(id) || id <= 0) return false
  const expected = map.get(norm(node.nodeName))
  return expected != null && expected === id
}

function typeTree(node: Raw, names: Set<string>) {
  const id = node.subSchemaId != null ? Number(node.subSchemaId) : null
  if (id != null && Number.isFinite(id) && id > 0) return true
  const n = norm(node.nodeName)
  return n.length > 0 && names.has(n)
}

function extraType(node: Raw, roots: Raw[], names: Set<string>, map: Map<string, number>) {
  const n = norm(node.nodeName)
  if (!n) return true
  if (tagged(node, map)) {
    return roots.filter((e) => norm(e.nodeName) === n && tagged(e, map)).length > 1
  }
  return roots.some((e) => norm(e.nodeName) === n && tagged(e, map))
}

function showMoved(node: Raw, roots: Raw[], opts: Opts) {
  const names = typeNames(opts)
  if (!typeTree(node, names)) return true
  return extraType(node, roots, names, titleIds(opts))
}

function flattenMoved<T extends Raw>(nodes: T[]): T[] {
  const out: T[] = []
  for (const node of nodes) {
    if (isMoved(node.nodeName)) {
      out.push(...flattenMoved((node.children || []) as T[]))
      continue
    }
    const kids = node.children?.length ? flattenMoved(node.children as T[]) : node.children
    out.push(kids !== node.children ? ({ ...node, children: kids } as T) : node)
  }
  return out
}

export function enforce<T extends Raw>(children: T[] | null | undefined, opts: Opts): T[] {
  const entities = Array.isArray(children) ? [...children] : []
  if (!entities.length) return entities
  const support = opts.supportSubSchemas === true || opts.supportSubSchemas === 1
  if (!support) return entities

  const label =
    String(opts.dynamicTopLevelDisplayName ?? "").trim() ||
    parseJson(opts.topLevelNodesJson, "Dynamic Node").find((n) => n.dyn)?.name ||
    "Dynamic Node"
  const cfgs = parseJson(opts.topLevelNodesJson, label)
  if (!configured(cfgs, label)) return entities

  const used = new Set<string>()
  const ordered: T[] = []
  for (const cfg of cfgs) {
    const match = pick(
      entities.filter((e) => !used.has(sid(e)) && !isMoved(e.nodeName)),
      cfg,
      { ...opts, dynamicTopLevelDisplayName: label },
    )
    if (!match) continue
    used.add(sid(match))
    if (cfg.dyn) {
      ordered.push({
        ...match,
        nodeName: label,
        isDynamicTopLevel: true,
        supportSubSchema: true,
        supportEadWorkflow: false,
      } as unknown as T)
    } else {
      ordered.push(match)
    }
  }

  const buckets = entities.filter((e) => isMoved(e.nodeName))
  const primary = buckets[0] ?? null
  const dups = buckets.slice(1)
  const extras = entities.filter((e) => !used.has(sid(e)) && !isMoved(e.nodeName))

  const kids: T[] = []
  const seen = new Set<string>()
  const push = (child: T) => {
    const id = sid(child)
    if (!id || seen.has(id)) return
    seen.add(id)
    kids.push(child)
  }
  for (const child of (primary?.children || []) as T[]) {
    if (showMoved(child, entities, opts)) push(child)
  }
  for (const dup of dups) {
    for (const child of (dup.children || []) as T[]) {
      if (showMoved(child, entities, opts)) push(child)
    }
  }
  for (const extra of extras) {
    if (showMoved(extra, entities, opts)) push(extra)
  }

  const flat = flattenMoved(kids)
  if (!flat.length) return ordered.map((n, i) => ({ ...n, sequence: i } as T))

  const bucket = primary
    ? ({ ...primary, nodeName: MOVED, children: flat, sequence: ordered.length } as T)
    : ({
        nodeId: VIRTUAL_MOVED,
        nodeName: MOVED,
        nodeType: "BRANCH",
        isActive: true,
        children: flat,
        sequence: ordered.length,
      } as unknown as T)

  return [...ordered.map((n, i) => ({ ...n, sequence: i } as T)), bucket]
}

export function applyTopLevel<T extends Raw>(root: T | null | undefined, opts: Opts): T | null | undefined {
  if (!root || !Array.isArray(root.children)) return root
  return { ...root, children: enforce(root.children as T[], opts) }
}
