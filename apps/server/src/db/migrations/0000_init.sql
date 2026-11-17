CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_hash_unique` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_id_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expires_at_idx` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `loops` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`song_id` text NOT NULL,
	`name` text,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`target_tempo_pct` integer,
	`best_tempo_pct` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "loops_range_check" CHECK("loops"."end_ms" > "loops"."start_ms")
);
--> statement-breakpoint
CREATE INDEX `loops_user_song_idx` ON `loops` (`user_id`,`song_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `practice_sessions` (
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
	CONSTRAINT "practice_sessions_mode_check" CHECK("practice_sessions"."mode" in ('watch', 'midi'))
);
--> statement-breakpoint
CREATE INDEX `practice_sessions_user_song_idx` ON `practice_sessions` (`user_id`,`song_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `practice_sessions_user_started_idx` ON `practice_sessions` (`user_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `song_tags` (
	`song_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`song_id`, `tag_id`),
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `song_tags_tag_id_idx` ON `song_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `song_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`track_index` integer NOT NULL,
	`channel` integer NOT NULL,
	`name` text,
	`instrument` text,
	`note_count` integer NOT NULL,
	`min_pitch` integer NOT NULL,
	`max_pitch` integer NOT NULL,
	`hand` text NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "song_tracks_hand_check" CHECK("song_tracks"."hand" in ('left', 'right', 'ignore'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `song_tracks_song_track_idx` ON `song_tracks` (`song_id`,`track_index`);--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`title` text NOT NULL,
	`composer` text,
	`difficulty` integer,
	`source_type` text NOT NULL,
	`source_url` text,
	`license` text,
	`midi_sha256` text NOT NULL,
	`midi_size` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`note_count` integer NOT NULL,
	`min_pitch` integer NOT NULL,
	`max_pitch` integer NOT NULL,
	`hand_mode` text DEFAULT 'tracks' NOT NULL,
	`split_pitch` integer DEFAULT 60 NOT NULL,
	`cover_sha256` text,
	`cover_source` text,
	`cover_credit` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "songs_state_check" CHECK("songs"."state" in ('draft', 'ready')),
	CONSTRAINT "songs_source_type_check" CHECK("songs"."source_type" in ('upload', 'url', 'mutopia')),
	CONSTRAINT "songs_hand_mode_check" CHECK("songs"."hand_mode" in ('tracks', 'split')),
	CONSTRAINT "songs_difficulty_check" CHECK("songs"."difficulty" is null or "songs"."difficulty" between 1 and 5),
	CONSTRAINT "songs_cover_source_check" CHECK("songs"."cover_source" is null or "songs"."cover_source" in ('upload', 'url', 'musicbrainz', 'wikidata'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `songs_midi_sha256_unique` ON `songs` (`midi_sha256`);--> statement-breakpoint
CREATE INDEX `songs_state_deleted_at_idx` ON `songs` (`state`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `songs_title_idx` ON `songs` (`title`);--> statement-breakpoint
CREATE INDEX `songs_composer_idx` ON `songs` (`composer`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `user_songs` (
	`user_id` text NOT NULL,
	`song_id` text NOT NULL,
	`status` text DEFAULT 'to_learn' NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`last_position_ms` integer DEFAULT 0 NOT NULL,
	`last_tempo_pct` integer DEFAULT 100 NOT NULL,
	`hands_settings` text NOT NULL,
	`last_loop_id` text,
	`last_practiced_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `song_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_loop_id`) REFERENCES `loops`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "user_songs_status_check" CHECK("user_songs"."status" in ('to_learn', 'learning', 'mastered'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);