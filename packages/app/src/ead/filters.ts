export type OwnerFilter = {
  enabled: boolean
  active: boolean
  mode: "include" | "exclude"
  memberEmail: string
  memberLabel: string
  memberEmails: string[]
  includeMe: boolean
}

const empty: OwnerFilter = {
  enabled: false,
  active: false,
  mode: "include",
  memberEmail: "",
  memberLabel: "",
  memberEmails: [],
  includeMe: true,
}

const byProduct = new Map<number, OwnerFilter>()
let pfmIds: number[] = []
let pfmActive = false

export function readOwner(productId: number): OwnerFilter {
  return byProduct.get(productId) ?? { ...empty }
}

export function writeOwner(productId: number, next: Partial<OwnerFilter>) {
  const prev = readOwner(productId)
  const merged: OwnerFilter = {
    ...prev,
    ...next,
    memberEmails: Array.isArray(next.memberEmails) ? next.memberEmails : prev.memberEmails,
  }
  byProduct.set(productId, merged)
  return merged
}

export function ownerSummary(filter: OwnerFilter) {
  if (!filter.enabled) return "Job owner filter off"
  if (!filter.active) return "All"
  if (filter.memberEmails.length > 1) {
    const n = filter.memberEmails.length + (filter.includeMe ? 1 : 0)
    return `${n} owners`
  }
  if (filter.memberEmails.length === 1) return filter.memberLabel || filter.memberEmails[0] || "1 owner"
  if (filter.memberEmail) return filter.memberLabel || filter.memberEmail
  if (filter.includeMe) return "Me"
  return "All"
}

export function readPfmFilter() {
  if (pfmActive && pfmIds.length === 0) pfmActive = false
  return { ids: pfmIds, active: pfmActive }
}

export function writePfmFilter(ids: number[], active: boolean) {
  pfmIds = ids.filter((id) => Number.isFinite(id) && id > 0)
  pfmActive = active && pfmIds.length > 0
  return { ids: pfmIds, active: pfmActive }
}

export function clearPfmFilter() {
  pfmIds = []
  pfmActive = false
}
