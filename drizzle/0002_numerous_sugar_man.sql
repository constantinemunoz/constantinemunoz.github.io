ALTER TABLE `players` ADD `chat_symbol` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `chat_updated_at` integer DEFAULT 0 NOT NULL;