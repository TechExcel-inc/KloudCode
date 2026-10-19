import { describe, expect, test } from "bun:test"
import { ProjectActivity } from "../../src/project/activity"

describe("ProjectActivity", () => {
  test("keeps each user's projects apart, newest first", () => {
    ProjectActivity.touch({ user: "u1", directory: "/work/alpha", time: 100 })
    ProjectActivity.touch({ user: "u1", directory: "/work/beta", time: 200 })
    ProjectActivity.touch({ user: "u2", directory: "/work/gamma", time: 300 })
    ProjectActivity.touch({ user: "u1", directory: "/work/alpha", time: 400 })

    expect(ProjectActivity.recent({ user: "u1" })).toEqual([
      { directory: "/work/alpha", timeActive: 400 },
      { directory: "/work/beta", timeActive: 200 },
    ])
    expect(ProjectActivity.recent({ user: "u2" }).map((x) => x.directory)).toEqual(["/work/gamma"])
  })

  test("limits and searches by folder", () => {
    for (let i = 0; i < 12; i++) ProjectActivity.touch({ user: "u3", directory: `/src/P1_Web_${i}`, time: i })

    expect(ProjectActivity.recent({ user: "u3" }).length).toBe(10)
    expect(ProjectActivity.recent({ user: "u3", limit: 50 }).length).toBe(12)
    expect(ProjectActivity.recent({ user: "u3", query: "web_1" }).map((x) => x.directory)).toEqual([
      "/src/P1_Web_11",
      "/src/P1_Web_10",
      "/src/P1_Web_1",
    ])
  })

  test("uses the local user when nobody is signed in", () => {
    ProjectActivity.touch({ user: "", directory: "/solo", time: 5 })
    expect(ProjectActivity.recent({ user: ProjectActivity.LOCAL }).map((x) => x.directory)).toEqual(["/solo"])
  })
})
