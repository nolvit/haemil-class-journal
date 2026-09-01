CREATE TABLE `registration_count_histories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`registrationCount` double NOT NULL,
	`addedCount` double NOT NULL,
	`beforeTotalCount` double NOT NULL,
	`afterTotalCount` double NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `registration_count_histories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `registration_count_histories_student_created_index` ON `registration_count_histories` (`studentId`,`createdAt`);