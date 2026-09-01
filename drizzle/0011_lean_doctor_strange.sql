CREATE TABLE `legal_holiday_notices` (
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
	CONSTRAINT `legal_holiday_notices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `legal_holiday_notices_date_range_index` ON `legal_holiday_notices` (`startDate`,`endDate`);