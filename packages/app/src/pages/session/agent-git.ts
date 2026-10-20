/** Shell commands the Changes box runs to commit and push, and how their output is read. */

export const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`

const COMMITTED = "__SICODE_COMMITTED__"
const PUSHED = "__SICODE_PUSHED__"

/**
 * Pushes the current branch to origin (or the first remote), setting it as upstream for a new branch.
 * Uses git alone and no shell variables: login shells may replace tools like grep, and zsh treats `r` specially.
 */
const push = `git push -u "$(git remote get-url origin >/dev/null 2>&1 && echo origin || git remote | head -n 1)" HEAD 2>&1`

/** Commits the given files with the message, then pushes; markers report how far it got. */
export function commitAndPush(files: string[], message: string) {
  const paths = files.map(quote).join(" ")
  return `git add -A -- ${paths} && git commit -m ${quote(message)} -- ${paths} && echo ${COMMITTED} && ${push} && echo ${PUSHED}`
}

/** Pushes commits that are on this computer but not on the remote yet. */
export function pushOnly() {
  return `${push} && echo ${PUSHED}`
}

export type GitOutcome = { committed: boolean; pushed: boolean; log: string }

/** What a commitAndPush or pushOnly run did, from its output. */
export function readOutcome(output: string): GitOutcome {
  const log = output.replaceAll(COMMITTED, "").replaceAll(PUSHED, "").trim()
  return { committed: output.includes(COMMITTED), pushed: output.includes(PUSHED), log }
}
