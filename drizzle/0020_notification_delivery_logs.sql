CREATE TABLE IF NOT EXISTS `notification_delivery_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`notificationType` varchar(40) NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`eventDate` date,
	`targetCount` int DEFAULT 0 NOT NULL,
	`sentCount` int DEFAULT 0 NOT NULL,
	`failedCount` int DEFAULT 0 NOT NULL,
	`unavailable` boolean DEFAULT false NOT NULL,
	`createdAt` timestamp DEFAULT (now()) NOT NULL,
	CONSTRAINT `notification_delivery_logs_id` PRIMARY KEY(`id`),
	INDEX `notification_delivery_logs_created_index` (`createdAt`),
	INDEX `notification_delivery_logs_student_created_index` (`studentId`, `createdAt`),
	INDEX `notification_delivery_logs_event_date_index` (`eventDate`)
);
