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
  if (!filter.active) return "Job owner filter inactive"
  const who = filter.memberEmails.length
    ? filter.memberEmails.join(", ")
    : filter.memberEmail || (filter.includeMe ? "me" : "none")
  return `${filter.mode} ${who}`
}

export function readPfmFilter() {
  return { ids: pfmIds, active: pfmActive }
}

export function writePfmFilter(ids: number[], active: boolean) {
  pfmIds = ids
  pfmActive = active
  return { ids: pfmIds, active: pfmActive }
}

export function clearPfmFilter() {
  pfmIds = []
  pfmActive = false
}
