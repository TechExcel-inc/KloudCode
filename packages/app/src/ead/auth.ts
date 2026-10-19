/** Provider API keys (DeepSeek, OpenAI, and similar) start with sk-. They are not sign-in passwords. */
export function looksLikeProviderApiKey(value: string) {
  return /^sk[-_]/i.test(value.trim())
}

/** Renew when less than this much time is left; EAD Pilot renews logins up to 30 days past expiry. */
export const RENEW = 6 * 60 * 60 * 1000

/** Expiry of a login token in epoch ms, or undefined when it cannot be read. */
export function tokenExpiry(token: string) {
  const part = token.trim().split(".")[1]
  if (!part) return
  try {
    const exp = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))).exp
    return typeof exp === "number" ? exp * 1000 : undefined
  } catch {
    return
  }
}

export function tokenExpired(token: string, now = Date.now()) {
  const exp = tokenExpiry(token)
  return exp !== undefined && now >= exp
}

export function renewDue(token: string, now = Date.now()) {
  const exp = tokenExpiry(token)
  return exp !== undefined && exp - now < RENEW
}
