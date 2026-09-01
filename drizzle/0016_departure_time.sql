SET @departure_time_column_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_records' AND COLUMN_NAME = 'departureTime') = 0,
  'ALTER TABLE `attendance_records` ADD COLUMN `departureTime` varchar(32)',
  'SELECT 1'
);--> statement-breakpoint
PREPARE departure_time_column_statement FROM @departure_time_column_sql;--> statement-breakpoint
EXECUTE departure_time_column_statement;--> statement-breakpoint
DEALLOCATE PREPARE departure_time_column_statement;--> statement-breakpoint
UPDATE `attendance_records` AS `attendance`
INNER JOIN (
  SELECT
    `studentId`,
    `eventDate`,
    DATE_FORMAT(DATE_ADD(MAX(`occurredAt`), INTERVAL 9 HOUR), '%H:%i') AS `departureTime`
  FROM `attendance_entry_events`
  WHERE `eventType` = 'check_out'
  GROUP BY `studentId`, `eventDate`
) AS `checkout`
  ON `checkout`.`studentId` = `attendance`.`studentId`
  AND `checkout`.`eventDate` = `attendance`.`journalDate`
SET `attendance`.`departureTime` = `checkout`.`departureTime`
WHERE `attendance`.`departureTime` IS NULL;--> statement-breakpoint
