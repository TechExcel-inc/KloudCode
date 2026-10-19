import type { Message, Session } from "@opencode-ai/sdk/v2/client"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { showToast } from "@opencode-ai/ui/toast"
import { createEffect, on, onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useCowork } from "@/context/cowork"
import { useGlobalSDK } from "@/context/global-sdk"
import { CoworkFail, usage, type CoworkSession } from "@/ead/cowork"
import { DAY, stale } from "@/utils/archive"

const PLAN = /^EAD \d+(\.\d+)?$/

/**
 * Session states, kept in EAD Pilot (CoWork_Project_Sessions). Every session's record (title,
 * project, usage, plan and model) is sent to Pilot as it changes; Finished, Archived and Auto
 * Archived are Pilot states. Sessions with no activity for the company's auto-archive days are
 * archived automatically. The conversation itself stays in CoWork's engine.
 */
export const { use: useArchive, provider: ArchiveProvider } = createSimpleContext({
  name: "Archive",
  init: () => {
    const globalSDK = useGlobalSDK()
    const cowork = useCowork()
    const [store, setStore] = createStore({
      days: 7,
      /** Pilot's record of each session this person owns, by session id. */
      sessions: {} as Record<string, CoworkSession>,
      ready: false,
    })

    const remember = (row: CoworkSession | undefined) => {
      if (row) setStore("sessions", row.sessionUid, reconcile(row))
      return row
    }

    const load = async () => {
      const api = cowork.api()
      setStore("ready", false)
      if (!api) return setStore("sessions", reconcile({}))
      const settings = await api.settings().catch(() => undefined)
      if (settings) setStore("days", settings.autoArchiveDays)
      const next: Record<string, CoworkSession> = {}
      let cursor: string | undefined
      for (let page = 0; page < 10; page++) {
        const res = await api.sessions({ limit: 200, cursor }).catch(() => undefined)
        if (!res) break
        for (const row of res.sessions) next[row.sessionUid] = row
        if (!res.next) break
        cursor = res.next
      }
      setStore("sessions", reconcile(next))
      setStore("ready", true)
    }
    createEffect(on(cowork.api, () => void load()))

    /** Sends one session's record to Pilot. Usage totals are read from its messages when `full`. */
    const send = async (session: Session, full: boolean) => {
      const api = cowork.api()
      const projectId = cowork.projectOf(session.directory)
      if (!api || !projectId) return
      const messages = full
        ? await globalSDK.client.session
            .messages({ sessionID: session.id, directory: session.directory })
            .then((res) => (res.data ?? []).map((item) => item.info as Message))
            .catch(() => undefined)
        : undefined
      const last = messages?.findLast((item) => item.role === "assistant")
      const model = last?.role === "assistant" ? last : undefined
      return remember(
        await api
          .upsert(session.id, {
            projectId,
            parentSessionUid: session.parentID,
            title: session.title || session.id,
            ...(messages ? usage(messages) : {}),
            linesAdded: session.summary?.additions,
            linesDeleted: session.summary?.deletions,
            filesChanged: session.summary?.files,
            startedAt: new Date(session.time.created).toISOString(),
            lastActiveAt: new Date(session.time.updated).toISOString(),
            planCode: model && PLAN.test(model.modelID) ? model.modelID : undefined,
            modelName: model?.modelID,
            agentName: model?.agent,
            modelVariant: model?.variant,
          })
          .catch((err) => {
            if (!(err instanceof CoworkFail) || err.code !== "SESSION_DELETED") throw err
            return undefined
          }),
      )
    }

    // Keep Pilot current: titles and times as they change, usage when a turn finishes.
    const waiting = new Map<string, ReturnType<typeof setTimeout>>()
    const known = new Map<string, Session>()
    const queue = (session: Session, full: boolean, delay: number) => {
      known.set(session.id, session)
      clearTimeout(waiting.get(session.id))
      waiting.set(
        session.id,
        setTimeout(() => {
          waiting.delete(session.id)
          void send(known.get(session.id) ?? session, full).catch(() => undefined)
        }, delay),
      )
    }
    const stop = globalSDK.event.listen((e) => {
      const event = e.details
      if (event?.type === "session.created" || event?.type === "session.updated") {
        queue(event.properties.info, !store.sessions[event.properties.info.id], 3000)
        return
      }
      if (event?.type === "session.status" && event.properties.status.type === "idle") {
        const session = known.get(event.properties.sessionID)
        if (session) queue(session, true, 500)
      }
    })
    onCleanup(() => {
      stop()
      for (const timer of waiting.values()) clearTimeout(timer)
    })

    /** Makes sure Pilot has the session before changing its state. */
    const ensure = async (session: Session) => store.sessions[session.id] ?? (await send(session, true))

    const fail = (err: unknown) =>
      showToast({ variant: "error", description: err instanceof Error ? err.message : String(err) })

    const set = (session: Session, time: number | null) =>
      globalSDK.client.session.update({ directory: session.directory, sessionID: session.id, time: { archived: time } })

    let sweeping = false
    const sweep = async () => {
      const api = cowork.api()
      if (!api || !store.ready || sweeping || store.days <= 0) return
      sweeping = true
      const now = Date.now()
      const list = await globalSDK.client.experimental.session
        .list({ roots: true, cursor: now - store.days * DAY, limit: 500 })
        .then((res) => res.data ?? [])
        .catch(() => [])
      const open = location.pathname.match(/\/session\/([^/?#]+)/)?.[1]
      // Pilot's last activity counts too, so "Make active" keeps a session from being archived again.
      const kept = Object.fromEntries(
        Object.values(store.sessions).map((row) => [row.sessionUid, Date.parse(row.lastActiveAt)]),
      )
      for (const item of stale(list, { days: store.days, now, kept, open })) {
        if (!cowork.projectOf(item.directory)) continue
        await ensure(item)
          .then(() => api.archive(item.id, "AUTO"))
          .then(remember)
          .then(() => set(item, now))
          .catch(() => undefined)
      }
      sweeping = false
    }
    createEffect(on([() => store.ready, () => store.days], () => void sweep()))
    const timer = setInterval(() => void sweep(), 60 * 60 * 1000)
    onCleanup(() => clearInterval(timer))

    const state = (id: string) => store.sessions[id]?.state
    const since = (pick: (row: CoworkSession) => string | undefined) =>
      Object.fromEntries(
        Object.values(store.sessions).flatMap((row) => {
          const time = pick(row)
          return time ? [[row.sessionUid, Date.parse(time)]] : []
        }),
      ) as Record<string, number>

    return {
      days: () => store.days,
      /** Company setting in Pilot; only company owners and admins may change it. */
      setDays(days: number) {
        const api = cowork.api()
        if (!api) return
        void api
          .saveSettings({ autoArchiveDays: Math.max(0, Math.floor(days)) })
          .then((saved) => setStore("days", saved.autoArchiveDays))
          .catch(fail)
      },
      kind: (session: Pick<Session, "id" | "time">) => {
        const row = store.sessions[session.id]
        if (row?.state === "ARCHIVED") return row.archivedBy === "AUTO" ? ("auto" as const) : ("manual" as const)
        if (session.time.archived) return "manual" as const
        return row?.state === "FINISHED" ? ("finished" as const) : ("active" as const)
      },
      auto: () => since((row) => (row.state === "ARCHIVED" && row.archivedBy === "AUTO" ? row.archivedAt : undefined)),
      finished: () => since((row) => (row.state === "FINISHED" ? row.finishedAt : undefined)),
      done: (id: string) => state(id) === "FINISHED",
      /** Pilot's record of a session, when it has one (usage totals, plan, model). */
      record: (id: string) => store.sessions[id],
      async finish(session: Session) {
        const api = cowork.api()
        if (!api) return
        await ensure(session)
          .then(() => api.finish(session.id))
          .then(remember)
          .catch(fail)
      },
      async reopen(session: Session) {
        const api = cowork.api()
        if (!api || state(session.id) !== "FINISHED") return
        await api.reopen(session.id).then(remember).catch(fail)
      },
      async archive(session: Session) {
        await set(session, Date.now())
        const api = cowork.api()
        if (!api) return
        await ensure(session)
          .then(() => api.archive(session.id, "USER"))
          .then(remember)
          .catch(fail)
      },
      async restore(session: Session) {
        await set(session, null)
        const api = cowork.api()
        if (!api) return
        if (state(session.id) === "ARCHIVED") await api.unarchive(session.id).then(remember).catch(fail)
        await send({ ...session, time: { ...session.time, updated: Date.now() } }, false).catch(() => undefined)
      },
    }
  },
})
