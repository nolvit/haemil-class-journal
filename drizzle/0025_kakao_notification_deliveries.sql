CREATE TABLE IF NOT EXISTS `kakao_notification_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`notificationType` varchar(40) NOT NULL,
	`dedupeKey` varchar(160) NOT NULL,
	`status` enum('pending','sent','failed','unavailable') DEFAULT 'pending' NOT NULL,
	`providerMessageId` varchar(120),
	`errorMessage` varchar(500),
	`requestedAt` timestamp DEFAULT (now()) NOT NULL,
	`completedAt` timestamp,
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `kakao_notification_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `kakao_notification_deliveries_unique` UNIQUE(`studentId`,`notificationType`,`dedupeKey`),
	INDEX `kakao_notification_deliveries_requested_index` (`requestedAt`)
);
