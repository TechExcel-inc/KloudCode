import { eadHttp } from "./http"
import { EAD_API_URL } from "./urls"

export type Product = {
  productId: number
  name: string
}

export type PfmNode = {
  nodeId: number
  name: string
  children: PfmNode[]
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

type Http = typeof fetch

function headers(token: string) {
  const out: Record<string, string> = { Accept: "application/json" }
  if (token) out.Authorization = `Bearer ${token}`
  return out
}

async function call(http: Http, path: string, token: string, init?: RequestInit) {
  const res = await http(`${EAD_API_URL}${path}`, {
    ...init,
    headers: {
      ...headers(token),
      ...(init?.headers ?? {}),
    },
  }).catch((err) => {
    throw new Error(err instanceof Error ? err.message : "Load failed")
  })
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

export async function login(identifier: string, password: string, http: Http = eadHttp()) {
  const body = {
    loginMethod: "password",
    identifier: identifier.trim(),
    password: btoa(password),
  }
  const res = await http(`${EAD_API_URL}/auth/login`, {
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

export async function loadActiveMap(token: string, productId: number, http: Http = eadHttp()) {
  const map = (await call(http, `/pfm-maps/product/${productId}/active`, token)) as MapPayload
  const mapId = Number(map.mapId ?? 0)
  const root = asNode(map.rootNode)
  return {
    mapId: Number.isFinite(mapId) && mapId > 0 ? mapId : 0,
    root,
  }
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
