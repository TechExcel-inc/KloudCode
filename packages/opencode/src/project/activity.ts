import z from "zod"
import { Database, and, desc, eq, sql } from "../storage/db"
import { ProjectActivityTable } from "./activity.sql"

/** Per-user record of when each project folder was last opened, closed, or worked in. */
export namespace ProjectActivity {
  export const Info = z
    .object({
      directory: z.string(),
      timeActive: z.number(),
    })
    .meta({ ref: "ProjectActivity" })
  export type Info = z.infer<typeof Info>

  /** Used when nobody is signed in. */
  export const LOCAL = "local"

  export function touch(input: { user: string; directory: string; time?: number }) {
    const user = input.user || LOCAL
    const time = input.time ?? Date.now()
    Database.use((db) =>
      db
        .insert(ProjectActivityTable)
        .values({ user_id: user, directory: input.directory, time_active: time })
        .onConflictDoUpdate({
          target: [ProjectActivityTable.user_id, ProjectActivityTable.directory],
          set: { time_active: time },
        })
        .run(),
    )
  }

  /** Most recently active first. `query` matches anywhere in the folder path, ignoring case. */
  export function recent(input: { user: string; limit?: number; query?: string }): Info[] {
    const user = input.user || LOCAL
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 500)
    const text = input.query?.trim().toLowerCase()
    const where = text
      ? and(
          eq(ProjectActivityTable.user_id, user),
          sql`instr(lower(${ProjectActivityTable.directory}), ${text}) > 0`,
        )
      : eq(ProjectActivityTable.user_id, user)
    return Database.use((db) =>
      db
        .select()
        .from(ProjectActivityTable)
        .where(where)
        .orderBy(desc(ProjectActivityTable.time_active))
        .limit(limit)
        .all()
        .map((row) => ({ directory: row.directory, timeActive: row.time_active })),
    )
  }
}
