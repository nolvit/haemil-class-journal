ALTER TABLE `students`
  ADD COLUMN `lessonUnitMultiplier` int DEFAULT 1 NOT NULL,
  ADD COLUMN `lessonUnitEffectiveFrom` date NULL;
--> statement-breakpoint
CREATE TABLE `count_unit_migrations` (
  `studentId` int NOT NULL,
  `effectiveFrom` date NOT NULL,
  `multiplier` int NOT NULL,
  `usedCount` double NOT NULL,
  `beforeRemainingCount` double NOT NULL,
  `afterRemainingCount` double NOT NULL,
  `beforeTotalCount` double NOT NULL,
  `afterTotalCount` double NOT NULL,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT `count_unit_migrations_studentId` PRIMARY KEY(`studentId`)
);
--> statement-breakpoint
CREATE INDEX `count_unit_migrations_effective_from_index`
  ON `count_unit_migrations` (`effectiveFrom`);
