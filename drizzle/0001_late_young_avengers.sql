CREATE TABLE `attendance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`journalDate` date NOT NULL,
	`status` enum('not_entered','present','absent','not_registered','makeup','makeup_double') NOT NULL DEFAULT 'not_entered',
	`arrivalTime` varchar(32),
	`recordedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_records_student_date_unique` UNIQUE(`studentId`,`journalDate`)
);
--> statement-breakpoint
CREATE TABLE `class_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`subject` varchar(80) NOT NULL,
	`description` text,
	`accentColor` varchar(16) NOT NULL DEFAULT '#234E52',
	`active` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `class_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `class_groups_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `lesson_journals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`classGroupId` int NOT NULL,
	`journalDate` date NOT NULL,
	`content` text,
	`homework` text,
	`notes` text,
	`createdByUserId` int NOT NULL,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lesson_journals_id` PRIMARY KEY(`id`),
	CONSTRAINT `lesson_journals_student_class_date_unique` UNIQUE(`studentId`,`classGroupId`,`journalDate`)
);
--> statement-breakpoint
CREATE TABLE `student_enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`classGroupId` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_enrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_enrollments_student_class_unique` UNIQUE(`studentId`,`classGroupId`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`grade` varchar(80) NOT NULL,
	`studentNumber` varchar(80),
	`parentPhone` varchar(40),
	`memo` text,
	`publicToken` varchar(64) NOT NULL,
	`portalEnabled` boolean NOT NULL DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `students_id` PRIMARY KEY(`id`),
	CONSTRAINT `students_public_token_unique` UNIQUE(`publicToken`)
);
--> statement-breakpoint
CREATE INDEX `attendance_records_date_index` ON `attendance_records` (`journalDate`);--> statement-breakpoint
CREATE INDEX `class_groups_active_index` ON `class_groups` (`active`);--> statement-breakpoint
CREATE INDEX `lesson_journals_class_date_index` ON `lesson_journals` (`classGroupId`,`journalDate`);--> statement-breakpoint
CREATE INDEX `student_enrollments_class_active_index` ON `student_enrollments` (`classGroupId`,`active`);--> statement-breakpoint
CREATE INDEX `students_active_index` ON `students` (`active`);