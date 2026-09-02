import { t, type Lang } from "./i18n"

export type OwnerFilter = {
  enabled: boolean
  active: boolean
  mode: "include" | "exclude"
  memberEmail: string
  memberLabel: string
  memberEmails: string[]
  includeMe: boolean
}

export type PfmFilter = {
  ids: number[]
  active: boolean
  paths: string[]
}

export const emptyOwner: OwnerFilter = {
  enabled: false,
  active: false,
  mode: "include",
  memberEmail: "",
  memberLabel: "",
  memberEmails: [],
  includeMe: true,
}

export const emptyPfm: PfmFilter = {
  ids: [],
  active: false,
  paths: [],
}

export function normalizeIds(raw: unknown) {
  if (!Array.isArray(raw)) return [] as number[]
  const ids: number[] = []
  for (const value of raw) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0 && !ids.includes(n)) ids.push(n)
  }
  return ids
}

export function normalizePaths(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[]
  const out: string[] = []
  for (const value of raw) {
    const path = String(value || "").trim()
    if (path && !out.includes(path)) out.push(path)
  }
  return out
}

export function mergeOwner(prev: OwnerFilter, next: Partial<OwnerFilter>): OwnerFilter {
  return {
    ...prev,
    ...next,
    memberEmails: Array.isArray(next.memberEmails) ? normalizePaths(next.memberEmails) : prev.memberEmails,
  }
}

export function mergePfm(raw: Partial<PfmFilter> | undefined): PfmFilter {
  const ids = normalizeIds(raw?.ids)
  const paths = normalizePaths(raw?.paths)
  return {
    ids,
    active: raw?.active === true && ids.length > 0,
    paths,
  }
}

function pickLabel(label: string) {
  const trimmed = label.trim()
  if (!trimmed) return ""
  const m = trimmed.match(/^(.+?)\s*\(([^)\s]+@[^)\s]+)\)\s*$/)
  if (m?.[1]?.trim()) return m[1].trim()
  if (trimmed.includes("@")) return ""
  return trimmed
}

export function ownerSummary(filter: OwnerFilter, lang: Lang = "en") {
  if (!filter.enabled) return t(lang, "ownerOff")
  if (!filter.active) return t(lang, "all")
  if (filter.memberEmails.length > 1) {
    const parts: string[] = []
    if (filter.includeMe) parts.push(t(lang, "me"))
    parts.push(t(lang, "ownerN", { count: filter.memberEmails.length }))
    return parts.length ? parts.join(" + ") : t(lang, "all")
  }
  if (filter.memberEmails.length === 1) {
    return pickLabel(filter.memberLabel) || filter.memberEmails[0] || t(lang, "ownerOne")
  }
  if (filter.memberEmail) return pickLabel(filter.memberLabel) || filter.memberEmail
  if (filter.includeMe) return t(lang, "me")
  return t(lang, "all")
}

type Saved = {
  owners: Record<string, OwnerFilter>
  pfm: Record<string, PfmFilter>
}

let owners: Record<string, OwnerFilter> = {}
let pfm: Record<string, PfmFilter> = {}
let persist: ((next: Saved) => void) | undefined

export function bindFilters(saved: Saved | undefined, write?: (next: Saved) => void) {
  owners = saved?.owners && typeof saved.owners === "object" ? { ...saved.owners } : {}
  pfm = saved?.pfm && typeof saved.pfm === "object" ? { ...saved.pfm } : {}
  persist = write
}

function flush() {
  persist?.({ owners, pfm })
}

export function readOwner(productId: number): OwnerFilter {
  return owners[String(productId)] ?? { ...emptyOwner }
}

export function writeOwner(productId: number, next: Partial<OwnerFilter>) {
  if (!(productId > 0)) return readOwner(productId)
  const merged = mergeOwner(readOwner(productId), next)
  owners = { ...owners, [String(productId)]: merged }
  flush()
  return merged
}

export function readPfmFilter(productId = 0): PfmFilter {
  if (!(productId > 0)) {
    const first = Object.values(pfm)[0]
    return first ? mergePfm(first) : { ...emptyPfm }
  }
  return mergePfm(pfm[String(productId)])
}

export function writePfmFilter(ids: number[], active: boolean, paths?: string[], productId = 0) {
  const pid = productId > 0 ? productId : 0
  const prev = pid > 0 ? mergePfm(pfm[String(pid)]) : mergePfm(Object.values(pfm)[0])
  const next = mergePfm({
    ids,
    active,
    paths: paths !== undefined ? paths : prev.paths,
  })
  if (pid > 0) {
    pfm = { ...pfm, [String(pid)]: next }
    flush()
    return next
  }
  const key = Object.keys(pfm)[0] || "0"
  pfm = { ...pfm, [key]: next }
  flush()
  return next
}

export function clearPfmFilter(productId = 0) {
  const prev = readPfmFilter(productId)
  return writePfmFilter(prev.ids, false, prev.paths, productId)
}
