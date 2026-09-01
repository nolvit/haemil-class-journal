CREATE TABLE `tuition_standards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schoolLevel` varchar(20) NOT NULL,
	`monthlySessionCount` int NOT NULL,
	`subjectCountTier` int NOT NULL,
	`tuition` double NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tuition_standards_id` PRIMARY KEY(`id`),
	CONSTRAINT `tuition_standards_unique` UNIQUE(`schoolLevel`,`monthlySessionCount`,`subjectCountTier`)
);
--> statement-breakpoint
ALTER TABLE `students` ADD `tuitionMode` enum('automatic','manual') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE INDEX `tuition_standards_level_session_index` ON `tuition_standards` (`schoolLevel`,`monthlySessionCount`);--> statement-breakpoint
INSERT INTO `tuition_standards` (`schoolLevel`, `monthlySessionCount`, `subjectCountTier`, `tuition`) VALUES
('elementary', 20, 0, 250000), ('elementary', 16, 0, 200000), ('elementary', 12, 0, 150000),
('middle', 20, 1, 190000), ('middle', 16, 1, 160000), ('middle', 12, 1, 130000),
('middle', 20, 2, 360000), ('middle', 16, 2, 290000), ('middle', 12, 2, 220000),
('high', 20, 1, 250000), ('high', 16, 1, 210000), ('high', 12, 1, 170000),
('high', 20, 2, 480000), ('high', 16, 2, 390000), ('high', 12, 2, 300000)
ON DUPLICATE KEY UPDATE `tuition` = VALUES(`tuition`);
