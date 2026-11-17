CREATE TABLE `mutopia_pieces` (
	`mutopia_id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`composer` text NOT NULL,
	`opus` text,
	`instrument` text NOT NULL,
	`keyboard_solo` integer NOT NULL,
	`style` text,
	`license` text NOT NULL,
	`midi_url` text NOT NULL,
	`published_at` integer,
	`search_text` text NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mutopia_pieces_midi_url_idx` ON `mutopia_pieces` (`midi_url`);