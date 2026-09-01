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

/** Ancestor nodePaths of target (root → parent), for source expand-to-highlight. */
export function pathTrail<T extends { nodeId: number; nodePath: string; children: T[] }>(
  nodes: T[],
  target: number,
): string[] {
  const walk = (list: T[], trail: string[]): string[] | undefined => {
    for (const node of list) {
      if (node.nodeId === target) return trail
      const hit = walk(node.children, [...trail, node.nodePath])
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

/** Source-code path allowlist — keep in sync with Cursor extension sourceTree.ts. */
const EXTS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "vue",
  "svelte",
  "java",
  "kt",
  "kts",
  "scala",
  "go",
  "rs",
  "py",
  "rb",
  "php",
  "cs",
  "vb",
  "aspx",
  "ascx",
  "asmx",
  "asax",
  "master",
  "resx",
  "csproj",
  "vbproj",
  "sln",
  "config",
  "svc",
  "wsdl",
  "cpp",
  "cc",
  "cxx",
  "c",
  "h",
  "hpp",
  "rc",
  "idl",
  "def",
  "swift",
  "m",
  "mm",
  "sql",
  "xml",
  "json",
  "yaml",
  "yml",
  "md",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "sass",
  "sh",
  "bash",
  "zsh",
  "bat",
  "ps1",
  "gradle",
  "properties",
  "toml",
  "ini",
  "env",
  "graphql",
  "gql",
  "proto",
  "wasm",
])

function isFile(path: string) {
  const n = path.trim().replace(/\\/g, "/")
  if (n.includes("@") && !n.includes("/", n.indexOf("@"))) return false
  const base = n.split("/").filter(Boolean).pop() || ""
  if (!base || base.includes("@")) return false
  const dot = base.lastIndexOf(".")
  if (dot <= 0 || dot === base.length - 1) return false
  return EXTS.has(base.slice(dot + 1).toLowerCase())
}

function rel(path: string) {
  const n = path.trim().replace(/\\/g, "/")
  const at = n.indexOf("@")
  if (at < 0) return n.replace(/^\/+|\/+$/g, "")
  const slash = n.indexOf("/", at)
  if (slash < 0 || slash >= n.length - 1) return ""
  return n.slice(slash + 1).trim()
}

export function repoOf(path: string) {
  const n = path.trim()
  const at = n.indexOf("@")
  if (at <= 0) return ""
  return n.slice(0, at).trim()
}

/** Linked file sits under a source-tree folder (Cursor linkedSourceFileUnderSelectedFolder). */
export function underFolder(file: string, folder: string) {
  if (!file.trim() || !folder.trim()) return false
  if (!isFile(file)) {
    const only = file.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
    if (!isFile(only)) return false
  }
  let next = file.trim().replace(/\\/g, "/")
  const root = repoOf(folder)
  if (!next.includes("@") && root) next = `${root}/${next.replace(/^\/+/, "")}`
  const fileRel = next.includes("@") ? rel(next) : next.replace(/^\/+|\/+$/g, "")
  if (!fileRel) return false
  const folderRel = folder.includes("@") ? rel(folder) : folder.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
  if (!folderRel) {
    if (!root) return false
    return repoOf(next).toLowerCase() === root.toLowerCase()
  }
  return fileRel === folderRel || fileRel.startsWith(`${folderRel}/`)
}

export function hits(linked: string, node: string) {
  const a = linked.trim()
  const b = node.trim()
  if (!a || !b) return false
  for (const left of pathCandidates(a)) {
    for (const right of pathCandidates(b)) {
      if (left === right) return true
      if (left.endsWith(`/${right}`) || right.endsWith(`/${left}`)) return true
    }
  }
  return pathMatches(b, [a])
}

/** Recompute Source EAD badges from filtered PFM nodes (Cursor computeFilteredEadCountsByPath). */
export function filteredCounts(
  paths: string[],
  nodes: Array<{ nodeId: number; paths: string[] }>,
  eads: Record<number, number>,
) {
  const out: Record<string, number> = {}
  if (!paths.length || !nodes.length) return out
  for (const path of paths) {
    const trimmed = path.trim()
    if (!trimmed) continue
    const seen = new Set<number>()
    let total = 0
    for (const node of nodes) {
      if (!(node.nodeId > 0) || seen.has(node.nodeId)) continue
      const match = node.paths.some((raw) => {
        const p = raw.trim()
        if (!p) return false
        return hits(p, trimmed) || underFolder(p, trimmed)
      })
      if (!match) continue
      seen.add(node.nodeId)
      total += eads[node.nodeId] ?? 0
    }
    if (total > 0) out[trimmed] = total
  }
  return out
}

export function idCounts(rows: SourceRow[], byPath: Record<string, number>) {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const n = byPath[row.nodePath]
    if (typeof n === "number" && n > 0) out[String(row.nodeId)] = n
  }
  return out
}
