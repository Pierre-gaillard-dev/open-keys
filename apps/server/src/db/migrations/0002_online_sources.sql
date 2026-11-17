CREATE TABLE `source_pieces` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`composer` text,
	`opus` text,
	`instrument` text NOT NULL,
	`solo` integer NOT NULL,
	`style` text,
	`license` text,
	`credit` text,
	`duration_ms` integer,
	`midi_ref` text NOT NULL,
	`page_url` text,
	`published_at` integer,
	`search_text` text NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `source_pieces_source_idx` ON `source_pieces` (`source`,`synced_at`);--> statement-breakpoint
DROP TABLE `mutopia_pieces`;--> statement-breakpoint
ALTER TABLE `songs` ADD `source_library` text;--> statement-breakpoint
ALTER TABLE `songs` ADD `source_piece_id` text;--> statement-breakpoint
ALTER TABLE `songs` ADD `credit` text;--> statement-breakpoint
CREATE INDEX `songs_source_piece_id_idx` ON `songs` (`source_piece_id`);--> statement-breakpoint
UPDATE `songs` SET `source_library` = 'mutopia' WHERE `source_type` = 'mutopia';