export function tokenExpired(token: string) {
  const raw = token.trim()
  if (!raw) return false
  const part = raw.split(".")[1]
  if (!part) return false
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")))
    const exp = json.exp
    if (typeof exp !== "number") return false
    return Date.now() >= exp * 1000
  } catch {
    return false
  }
}
