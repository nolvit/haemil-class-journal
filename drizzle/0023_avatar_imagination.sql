ALTER TABLE reward_accounts ADD COLUMN cropX INT NOT NULL DEFAULT 50;
--> statement-breakpoint
ALTER TABLE reward_ledger ADD COLUMN actorUserId INT NULL;
--> statement-breakpoint
ALTER TABLE reward_ledger ADD COLUMN requestId VARCHAR(36) NULL UNIQUE;
