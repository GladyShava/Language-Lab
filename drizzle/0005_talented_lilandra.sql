ALTER TABLE `student_profiles` ADD `asu_email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `password_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD `password_salt` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `student_profiles_asu_email_idx` ON `student_profiles` (`asu_email`) WHERE "student_profiles"."asu_email" <> '';