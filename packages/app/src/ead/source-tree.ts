/** Source tree helpers — aligned with Cursor extension sourceTree.ts */

export type SourceRow = {
  nodeId: number
  parentNodeId?: number | null
  nodeName: string
  nodePath: string
  nodeType?: string
  isLeaf?: boolean
}

export type SourceNode = {
  nodeId: number
  nodeName: string
  nodePath: string
  nodeType: string
  isLeaf: boolean
  children: SourceNode[]
}

export function hideIndex(name: string | null | undefined, type?: string | null) {
  const kind = (type || "").trim().toUpperCase()
  if (kind && kind !== "FILE") return false
  const n = (name || "").trim().toLowerCase()
  return n === "index.vue" || n === "index.tsx" || n === "page.tsx"
}

export function parseRows(raw: Array<Record<string, unknown>>): SourceRow[] {
  return raw.flatMap((row) => {
    const nodeId = Number(row.nodeId)
    const nodePath = typeof row.nodePath === "string" ? row.nodePath.trim() : ""
    if (!Number.isFinite(nodeId) || nodeId <= 0 || !nodePath) return []
    if (row.isActive === false || Number(row.isActive) === 0) return []
    return [
      {
        nodeId,
        parentNodeId: Number.isFinite(Number(row.parentNodeId)) ? Number(row.parentNodeId) : null,
        nodeName:
          typeof row.nodeName === "string" && row.nodeName.trim()
            ? row.nodeName.trim()
            : nodePath.split("/").pop() || nodePath,
        nodePath,
        nodeType: typeof row.nodeType === "string" ? row.nodeType : undefined,
        isLeaf: row.isLeaf === true || Number(row.isLeaf) === 1,
      },
    ]
  })
}

export function filterDisplay(rows: SourceRow[]): SourceRow[] {
  return rows.filter((row) => !hideIndex(row.nodeName, row.nodeType))
}

