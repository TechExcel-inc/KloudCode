import { describe, expect, test } from "bun:test"
import { formatReview, referenceImages, reviewEndpoint } from "../../src/tool/design-review"

const message = (role: string, parts: unknown[]) => ({ info: { role }, parts }) as never

describe("tool.design_review", () => {
  test("sends the images from the person's latest message as the reference", () => {
    const messages = [
      message("user", [{ type: "file", mime: "image/png", url: "data:image/png;base64,OLD" }]),
      message("assistant", [{ type: "text", text: "..." }]),
      message("user", [
        { type: "text", text: "Design the EAD icon" },
        { type: "file", mime: "image/png", url: "data:image/png;base64,RAIL" },
        { type: "file", mime: "application/pdf", url: "data:application/pdf;base64,X" },
      ]),
    ]
    expect(referenceImages(messages)).toEqual(["data:image/png;base64,RAIL"])
    expect(referenceImages([])).toEqual([])
  })

  test("calls Pilot's review endpoint beside the chat endpoint", () => {
    expect(reviewEndpoint("https://eadfm.com/v1")).toBe("https://eadfm.com/v1/design/review")
    expect(reviewEndpoint("https://eadfm.com/v1/")).toBe("https://eadfm.com/v1/design/review")
  })

  test("turns the verdicts into what to fix", () => {
    const text = formatReview({
      available: true,
      reviewer: "deepseek-flash",
      options: [
        { label: "A", verdict: "pass", problems: [], fixes: [] },
        { label: "B", verdict: "fix", problems: ["lines too heavy at 20 px"], fixes: ["use stroke-width 1"] },
      ],
      summary: "Keep the outline style.",
    })
    expect(text).toContain("1 of 2 pass")
    expect(text).toContain("A: PASS")
    expect(text).toContain("B: FIX")
    expect(text).toContain("fix: use stroke-width 1")
    expect(text).toContain("Summary: Keep the outline style.")
  })

  test("says plainly when review cannot run", () => {
    expect(formatReview({ available: false, reason: "no model can see" })).toBe("Design review is not available: no model can see")
    expect(formatReview({ error: "timed out" })).toBe("Design review failed: timed out")
  })
})
