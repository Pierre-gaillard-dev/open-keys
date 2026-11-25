ALTER TABLE `songs` ADD `audio_url` text;--> statement-breakpoint
ALTER TABLE `songs` ADD `audio_sha256` text;--> statement-breakpoint
ALTER TABLE `transcription_jobs` ADD `source_url` text;