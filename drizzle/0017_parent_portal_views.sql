CREATE TABLE IF NOT EXISTS `parent_portal_monthly_views` (
  `id` int AUTO_INCREMENT NOT NULL,
  `studentId` int NOT NULL,
  `monthKey` varchar(7) NOT NULL,
  `viewCount` int DEFAULT 0 NOT NULL,
  `createdAt` timestamp DEFAULT (now()) NOT NULL,
  `updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT `parent_portal_monthly_views_id` PRIMARY KEY(`id`),
  CONSTRAINT `parent_portal_monthly_views_student_month_unique` UNIQUE(`studentId`,`monthKey`)
);--> statement-breakpoint
CREATE INDEX `parent_portal_monthly_views_month_index` ON `parent_portal_monthly_views` (`monthKey`);
