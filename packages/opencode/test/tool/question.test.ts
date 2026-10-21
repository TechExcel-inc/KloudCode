import { describe, expect, test } from "bun:test"
import { Effect, Fiber, Layer } from "effect"
import { Tool } from "../../src/tool/tool"
import { QuestionTool } from "../../src/tool/question"
import { SuggestSession, SuggestSessionTool } from "../../src/tool/suggest-session"
import { Question } from "../../src/question"
import { SessionID, MessageID } from "../../src/session/schema"
import { Agent } from "../../src/agent/agent"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { Truncate } from "../../src/tool/truncate"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const ctx = {
  sessionID: SessionID.make("ses_test-session"),
  messageID: MessageID.make("test-message"),
  callID: "test-call",
  agent: "test-agent",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

const it = testEffect(
  Layer.mergeAll(Question.defaultLayer, CrossSpawnSpawner.defaultLayer, Truncate.defaultLayer, Agent.defaultLayer),
)

const pending = Effect.fn("QuestionToolTest.pending")(function* (question: Question.Interface) {
  for (;;) {
    const items = yield* question.list()
    const item = items[0]
    if (item) return item
    yield* Effect.sleep("10 millis")
  }
})

describe("tool.question", () => {
  it.live("should successfully execute with valid question parameters", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const question = yield* Question.Service
        const toolInfo = yield* QuestionTool
        const tool = yield* toolInfo.init()
        const questions = [
          {
            question: "What is your favorite color?",
            header: "Color",
            options: [
              { label: "Red", description: "The color of passion" },
              { label: "Blue", description: "The color of sky" },
            ],
            multiple: false,
          },
        ]

        const fiber = yield* tool.execute({ questions }, ctx).pipe(Effect.forkScoped)
        const item = yield* pending(question)
        yield* question.reply({ requestID: item.id, answers: [["Red"]] })

        const result = yield* Fiber.join(fiber)
        expect(result.title).toBe("Asked 1 question")
      }),
    ),
  )

  it.live("should now pass with a header longer than 12 but less than 30 chars", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const question = yield* Question.Service
        const toolInfo = yield* QuestionTool
        const tool = yield* toolInfo.init()
        const questions = [
          {
            question: "What is your favorite animal?",
            header: "This Header is Over 12",
            options: [{ label: "Dog", description: "Man's best friend" }],
          },
        ]

        const fiber = yield* tool.execute({ questions }, ctx).pipe(Effect.forkScoped)
        const item = yield* pending(question)
        yield* question.reply({ requestID: item.id, answers: [["Dog"]] })

        const result = yield* Fiber.join(fiber)
        expect(result.output).toContain(`"What is your favorite animal?"="Dog"`)
      }),
    ),
  )

  // intentionally removed the zod validation due to tool call errors, hoping prompting is gonna be good enough
  //   test("should throw an Error for header exceeding 30 characters", async () => {
  //     const tool = await QuestionTool.init()
  //     const questions = [
  //       {
  //         question: "What is your favorite animal?",
  //         header: "This Header is Definitely More Than Thirty Characters Long",
  //         options: [{ label: "Dog", description: "Man's best friend" }],
  //       },
  //     ]
  //     try {
  //       await tool.execute({ questions }, ctx)
  //       // If it reaches here, the test should fail
  //       expect(true).toBe(false)
  //     } catch (e: any) {
  //       expect(e).toBeInstanceOf(Error)
  //       expect(e.cause).toBeInstanceOf(z.ZodError)
  //     }
  //   })

  //   test("should throw an Error for label exceeding 30 characters", async () => {
  //     const tool = await QuestionTool.init()
  //     const questions = [
  //       {
  //         question: "A question with a very long label",
  //         header: "Long Label",
  //         options: [
  //           { label: "This is a very, very, very long label that will exceed the limit", description: "A description" },
  //         ],
  //       },
  //     ]
  //     try {
  //       await tool.execute({ questions }, ctx)
  //       // If it reaches here, the test should fail
  //       expect(true).toBe(false)
  //     } catch (e: any) {
  //       expect(e).toBeInstanceOf(Error)
  //       expect(e.cause).toBeInstanceOf(z.ZodError)
  //     }
  //   })
})

describe("tool.suggest_session", () => {
  const user = { info: { role: "user" } } as never
  const assistant = { info: { role: "assistant" } } as never
  const later = { ...ctx, messages: [user, assistant, user] }

  it.live("never asks on the first message of a session", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const tool = yield* (yield* SuggestSessionTool).init()
        const result = yield* tool.execute({ title: "Report page" }, { ...ctx, messages: [user] })
        expect(result.output).toBe(SuggestSession.FIRST)
        expect(result.metadata.choice).toBe("first")
      }),
    ),
  )

  it.live("asks with the title and tells the model the request moved", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const question = yield* Question.Service
        const tool = yield* (yield* SuggestSessionTool).init()
        const fiber = yield* tool
          .execute({ title: "Report page", project: "KloudMeet" }, later)
          .pipe(Effect.forkScoped)
        const item = yield* pending(question)
        expect(item.questions[0]?.question).toBe('This looks like a new task: "Report page".')
        expect(item.questions[0]?.options.map((option) => option.label)).toEqual([
          "Continue here",
          "New session in KloudMeet",
        ])
        yield* question.reply({ requestID: item.id, answers: [["moved", "ses_2", "/work/meet"]] })

        const result = yield* Fiber.join(fiber)
        expect(result.output).toBe(SuggestSession.MOVED)
        expect(result.metadata).toMatchObject({ choice: "moved", session: "ses_2", directory: "/work/meet" })
      }),
    ),
  )

  it.live("a dismissed card continues here", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const question = yield* Question.Service
        const tool = yield* (yield* SuggestSessionTool).init()
        const fiber = yield* tool.execute({ title: "Report page" }, later).pipe(Effect.forkScoped)
        const item = yield* pending(question)
        yield* question.reject(item.id)

        const result = yield* Fiber.join(fiber)
        expect(result.output).toBe(SuggestSession.CONTINUE)
      }),
    ),
  )

  test("result text by choice", () => {
    expect(SuggestSession.result(["continue"]).output).toBe(
      "The user chose to continue here. Proceed with their request.",
    )
    expect(SuggestSession.result(["Continue here"]).choice).toBe("continue")
    expect(SuggestSession.result(undefined).choice).toBe("continue")
    expect(SuggestSession.result(["moved", "ses_2"]).output).toBe(
      "The user moved this request to a new session. Do not act on it here; end your reply with one short sentence saying it continues in the new session.",
    )
    expect(SuggestSession.result(["New session in KloudMeet"]).choice).toBe("elsewhere")
    const typed = SuggestSession.result(["just do it here"])
    expect(typed.choice).toBe("typed")
    expect(typed.output).toContain("just do it here")
  })
})
