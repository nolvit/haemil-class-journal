CREATE TABLE IF NOT EXISTS `student_remaining_count_notifications` (
	`studentId` int NOT NULL,
	`message` text NOT NULL,
	`sentTotalCount` double,
	`lastAttemptedAt` timestamp,
	`createdAt` timestamp DEFAULT (now()) NOT NULL,
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `student_remaining_count_notifications_studentId` PRIMARY KEY(`studentId`)
);
