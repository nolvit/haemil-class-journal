CREATE TABLE `closure_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`imageKey` varchar(512),
	`imageUrl` varchar(2048),
	`createdByUserId` int NOT NULL,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `closure_periods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `attendance_records` MODIFY COLUMN `status` enum('not_entered','present','absent','not_registered','holiday','closed','makeup','makeup_double') NOT NULL DEFAULT 'not_entered';--> statement-breakpoint
CREATE INDEX `closure_periods_date_range_index` ON `closure_periods` (`startDate`,`endDate`);