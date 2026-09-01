CREATE TABLE `attendance_entry_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`eventDate` date NOT NULL,
	`eventType` enum('check_in','check_out') NOT NULL,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_entry_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_entry_events_student_date_type_unique` UNIQUE(`studentId`,`eventDate`,`eventType`)
);
--> statement-breakpoint
CREATE TABLE `parent_push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`endpointHash` varchar(64) NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` varchar(512) NOT NULL,
	`auth` varchar(256) NOT NULL,
	`userAgent` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parent_push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `parent_push_subscriptions_student_endpoint_unique` UNIQUE(`studentId`,`endpointHash`)
);
--> statement-breakpoint
ALTER TABLE `students` ADD `studentPhone` varchar(40);--> statement-breakpoint
ALTER TABLE `students` ADD `attendanceCode` varchar(4);--> statement-breakpoint
UPDATE `students` SET `attendanceCode` = LPAD(`id` + 1000, 4, '0') WHERE `attendanceCode` IS NULL;--> statement-breakpoint
ALTER TABLE `students` MODIFY COLUMN `attendanceCode` varchar(4) NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_attendance_code_unique` UNIQUE(`attendanceCode`);--> statement-breakpoint
CREATE INDEX `attendance_entry_events_date_index` ON `attendance_entry_events` (`eventDate`);--> statement-breakpoint
CREATE INDEX `parent_push_subscriptions_student_index` ON `parent_push_subscriptions` (`studentId`);
