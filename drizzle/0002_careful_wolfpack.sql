ALTER TABLE `students` ADD `tuition` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `registrationCount` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `lastWeekCount` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `totalCount` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `validUntil` varchar(32);--> statement-breakpoint
ALTER TABLE `students` ADD `paymentMethod` varchar(80);--> statement-breakpoint
ALTER TABLE `students` ADD `tuitionAlert` varchar(160);