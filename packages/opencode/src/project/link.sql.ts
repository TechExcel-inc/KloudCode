import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core"

/**
 * Which EAD Pilot project each local folder belongs to, per signed-in person. Local only: the
 * server records projects and work, never folders on a computer.
 */
export const ProjectLinkTable = sqliteTable(
  "project_link",
  {
    user_id: text().notNull(),
    directory: text().notNull(),
    project_id: integer().notNull(),
    repo_id: text().notNull(),
    time_linked: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.directory] }),
    index("project_link_user_project_idx").on(table.user_id, table.project_id),
  ],
)
