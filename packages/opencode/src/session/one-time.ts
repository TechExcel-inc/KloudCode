import z from "zod"
import { Effect, Option } from "effect"
import { NamedError } from "@opencode-ai/util/error"
import { Session } from "./index"
import { MessageV2 } from "./message-v2"
import { MessageID, PartID, SessionID } from "./schema"
import { Provider } from "@/provider/provider"
import { Agent } from "@/agent/agent"

/**
 * One-session-only models: a session opened for a single special-service model.
 * The model is stored on the session and wins over every other model choice
 * (composer pick, agent model, command model), so the server holds the lock.
 */
export namespace SessionOneTime {
  export const ClosedError = NamedError.create(
    "SessionOneTimeClosedError",
    z.object({ sessionID: z.string(), message: z.string() }),
  )
  export const LimitError = NamedError.create(
    "SessionOneTimeLimitError",
    z.object({ sessionID: z.string(), limit: z.number(), message: z.string() }),
  )

  export type Model = Session.OneTime["model"]

  /** The session, or undefined when it was deleted. `Session.get` reports a missing row as a defect. */
  const find = (sessions: Session.Interface, id: SessionID) =>
    sessions.get(id).pipe(Effect.catchDefect(() => Effect.succeed(undefined)))

  /** Why this session can't take another turn, or undefined when it can (or isn't a one-time session). */
  export function blocked(session: Session.Info) {
    const one = session.oneTime
    if (!one) return
    if (one.status === "closed")
      return new ClosedError({
        sessionID: session.id,
        message: "This one-time session is closed. Reopen it to send another request.",
      })
    if (one.limit !== undefined && one.requests >= one.limit)
      return new LimitError({
        sessionID: session.id,
        limit: one.limit,
        message: `This one-time session has used all ${one.limit} requests. Mark it done or reopen it.`,
      })
  }

  /** The variant to use under a lock: the locked one if set, else the requested one. */
  export function variant(model: Model | undefined, requested: string | undefined) {
    if (!model) return requested
    return model.variant ?? requested
  }

  export const OpenInput = z.object({
    originSessionID: SessionID.zod.optional(),
    model: Session.OneTime.shape.model,
    title: z.string().optional(),
    limit: z.number().int().positive().optional(),
  })
  export type OpenInput = z.output<typeof OpenInput>

  export const open = Effect.fn("SessionOneTime.open")(function* (input: OpenInput) {
    const sessions = yield* Session.Service
    const provider = yield* Provider.Service
    const model = yield* provider.getModel(input.model.providerID, input.model.modelID)
    const from = input.originSessionID ? yield* find(sessions, input.originSessionID) : undefined
    return yield* sessions.create({
      directory: from?.directory,
      workspaceID: from?.workspaceID,
      title: input.title ?? (from ? `⟡ ${model.name} · from "${from.title}"` : `⟡ ${model.name}`),
      oneTime: {
        model: input.model,
        originSessionID: from?.id,
        status: "open",
        requests: 0,
        limit: input.limit,
        time: { opened: Date.now() },
      },
    })
  })

  export const DoneInput = z.object({
    sessionID: SessionID.zod,
    goTo: z.enum(["origin", "new"]),
    addResult: z.boolean(),
  })
  export type DoneInput = z.output<typeof DoneInput>

  export const done = Effect.fn("SessionOneTime.done")(function* (input: DoneInput) {
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const session = yield* sessions.get(input.sessionID)
    const one = session.oneTime
    if (!one) throw new Error(`Session ${session.id} is not a one-time session`)

    const origin = one.originSessionID ? yield* find(sessions, one.originSessionID) : undefined
    const usable = origin && !origin.time.archived ? origin : undefined

    // Already closed: return the same target as the first call.
    if (one.status === "closed" && one.targetSessionID)
      return { session, targetSessionID: one.targetSessionID, fallback: false }

    const target =
      input.goTo === "origin" && usable
        ? usable
        : yield* sessions.create({ directory: session.directory, workspaceID: session.workspaceID })

    const card = input.addResult ? yield* result(target.id, session, agents) : undefined
    const next: Session.OneTime = {
      ...one,
      status: "closed",
      resultMessageID: card ?? one.resultMessageID,
      targetSessionID: target.id,
      time: { ...one.time, closed: Date.now() },
    }
    yield* sessions.setOneTime({ sessionID: session.id, oneTime: next })
    return {
      session: { ...session, oneTime: next },
      targetSessionID: target.id,
      fallback: input.goTo === "origin" && !usable,
    }
  })

  /** Writes a card into the target session that links back to the one-time session. No model turn runs. */
  const result = Effect.fnUntraced(function* (target: SessionID, session: Session.Info, agents: Agent.Interface) {
    const sessions = yield* Session.Service
    const one = session.oneTime!
    const last = yield* sessions.findMessage(target, (m) => m.info.role === "user")
    const prior = Option.getOrUndefined(last)?.info
    const user = prior?.role === "user" ? prior : undefined
    const msg: MessageV2.User = {
      id: MessageID.ascending(),
      role: "user",
      sessionID: target,
      time: { created: Date.now() },
      agent: user?.agent ?? (yield* agents.defaultAgent()),
      model: user?.model ?? { providerID: one.model.providerID, modelID: one.model.modelID },
    }
    yield* sessions.updateMessage(msg)
    yield* sessions.updatePart({
      id: PartID.ascending(),
      messageID: msg.id,
      sessionID: target,
      type: "text",
      text: `Result from one-time session "${session.title}" (${one.model.providerID}/${one.model.modelID}, ${one.requests} request${one.requests === 1 ? "" : "s"}).`,
      metadata: { oneTimeResult: { sessionID: session.id, model: one.model } },
    } satisfies MessageV2.TextPart)
    yield* sessions.touch(target)
    return msg.id
  })

  export const reopen = Effect.fn("SessionOneTime.reopen")(function* (sessionID: SessionID) {
    const sessions = yield* Session.Service
    const session = yield* sessions.get(sessionID)
    const one = session.oneTime
    if (!one) throw new Error(`Session ${session.id} is not a one-time session`)
    const next: Session.OneTime = {
      ...one,
      status: "open",
      targetSessionID: undefined,
      time: { opened: one.time.opened },
    }
    yield* sessions.setOneTime({ sessionID, oneTime: next })
    return { ...session, oneTime: next }
  })
}
