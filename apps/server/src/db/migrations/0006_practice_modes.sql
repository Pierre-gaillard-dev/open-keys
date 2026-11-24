-- V1.5: practice modes watch, wait and rhythm (the CHECK changes: the table is rebuilt; no table
-- references it). "midi" was accepted but never sent: kept as "watch" if present.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`song_id` text NOT NULL,
	`loop_id` text,
	`mode` text DEFAULT 'watch' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`active_ms` integer NOT NULL,
	`min_tempo_pct` integer NOT NULL,
	`max_tempo_pct` integer NOT NULL,
	`accuracy` real,
	`score` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`loop_id`) REFERENCES `loops`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "practice_sessions_mode_check" CHECK("mode" in ('watch', 'wait', 'rhythm'))
);
--> statement-breakpoint
INSERT INTO `__new_practice_sessions`("id", "user_id", "song_id", "loop_id", "mode", "started_at", "ended_at", "active_ms", "min_tempo_pct", "max_tempo_pct", "accuracy", "score", "updated_at") SELECT "id", "user_id", "song_id", "loop_id", CASE WHEN "mode" = 'midi' THEN 'watch' ELSE "mode" END, "started_at", "ended_at", "active_ms", "min_tempo_pct", "max_tempo_pct", "accuracy", "score", "updated_at" FROM `practice_sessions`;--> statement-breakpoint
DROP TABLE `practice_sessions`;--> statement-breakpoint
ALTER TABLE `__new_practice_sessions` RENAME TO `practice_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `practice_sessions_user_song_idx` ON `practice_sessions` (`user_id`,`song_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `practice_sessions_user_started_idx` ON `practice_sessions` (`user_id`,`started_at`);