export function buildTree(rows: SourceRow[]): SourceNode[] {
  const byId = new Map<number, SourceNode>()
  const parent = new Map<number, number | null>()

  for (const row of rows) {
    byId.set(row.nodeId, {
      nodeId: row.nodeId,
      nodeType: row.nodeType || "FOLDER",
      nodeName: row.nodeName,
      nodePath: row.nodePath,
      isLeaf: row.isLeaf === true,
      children: [],
    })
    const pid = Number(row.parentNodeId)
    parent.set(row.nodeId, Number.isFinite(pid) && pid > 0 ? pid : null)
  }

  const roots: SourceNode[] = []
  for (const [id, node] of byId.entries()) {
    const pid = parent.get(id)
    if (pid != null && byId.has(pid)) {
      byId.get(pid)!.children.push(node)
      continue
    }
    roots.push(node)
  }

  const sort = (list: SourceNode[]) => {
    list.sort((a, b) => a.nodeName.localeCompare(b.nodeName))
    list.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}

export function filterSource(nodes: SourceNode[], q: string): SourceNode[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return nodes
  return nodes.flatMap((node) => {
    const kids = filterSource(node.children, needle)
    const hit =
      node.nodeName.toLowerCase().includes(needle) ||
      String(node.nodeId).includes(needle) ||
      node.nodePath.toLowerCase().includes(needle) ||
      node.nodeType.toLowerCase().includes(needle)
    if (hit || kids.length) return [{ ...node, children: kids }]
    return []
  })
}

export function filterByCount(
  nodes: SourceNode[],
  counts: Record<string, number>,
  pending: Record<string, boolean>,
  only: boolean,
): SourceNode[] {
  if (!only) return nodes
  return nodes.flatMap((node) => {
    const kids = filterByCount(node.children, counts, pending, true)
    const count = Number(counts[String(node.nodeId)] || 0)
    const wait = pending[node.nodePath] === true && count <= 0
    if (count > 0 || wait || kids.length) return [{ ...node, children: kids }]
    return []
  })
}

export function filterByIds<T extends { nodeId: number; children: T[] }>(nodes: T[], ids: Set<number> | undefined): T[] {
  if (!ids || ids.size === 0) return nodes
  return nodes.flatMap((node) => {
    const kids = filterByIds(node.children, ids)
    if (ids.has(node.nodeId) || kids.length) return [{ ...node, children: kids }]
    return []
  })
}

export function filterPfm<T extends { name: string; nodeId: number; children: T[] }>(nodes: T[], q: string): T[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return nodes
  return nodes.flatMap((node) => {
    const kids = filterPfm(node.children, needle)
    const hit = node.name.toLowerCase().includes(needle) || String(node.nodeId).includes(needle)
    if (hit || kids.length) return [{ ...node, children: kids }]
    return []
  })
}

export function badge(nodeId: number, counts: Record<string, number>) {
  const n = Number(counts[String(nodeId)] || 0)
  return n > 0 ? n : 0
}

export function collectIds<T extends { nodeId: number; children: T[] }>(nodes: T[]): number[] {
  const out: number[] = []
  const walk = (list: T[]) => {
    for (const node of list) {
      if (node.nodeId > 0) out.push(node.nodeId)
      if (node.children.length) walk(node.children)
    }
  }
  walk(nodes)
  return out
}

/** Parent badge = own count + descendants (Cursor rollupPfmCountsByMapTree). */
export function rollupCounts<T extends { nodeId: number; children: T[] }>(
  nodes: T[],
  direct: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {}
  const walk = (node: T): number => {
    const self = Number(direct[String(node.nodeId)] || 0)
    let sum = self
    for (const child of node.children) sum += walk(child)
    if (sum > 0) out[String(node.nodeId)] = sum
    return sum
  }
  for (const node of nodes) walk(node)
  return out
}

/** Ancestors of target (root → parent), for expand-to-work-context. */
export function pathIds<T extends { nodeId: number; children: T[] }>(nodes: T[], target: number): number[] {
  const walk = (list: T[], path: number[]): number[] | undefined => {
    for (const node of list) {
      if (node.nodeId === target) return path
      const hit = walk(node.children, [...path, node.nodeId])
      if (hit) return hit
    }
  }
  return walk(nodes, []) ?? []
}

export function normalizePath(path: string | null | undefined) {
  const raw = String(path || "").trim()
  if (!raw) return ""
  return raw.replace(/\/+$/, "")
}

export function pathCandidates(path: string | null | undefined) {
  const normalized = normalizePath(path)
  if (!normalized) return [] as string[]
  const out = new Set<string>([normalized])
  const at = normalized.indexOf("@")
  if (at <= 0) return [...out]
  const repo = normalized.slice(0, at)
  const after = normalized.slice(at + 1)
  const slash = after.indexOf("/")
  const rel = slash >= 0 ? after.slice(slash + 1) : ""
  const name = repo.split("/").filter(Boolean).pop()
  if (rel) out.add(rel)
  if (name && rel) out.add(`${name}/${rel}`)
  return [...out]
}

export function pathMatches(rowPath: string, linked: string[]) {
  const row = normalizePath(rowPath)
  if (!row) return false
  for (const raw of linked) {
    for (const candidate of pathCandidates(raw)) {
      const path = normalizePath(candidate)
      if (!path) continue
      if (row === path || row.startsWith(`${path}/`) || path.startsWith(`${row}/`)) return true
    }
  }
  return false
}

/** Keep linked files plus ancestor folders (Cursor filterSourceTreeRowsByLinkedPaths). */
export function filterLinked(rows: SourceRow[], linked: string[] | null | undefined): SourceRow[] {
  const paths = (linked ?? []).map((p) => p.trim()).filter(Boolean)
  if (!paths.length) return []
  const keep = new Set<string>()
  for (const row of rows) {
    const rowPath = row.nodePath?.trim()
    if (!rowPath) continue
    if (!pathMatches(rowPath, paths)) continue
    keep.add(rowPath)
    const parts = normalizePath(rowPath).split("/").filter(Boolean)
    for (let i = 1; i <= parts.length; i++) keep.add(parts.slice(0, i).join("/"))
  }
  if (!keep.size) return []
  return rows.filter((row) => {
    const rowPath = row.nodePath?.trim()
    if (!rowPath) return false
    if (keep.has(rowPath)) return true
    return paths.some((file) => pathMatches(rowPath, [file]))
  })
}

export function filterLinkedTree(nodes: SourceNode[], linked: string[] | null | undefined): SourceNode[] {
  const paths = (linked ?? []).map((p) => p.trim()).filter(Boolean)
  if (!paths.length) return []
  return nodes.flatMap((node) => {
    const kids = filterLinkedTree(node.children, paths)
    if (pathMatches(node.nodePath, paths) || kids.length) return [{ ...node, children: kids }]
    return []
  })
}
