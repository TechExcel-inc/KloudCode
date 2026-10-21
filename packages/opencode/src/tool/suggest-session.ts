import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"
import { Question } from "../question"
import type { MessageV2 } from "../session/message-v2"
import DESCRIPTION from "./suggest-session.txt"

const parameters = z.object({
  title: z.string().describe("Short title of the new task (a few words)"),
  project: z
    .string()
    .optional()
    .describe("Name of another of the user's projects, only when the request clearly belongs there"),
  reason: z.string().optional().describe("One short sentence on why this looks like a new task"),
})

type Metadata = {
  title: string
  project?: string
  /** What the user chose: continue here, or moved to a new session. */
  choice: SuggestSession.Choice
  /** Set when the user moved the request: the session created for it and its folder. */
  session?: string
  directory?: string
}

export namespace SuggestSession {
  export type Choice = "continue" | "moved" | "elsewhere" | "typed" | "first"

  export const CONTINUE = "The user chose to continue here. Proceed with their request."
  export const MOVED =
    "The user moved this request to a new session. Do not act on it here; end your reply with one short sentence saying it continues in the new session."
  export const FIRST = "This is the first message of the session, so there is nothing to move. Proceed with the request."
  export const ELSEWHERE =
    "The user wants this request done in a new session. Do not act on it here; reply in one short sentence asking them to start a new session for it."

  /** True when the session has at most one user message: a new session never gets the card. */
  export function first(messages: Pick<MessageV2.WithParts, "info">[]) {
    return messages.filter((item) => item.info.role === "user").length <= 1
  }

  /**
   * What the model is told for the user's answer. The app answers ["continue"] or ["moved", sessionID, directory];
   * a client without the app's card answers with an option label; a typed message is the user's own words.
   */
  export function result(answer: string[] | undefined): {
    choice: Choice
    output: string
    session?: string
    directory?: string
  } {
    const head = answer?.[0]?.trim() ?? ""
    if (head === "moved") return { choice: "moved", output: MOVED, session: answer?.[1], directory: answer?.[2] }
    if (head === "" || head === "continue" || head === "Continue here") return { choice: "continue", output: CONTINUE }
    if (head.startsWith("New session")) return { choice: "elsewhere", output: ELSEWHERE }
    return {
      choice: "typed",
      output: `The user answered in their own words: "${head}". Take that into account; unless it asks for a new session, proceed with their request here.`,
    }
  }
}

export const SuggestSessionTool = Tool.define<typeof parameters, Metadata, Question.Service>(
  "suggest_session",
  Effect.gen(function* () {
    const question = yield* Question.Service

    return {
      description: DESCRIPTION,
      parameters,
      execute: (params: z.infer<typeof parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const meta = { title: params.title, project: params.project || undefined }
          if (SuggestSession.first(ctx.messages)) {
            return { title: "Continued", output: SuggestSession.FIRST, metadata: { ...meta, choice: "first" as const } }
          }
          const where = meta.project ? ` in ${meta.project}` : ""
          const answers = yield* question
            .ask({
              sessionID: ctx.sessionID,
              questions: [
                {
                  question: `This looks like a new task: "${params.title}".`,
                  header: "New task",
                  custom: false,
                  options: [
                    { label: "Continue here", description: "Keep working on it in this session" },
                    { label: `New session${where}`, description: "Start a separate session for it" },
                  ],
                },
              ],
              tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
            })
            // Dismissed (for example the session was stopped): nothing was moved, so carry on as asked.
            .pipe(Effect.catchTag("QuestionRejectedError", () => Effect.succeed([["continue"]] as Question.Answer[])))
          const out = SuggestSession.result(answers[0])
          return {
            title: out.choice === "moved" ? "Moved to a new session" : "Continued here",
            output: out.output,
            metadata: { ...meta, choice: out.choice, session: out.session, directory: out.directory },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
