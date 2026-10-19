import z from "zod"
import { Database, desc, eq } from "../storage/db"
import { ProjectLinkTable } from "./link.sql"

/** Local folder to EAD Pilot project links for each signed-in person (see ProjectLinkTable). */
export namespace ProjectLink {
  export const Info = z
    .object({
      directory: z.string(),
      projectId: z.number().int(),
      repoId: z.string(),
      timeLinked: z.number(),
    })
    .meta({ ref: "ProjectLink" })
  export type Info = z.infer<typeof Info>

  export function save(input: { user: string; directory: string; projectId: number; repoId: string; time?: number }) {
    const time = input.time ?? Date.now()
    Database.use((db) =>
      db
        .insert(ProjectLinkTable)
        .values({ user_id: input.user, directory: input.directory, project_id: input.projectId, repo_id: input.repoId, time_linked: time })
        .onConflictDoUpdate({
          target: [ProjectLinkTable.user_id, ProjectLinkTable.directory],
          set: { project_id: input.projectId, repo_id: input.repoId, time_linked: time },
        })
        .run(),
    )
  }

  /** Newest link first. */
  export function list(user: string): Info[] {
    return Database.use((db) =>
      db
        .select()
        .from(ProjectLinkTable)
        .where(eq(ProjectLinkTable.user_id, user))
        .orderBy(desc(ProjectLinkTable.time_linked))
        .all()
        .map((row) => ({ directory: row.directory, projectId: row.project_id, repoId: row.repo_id, timeLinked: row.time_linked })),
    )
  }
}
