ALTER TABLE `students` ADD `familyKey` varchar(64);--> statement-breakpoint
CREATE INDEX `students_family_key_index` ON `students` (`familyKey`);
