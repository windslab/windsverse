CREATE TABLE `audit_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`kind` text NOT NULL,
	`record_id` text NOT NULL,
	`before_data` text,
	`after_data` text
);
--> statement-breakpoint
CREATE INDEX `audit_changes_event` ON `audit_changes` (`audit_id`);--> statement-breakpoint
CREATE TABLE `backup_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`backup_id` text NOT NULL,
	`part_id` text NOT NULL,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`sha256` text DEFAULT '' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `backup_parts_backup` ON `backup_parts` (`backup_id`);--> statement-breakpoint
CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`actor_id` text NOT NULL,
	`reason` text NOT NULL,
	`source_revision` integer NOT NULL,
	`progress` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `backups_created` ON `backups` (`created_at`);--> statement-breakpoint
CREATE TABLE `restore_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`backup_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`expected_revision` integer NOT NULL,
	`safety_backup_id` text NOT NULL,
	`progress` text NOT NULL
);
