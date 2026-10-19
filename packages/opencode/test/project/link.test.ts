import { describe, expect, test } from "bun:test"
import { ProjectLink } from "../../src/project/link"

describe("ProjectLink", () => {
  test("keeps each person's folder links apart, newest first, one per folder", () => {
    ProjectLink.save({ user: "4", directory: "/work/KloudCode", projectId: 1, repoId: "1001", time: 100 })
    ProjectLink.save({ user: "4", directory: "/work/P1_VP12", projectId: 2, repoId: "1002", time: 200 })
    ProjectLink.save({ user: "5", directory: "/work/KloudCode", projectId: 1, repoId: "1001", time: 300 })
    ProjectLink.save({ user: "4", directory: "/work/KloudCode", projectId: 1, repoId: "1001", time: 400 })

    expect(ProjectLink.list("4")).toEqual([
      { directory: "/work/KloudCode", projectId: 1, repoId: "1001", timeLinked: 400 },
      { directory: "/work/P1_VP12", projectId: 2, repoId: "1002", timeLinked: 200 },
    ])
    expect(ProjectLink.list("5").map((x) => x.directory)).toEqual(["/work/KloudCode"])
    expect(ProjectLink.list("9")).toEqual([])
  })
})
