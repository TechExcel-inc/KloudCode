import { describe, expect, test } from "bun:test"
import { draftText, errorText } from "./one-time"

describe("one-time helpers", () => {
  test("draftText keeps only the typed text", () => {
    expect(
      draftText([
        { type: "text", content: " Review " },
        { type: "file", content: "ignored" },
        { type: "text", content: "this module " },
      ]),
    ).toBe("Review this module")
  })

  test("errorText reads server errors", () => {
    expect(errorText({ name: "SessionOneTimeOnlyError", data: { message: "Use a one-time session" } })).toBe(
      "Use a one-time session",
    )
    expect(errorText({ name: "ProviderModelNotFoundError", data: {} })).toBe("ProviderModelNotFoundError")
    expect(errorText(new Error("boom"))).toBe("boom")
  })
})
