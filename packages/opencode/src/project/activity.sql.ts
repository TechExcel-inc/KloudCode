import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core"

/** When each signed-in user last used each project folder. */
export const ProjectActivityTable = sqliteTable(
  "project_activity",
  {
    user_id: text().notNull(),
    directory: text().notNull(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
    time_active: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.directory] }),
    index("project_activity_user_active_idx").on(table.user_id, table.time_active),
  ],
)
