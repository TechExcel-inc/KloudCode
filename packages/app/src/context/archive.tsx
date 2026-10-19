import type { Session } from "@opencode-ai/sdk/v2/client"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createEffect, on, onCleanup } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { DAY, stale } from "@/utils/archive"
import { Persist, persisted } from "@/utils/persist"

/**
 * Session archiving. Sessions with no activity for the chosen number of days are archived
 * automatically (as Claude does), and the ones this app archived that way are remembered so the
 * archived view can tell them from sessions archived by hand. Sessions can also be marked finished,
 * which Advanced Search uses to tell finished work from open work.
 */
export const { use: useArchive, provider: ArchiveProvider } = createSimpleContext({
  name: "Archive",
  init: () => {
    const globalSDK = useGlobalSDK()
    const [store, setStore, , ready] = persisted(
      Persist.global("archive", ["archive.v1"]),
      createStore({
        days: 7,
        /** Archived automatically, by session id: when. */
        auto: {} as Record<string, number>,
        /** Brought back with "Make active", by session id: when. Counts as activity. */
        kept: {} as Record<string, number>,
        /** Marked finished by the person, by session id: when. */
        finished: {} as Record<string, number>,
      }),
    )

    const set = (session: Session, time: number | null) =>
      globalSDK.client.session.update({ directory: session.directory, sessionID: session.id, time: { archived: time } })

    let sweeping = false
    const sweep = async () => {
      if (!ready() || sweeping || store.days <= 0) return
      sweeping = true
      const now = Date.now()
      const list = await globalSDK.client.experimental.session
        .list({ roots: true, cursor: now - store.days * DAY, limit: 500 })
        .then((res) => res.data ?? [])
        .catch(() => [])
      const open = location.pathname.match(/\/session\/([^/?#]+)/)?.[1]
      for (const item of stale(list, { days: store.days, now, kept: store.kept, open })) {
        const ok = await set(item, now)
          .then(() => true)
          .catch(() => false)
        if (ok) setStore("auto", item.id, now)
      }
      sweeping = false
    }

    createEffect(on([ready, () => store.days], () => void sweep()))
    const timer = setInterval(() => void sweep(), 60 * 60 * 1000)
    onCleanup(() => clearInterval(timer))

    const forget = (id: string) =>
      setStore(
        "auto",
        produce((auto) => {
          delete auto[id]
        }),
      )

    return {
      days: () => store.days,
      setDays(days: number) {
        setStore("days", Math.max(0, Math.floor(days)))
      },
      kind: (session: Pick<Session, "id" | "time">) => {
        if (session.time.archived) return store.auto[session.id] ? ("auto" as const) : ("manual" as const)
        return store.finished?.[session.id] ? ("finished" as const) : ("active" as const)
      },
      auto: () => store.auto,
      finished: () => store.finished ?? {},
      done: (id: string) => !!store.finished?.[id],
      finish(id: string) {
        setStore("finished", (all) => ({ ...all, [id]: Date.now() }))
      },
      reopen(id: string) {
        if (!store.finished?.[id]) return
        // A plain object would be merged into the store, keeping the key; delete it in place.
        setStore(
          "finished",
          produce((all) => {
            delete all[id]
          }),
        )
      },
      async archive(session: Session) {
        await set(session, Date.now())
        forget(session.id)
      },
      async restore(session: Session) {
        await set(session, null)
        forget(session.id)
        setStore("kept", session.id, Date.now())
      },
    }
  },
})
