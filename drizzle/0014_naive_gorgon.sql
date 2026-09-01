CREATE TABLE `weekly_count_accruals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`weekStart` date NOT NULL,
	`sessionCount` double NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weekly_count_accruals_id` PRIMARY KEY(`id`),
	CONSTRAINT `weekly_count_accruals_student_week_unique` UNIQUE(`studentId`,`weekStart`)
);
--> statement-breakpoint
CREATE INDEX `weekly_count_accruals_student_week_index` ON `weekly_count_accruals` (`studentId`,`weekStart`);