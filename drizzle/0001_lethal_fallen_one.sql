CREATE TABLE `shadow_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`fluent_example_id` text NOT NULL,
	`recording_id` text NOT NULL,
	`sentence_index` integer NOT NULL,
	`sentence_text` text NOT NULL,
	`attempt_number` integer DEFAULT 2 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fluent_example_id`) REFERENCES `fluent_examples`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shadow_attempts_session_idx` ON `shadow_attempts` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `shadow_attempts_example_sentence_idx` ON `shadow_attempts` (`fluent_example_id`,`sentence_index`);