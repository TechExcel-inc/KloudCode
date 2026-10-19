import { createSimpleContext } from "@opencode-ai/ui/context"
import { useLocation } from "@solidjs/router"
import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js"
import { decode64 } from "@/utils/base64"
import { tokenUser } from "@/ead/auth"
import { useEad } from "@/ead/settings"
import { useGlobalSDK } from "./global-sdk"
import { useGlobalSync } from "./global-sync"
import { useLayout } from "./layout"
import { recentProjects } from "@/pages/layout/helpers"

const absolute = (dir: string | undefined) => !!dir && (dir.startsWith("/") || /^[A-Za-z]:[\\/]/.test(dir))

/**
 * Per-user "last active" time of each project, kept in the server's database. A project counts as
 * active when it is opened, closed, or worked in (a session in it starts working).
 */
export const { use: useProjectActivity, provider: ProjectActivityProvider } = createSimpleContext({
  name: "ProjectActivity",
  init: () => {
    const sdk = useGlobalSDK()
    const sync = useGlobalSync()
    const ead = useEad()
    const layout = useLayout()
    const location = useLocation()
    const user = createMemo(() => tokenUser(ead.token()))
    const [version, setVersion] = createSignal(0)

    const touch = (directory: string | undefined) => {
      if (!absolute(directory)) return
      sdk.client.global.projectActivity
        .touch({ user: user(), directory })
        .then(() => setVersion((v) => v + 1))
        .catch(() => undefined)
    }

    // Opening a project, and switching user while one is open.
    createEffect(
      on([() => decode64(location.pathname.split("/")[1]), user], ([dir]) => touch(dir), { defer: false }),
    )

    // Closing a project removes it from the open list.
    createEffect(
      on(
        () => layout.projects.list().map((item) => item.worktree),
        (next, prev) => {
          if (!prev) return
          for (const dir of prev) if (!next.includes(dir)) touch(dir)
        },
      ),
    )

    // Work in a project: a session there starts running. At most once a minute per folder.
    const worked = new Map<string, number>()
    const stop = sdk.event.listen((e) => {
      const event = e.details
      if (event?.type !== "session.status" || event.properties.status.type !== "busy") return
      const now = Date.now()
      if (now - (worked.get(e.name) ?? 0) < 60_000) return
      worked.set(e.name, now)
      touch(e.name)
    })
    onCleanup(stop)

    return {
      user,
      touch,
      /** Changes after each recorded activity, so open lists can refetch. */
      version,
      /** Recently active projects, newest first, one per project root. */
      async recent(input: { limit?: number; query?: string; skip?: string[] } = {}) {
        const limit = input.limit ?? 10
        const rows = await sdk.client.global.projectActivity
          .list({ user: user(), limit: limit + (input.skip?.length ?? 0) + 10, query: input.query || undefined })
          .then((res) => res.data ?? [])
          .catch(() => [])
        return recentProjects(rows, sync.data.project, input.skip).slice(0, limit)
      },
    }
  },
})
