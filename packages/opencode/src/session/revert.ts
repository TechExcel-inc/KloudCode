import z from "zod"
import { Effect, Layer, Context } from "effect"
import { Bus } from "../bus"
import { Snapshot } from "../snapshot"
import { Storage } from "@/storage/storage"
import { SyncEvent } from "../sync"
import { Log } from "../util/log"
import { Session } from "."
import { MessageV2 } from "./message-v2"
import { SessionID, MessageID, PartID } from "./schema"
import { SessionRunState } from "./run-state"
import { SessionSummary } from "./summary"
import { SessionStatus } from "./status"
import { TurnFiles } from "./turn-files"
import { InstanceState } from "@/effect/instance-state"
import path from "path"

export namespace SessionRevert {
  const log = Log.create({ service: "session.revert" })

  export const RevertInput = z.object({
    sessionID: SessionID.zod,
    messageID: MessageID.zod,
    partID: PartID.zod.optional(),
  })
  export type RevertInput = z.infer<typeof RevertInput>

  export const DiscardInput = z.object({
    sessionID: SessionID.zod,
    messageID: MessageID.zod,
    files: z.string().array(),
  })
  export type DiscardInput = z.infer<typeof DiscardInput>

  export const DiscardResult = z
    .object({
      discarded: z.string().array(),
      refused: z.string().array(),
    })
    .meta({ ref: "SessionDiscardResult" })
  export type DiscardResult = z.infer<typeof DiscardResult>

  export interface Interface {
    readonly revert: (input: RevertInput) => Effect.Effect<Session.Info>
    readonly unrevert: (input: { sessionID: SessionID }) => Effect.Effect<Session.Info>
    readonly cleanup: (session: Session.Info) => Effect.Effect<void>
    /** Puts the given files of one turn back to how they were before that turn. */
    readonly discard: (input: DiscardInput) => Effect.Effect<DiscardResult>
  }

  export class Service extends Context.Service<Service, Interface>()("@opencode/SessionRevert") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const snap = yield* Snapshot.Service
      const storage = yield* Storage.Service
      const bus = yield* Bus.Service
      const summary = yield* SessionSummary.Service
      const state = yield* SessionRunState.Service

      const revert = Effect.fn("SessionRevert.revert")(function* (input: RevertInput) {
        yield* state.assertNotBusy(input.sessionID)
        const all = yield* sessions.messages({ sessionID: input.sessionID })
        let lastUser: MessageV2.User | undefined
        const session = yield* sessions.get(input.sessionID)

        let rev: Session.Info["revert"]
        const patches: Snapshot.Patch[] = []
        for (const msg of all) {
          if (msg.info.role === "user") lastUser = msg.info
          const remaining = []
          for (const part of msg.parts) {
            if (rev) {
              if (part.type === "patch") patches.push(part)
              continue
            }

            if (!rev) {
              if ((msg.info.id === input.messageID && !input.partID) || part.id === input.partID) {
                const partID = remaining.some((item) => ["text", "tool"].includes(item.type)) ? input.partID : undefined
                rev = {
                  messageID: !partID && lastUser ? lastUser.id : msg.info.id,
                  partID,
                }
              }
              remaining.push(part)
            }
          }
        }

        if (!rev) return session

        rev.snapshot = session.revert?.snapshot ?? (yield* snap.track())
        if (session.revert?.snapshot) yield* snap.restore(session.revert.snapshot)
        yield* snap.revert(patches)
        if (rev.snapshot) rev.diff = yield* snap.diff(rev.snapshot as string)
        const anchor = all.find((msg) => msg.info.id === rev!.messageID)
        const range = all.filter((msg) => {
          if (!anchor) return msg.info.id >= rev!.messageID
          if (msg.info.time.created !== anchor.info.time.created) {
            return msg.info.time.created >= anchor.info.time.created
          }
          return msg.info.id >= rev!.messageID
        })
        const diffs = yield* summary.computeDiff({ messages: range })
        yield* storage.write(["session_diff", input.sessionID], diffs).pipe(Effect.ignore)
        yield* bus.publish(Session.Event.Diff, { sessionID: input.sessionID, diff: diffs })
        yield* sessions.setRevert({
          sessionID: input.sessionID,
          revert: rev,
          summary: {
            additions: diffs.reduce((sum, x) => sum + x.additions, 0),
            deletions: diffs.reduce((sum, x) => sum + x.deletions, 0),
            files: diffs.length,
          },
        })
        return yield* sessions.get(input.sessionID)
      })

      const unrevert = Effect.fn("SessionRevert.unrevert")(function* (input: { sessionID: SessionID }) {
        log.info("unreverting", input)
        yield* state.assertNotBusy(input.sessionID)
        const session = yield* sessions.get(input.sessionID)
        if (!session.revert) return session
        if (session.revert.snapshot) yield* snap.restore(session.revert!.snapshot!)
        yield* sessions.clearRevert(input.sessionID)
        return yield* sessions.get(input.sessionID)
      })

