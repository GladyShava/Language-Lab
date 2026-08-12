CREATE TABLE `community_examples` (
	`id` text PRIMARY KEY NOT NULL,
	`language_pack_id` text NOT NULL,
	`objective_id` text NOT NULL,
	`contributor_key` text NOT NULL,
	`contributor_display_name` text,
	`consent_id` text NOT NULL,
	`content` text NOT NULL,
	`audio_storage_key` text,
	`moderation_status` text NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`language_pack_id`) REFERENCES `language_packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`objective_id`) REFERENCES `conversation_objectives`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`consent_id`) REFERENCES `consents`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `community_examples_objective_status_idx` ON `community_examples` (`objective_id`,`moderation_status`);--> statement-breakpoint
CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_key` text NOT NULL,
	`session_id` text,
	`scope` text NOT NULL,
	`status` text NOT NULL,
	`policy_version` text NOT NULL,
	`granted_at` integer,
	`revoked_at` integer,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `consents_participant_scope_idx` ON `consents` (`participant_key`,`scope`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversation_objectives` (
	`id` text PRIMARY KEY NOT NULL,
	`language_pack_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`prompt` text NOT NULL,
	`category` text NOT NULL,
	`sequence` integer NOT NULL,
	`estimated_minutes` integer NOT NULL,
	`is_active` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`language_pack_id`) REFERENCES `language_packs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `objectives_pack_slug_idx` ON `conversation_objectives` (`language_pack_id`,`slug`);--> statement-breakpoint
CREATE INDEX `objectives_pack_sequence_idx` ON `conversation_objectives` (`language_pack_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `fluent_examples` (
	`id` text PRIMARY KEY NOT NULL,
	`language_pack_id` text NOT NULL,
	`objective_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`coaching_note` text,
	`audio_storage_key` text,
	`sequence` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`language_pack_id`) REFERENCES `language_packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`objective_id`) REFERENCES `conversation_objectives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fluent_examples_objective_idx` ON `fluent_examples` (`objective_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `language_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`locale_tag` text NOT NULL,
	`display_name` text NOT NULL,
	`native_name` text NOT NULL,
	`direction` text NOT NULL,
	`version` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `language_packs_locale_idx` ON `language_packs` (`locale_tag`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`role` text NOT NULL,
	`content_type` text NOT NULL,
	`text` text,
	`content_language_tag` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`transcript_confidence` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_session_sequence_idx` ON `messages` (`session_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `messages_session_time_idx` ON `messages` (`session_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_key` text NOT NULL,
	`language_pack_id` text NOT NULL,
	`objective_id` text,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`language_pack_id`) REFERENCES `language_packs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`objective_id`) REFERENCES `conversation_objectives`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sessions_participant_idx` ON `practice_sessions` (`participant_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `sessions_pack_idx` ON `practice_sessions` (`language_pack_id`);--> statement-breakpoint
CREATE TABLE `recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`message_id` text,
	`consent_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`byte_size` integer NOT NULL,
	`transcript_status` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`consent_id`) REFERENCES `consents`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recordings_storage_key_idx` ON `recordings` (`storage_key`);--> statement-breakpoint
CREATE INDEX `recordings_session_idx` ON `recordings` (`session_id`);