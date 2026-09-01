CREATE TABLE `weekly_subject_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`classGroupId` int NOT NULL,
	`weekStart` date NOT NULL,
	`comment` text NOT NULL,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_subject_comments_id` PRIMARY KEY(`id`),
	CONSTRAINT `weekly_subject_comments_student_class_week_unique` UNIQUE(`studentId`,`classGroupId`,`weekStart`)
);
--> statement-breakpoint
CREATE INDEX `weekly_subject_comments_student_week_index` ON `weekly_subject_comments` (`studentId`,`weekStart`);