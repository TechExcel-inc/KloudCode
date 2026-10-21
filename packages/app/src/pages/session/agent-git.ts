/** Shell commands the Changes box runs to commit and push, and how their output is read. */

export const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`

const COMMITTED = "__SICODE_COMMITTED__"
const PUSHED = "__SICODE_PUSHED__"

/**
 * Pushes the current branch to origin (or the first remote), setting it as upstream for a new branch.
 * Uses git alone and no shell variables: login shells may replace tools like grep, and zsh treats `r` specially.
 */
const push = `git push -u "$(git remote get-url origin >/dev/null 2>&1 && echo origin || git remote | head -n 1)" HEAD 2>&1`

/**
 * Stages and commits exactly the given files (paths relative to the repository root, as git status lists them),
 * never anything else: `add -A -- <file>` also stages a deletion, and `commit -- <files>` leaves any other staged
 * file out. Literal pathspecs so a name with `*` or `?` matches only itself.
 */
function commit(files: string[], message: string) {
  const paths = files.map(quote).join(" ")
  return `cd "$(git rev-parse --show-toplevel)" && git --literal-pathspecs add -A -- ${paths} && git --literal-pathspecs commit -m ${quote(message)} -- ${paths} && echo ${COMMITTED}`
}

/** Commits the given files with the message, without pushing. */
export function commitOnly(files: string[], message: string) {
  return commit(files, message)
}

/** Commits the given files with the message, then pushes; markers report how far it got. */
export function commitAndPush(files: string[], message: string) {
  return `${commit(files, message)} && ${push} && echo ${PUSHED}`
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
