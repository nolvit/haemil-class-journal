CREATE TABLE IF NOT EXISTS avatar_background_inventory (studentId INT NOT NULL, backgroundId VARCHAR(20) NOT NULL, purchasedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(studentId,backgroundId));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS avatar_like_rewards (cardId VARCHAR(36) NOT NULL, studentId INT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(cardId,studentId));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS avatar_wardrobe (studentId INT PRIMARY KEY, equipped VARCHAR(20) NOT NULL DEFAULT 'lunar', cropZoom INT NOT NULL DEFAULT 300);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS avatar_frame_inventory (studentId INT NOT NULL, frameId VARCHAR(20) NOT NULL, purchasedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(studentId,frameId));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS avatar_sharing (cardId VARCHAR(36) PRIMARY KEY, visible BOOLEAN NOT NULL DEFAULT FALSE, showName BOOLEAN NOT NULL DEFAULT FALSE, showGrade BOOLEAN NOT NULL DEFAULT FALSE, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS avatar_likes (cardId VARCHAR(36) NOT NULL, studentId INT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(cardId,studentId));
--> statement-breakpoint
ALTER TABLE avatar_wardrobe ADD COLUMN background VARCHAR(20) NOT NULL DEFAULT 'classic';
