SET @auto_unregistered_weekdays_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'students'
   AND COLUMN_NAME = 'autoUnregisteredWeekdays') = 0,
  'ALTER TABLE `students` ADD COLUMN `autoUnregisteredWeekdays` varchar(20)',
  'SELECT 1'
);--> statement-breakpoint
PREPARE auto_unregistered_weekdays_statement FROM @auto_unregistered_weekdays_sql;--> statement-breakpoint
EXECUTE auto_unregistered_weekdays_statement;--> statement-breakpoint
DEALLOCATE PREPARE auto_unregistered_weekdays_statement;
