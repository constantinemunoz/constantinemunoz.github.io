import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  status: text("status").notNull().default("lobby"),
  state: text("state").notNull(),
  version: integer("version").notNull().default(1),
  hostPlayerId: text("host_player_id").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const players = sqliteTable(
  "players",
  {
    id: text("id").primaryKey(),
    roomCode: text("room_code")
      .notNull()
      .references(() => rooms.code, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    joinedAt: integer("joined_at").notNull(),
    lastSeen: integer("last_seen").notNull(),
    cursorX: integer("cursor_x").notNull().default(5000),
    cursorY: integer("cursor_y").notNull().default(5000),
    cursorActive: integer("cursor_active").notNull().default(0),
    cursorUpdatedAt: integer("cursor_updated_at").notNull().default(0),
    chatSymbol: text("chat_symbol").notNull().default(""),
    chatUpdatedAt: integer("chat_updated_at").notNull().default(0),
    readyLevel: integer("ready_level").notNull().default(-1),
  },
  (table) => [
    uniqueIndex("idx_players_room_role").on(table.roomCode, table.role),
  ],
);
