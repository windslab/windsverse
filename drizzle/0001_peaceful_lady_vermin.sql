CREATE TABLE `auth_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_credentials` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`login_id` text NOT NULL,
	`pin_hash` text NOT NULL,
	`salt` text NOT NULL,
	`version` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_credentials_login_id_unique` ON `auth_credentials` (`login_id`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`version` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_employee` ON `auth_sessions` (`employee_id`);