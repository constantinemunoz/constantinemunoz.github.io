ALTER TABLE `players` ADD `cursor_x` integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `cursor_y` integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `cursor_active` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `cursor_updated_at` integer DEFAULT 0 NOT NULL;