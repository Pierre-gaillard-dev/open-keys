CREATE TABLE `song_hands` (
	`song_id` text PRIMARY KEY NOT NULL,
	`hands` text NOT NULL,
	`fingerprint` text NOT NULL,
	`source` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "song_hands_source_check" CHECK("song_hands"."source" in ('auto', 'edited'))
);