      const cleanup = Effect.fn("SessionRevert.cleanup")(function* (session: Session.Info) {
        if (!session.revert) return
        const sessionID = session.id
        const msgs = yield* sessions.messages({ sessionID })
        const messageID = session.revert.messageID
        const anchor = msgs.find((msg) => msg.info.id === messageID)
        const remove = [] as MessageV2.WithParts[]
        let target: MessageV2.WithParts | undefined
        for (const msg of msgs) {
          if (msg.info.id === messageID) {
            if (session.revert.partID) {
              target = msg
              continue
            }
            remove.push(msg)
            continue
          }
          const after = anchor
            ? msg.info.time.created !== anchor.info.time.created
              ? msg.info.time.created > anchor.info.time.created
              : msg.info.id > messageID
            : msg.info.id > messageID
          if (after) remove.push(msg)
        }
        for (const msg of remove) {
          SyncEvent.run(MessageV2.Event.Removed, {
            sessionID,
            messageID: msg.info.id,
          })
        }
        if (session.revert.partID && target) {
          const partID = session.revert.partID
          const idx = target.parts.findIndex((part) => part.id === partID)
          if (idx >= 0) {
            const removeParts = target.parts.slice(idx)
            target.parts = target.parts.slice(0, idx)
            for (const part of removeParts) {
              SyncEvent.run(MessageV2.Event.PartRemoved, {
                sessionID,
                messageID: target.info.id,
                partID: part.id,
              })
            }
          }
        }
        yield* sessions.clearRevert(sessionID)
      })

      const discard = Effect.fn("SessionRevert.discard")(function* (input: DiscardInput) {
        yield* state.assertNotBusy(input.sessionID)
        const all = yield* sessions.messages({ sessionID: input.sessionID })
        const target = all.find((msg) => msg.info.id === input.messageID)
        if (!target || target.info.role !== "user") return { discarded: [], refused: [...input.files] }
        const turn = all.filter(
          (msg) => msg.info.id === input.messageID || (msg.info.role === "assistant" && msg.info.parentID === input.messageID),
        )
        const start = (list: MessageV2.WithParts[]) => {
          for (const msg of list)
            for (const part of msg.parts) if (part.type === "step-start" && part.snapshot) return part.snapshot
        }
        const from = start(turn)
        const ctx = yield* InstanceState.context
        // Only files this turn's own AI changed, even when the saved list is older and also holds other people's changes.
        const listed = TurnFiles.filter(
          target.info.summary?.diffs ?? [],
          TurnFiles.collect(turn.flatMap((msg) => msg.parts)),
          { worktree: ctx.worktree, directory: ctx.directory },
        )
        const plan = TurnFiles.discardPlan(input.files, listed, { worktree: ctx.worktree, directory: ctx.directory })
        if (!from || !plan.allowed.length) {
          return { discarded: [], refused: [...plan.refused, ...(from ? [] : input.files.filter((f) => !plan.refused.includes(f)))] }
        }

        log.info("discarding", { sessionID: input.sessionID, messageID: input.messageID, files: plan.allowed.length })
        // Files the turn created are not in the starting snapshot and get deleted; the rest are checked out.
        yield* snap.revert([{ hash: from, files: plan.allowed.map((file) => path.join(ctx.worktree, file)) }])

        // The turn's change list drops the files that are back to how they were.
        const gone = new Set(plan.allowed)
        target.info.summary = { ...target.info.summary, diffs: listed.filter((diff) => !gone.has(diff.file)) }
        yield* sessions.updateMessage(target.info)

        // The session's change list (the Changes box) is re-read against the folder as it is now.
        const first = start(all)
        const now = yield* snap.track()
        if (first && now) {
          const diffs = yield* snap.diffFull(first, now)
          yield* storage.write(["session_diff", input.sessionID], diffs).pipe(Effect.ignore)
          yield* bus.publish(Session.Event.Diff, { sessionID: input.sessionID, diff: diffs })
          yield* sessions.setSummary({
            sessionID: input.sessionID,
            summary: {
              additions: diffs.reduce((sum, x) => sum + x.additions, 0),
              deletions: diffs.reduce((sum, x) => sum + x.deletions, 0),
              files: diffs.length,
            },
          })
        }
        return { discarded: plan.allowed, refused: plan.refused }
      })

      return Service.of({ revert, unrevert, cleanup, discard })
    }),
  )

  export const defaultLayer = Layer.suspend(() =>
    layer.pipe(
      Layer.provide(SessionRunState.defaultLayer),
      Layer.provide(Session.defaultLayer),
      Layer.provide(Snapshot.defaultLayer),
      Layer.provide(Storage.defaultLayer),
      Layer.provide(Bus.layer),
      Layer.provide(SessionSummary.defaultLayer),
    ),
  )
}
