CREATE TABLE `transcription_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`file_name` text NOT NULL,
	`audio_sha256` text,
	`status` text NOT NULL,
	`duration_s` real,
	`song_id` text,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "transcription_jobs_status_check" CHECK("transcription_jobs"."status" in ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `transcription_jobs_status_idx` ON `transcription_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `transcription_jobs_user_idx` ON `transcription_jobs` (`user_id`,`created_at`);