/** Idempotent additive migration; no legacy learning tables are altered. */
export const rewardDDL = [
  `CREATE TABLE IF NOT EXISTS avatar_background_inventory (studentId INT NOT NULL, backgroundId VARCHAR(20) NOT NULL, purchasedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(studentId,backgroundId))`,
  `CREATE TABLE IF NOT EXISTS avatar_like_rewards (cardId VARCHAR(36) NOT NULL, studentId INT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(cardId,studentId))`,
  `CREATE TABLE IF NOT EXISTS avatar_wardrobe (studentId INT PRIMARY KEY, equipped VARCHAR(20) NOT NULL DEFAULT 'lunar', cropZoom INT NOT NULL DEFAULT 300)`,
  `CREATE TABLE IF NOT EXISTS avatar_frame_inventory (studentId INT NOT NULL, frameId VARCHAR(20) NOT NULL, purchasedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(studentId,frameId))`,
  `CREATE TABLE IF NOT EXISTS avatar_sharing (cardId VARCHAR(36) PRIMARY KEY, visible BOOLEAN NOT NULL DEFAULT FALSE, showName BOOLEAN NOT NULL DEFAULT FALSE, showGrade BOOLEAN NOT NULL DEFAULT FALSE, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS avatar_likes (cardId VARCHAR(36) NOT NULL, studentId INT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(cardId,studentId))`,
  `CREATE TABLE IF NOT EXISTS reward_accounts (studentId INT PRIMARY KEY, balance INT NOT NULL DEFAULT 0, lifetime INT NOT NULL DEFAULT 0, completedOrders INT NOT NULL DEFAULT 0, masterUrl TEXT NULL, representativeId VARCHAR(36) NULL, cropY INT NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS reward_days (studentId INT NOT NULL, day VARCHAR(10) NOT NULL, points INT NOT NULL, UNIQUE KEY reward_day_unique(studentId, day))`,
  `CREATE TABLE IF NOT EXISTS reward_ledger (id INT AUTO_INCREMENT PRIMARY KEY, studentId INT NOT NULL, delta INT NOT NULL, reason VARCHAR(200) NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX reward_ledger_student(studentId, id))`,
  `CREATE TABLE IF NOT EXISTS avatar_orders (id VARCHAR(36) PRIMARY KEY, studentId INT NOT NULL, status VARCHAR(20) NOT NULL, price INT NOT NULL, input TEXT NOT NULL, prompt TEXT NOT NULL, masterUrl TEXT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX avatar_order_student(studentId, createdAt))`,
  `CREATE TABLE IF NOT EXISTS avatar_candidates (id VARCHAR(36) PRIMARY KEY, orderId VARCHAR(36) NOT NULL, url TEXT NOT NULL, INDEX avatar_candidate_order(orderId))`,
  `CREATE TABLE IF NOT EXISTS avatar_collection (id VARCHAR(36) PRIMARY KEY, studentId INT NOT NULL, orderId VARCHAR(36) NOT NULL UNIQUE, url TEXT NOT NULL, mode VARCHAR(20) NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX avatar_collection_student(studentId))`,
];
export const rewardSchemaUpgrades = [
  {
    table: "avatar_wardrobe",
    column: "background",
    sql: "ALTER TABLE avatar_wardrobe ADD COLUMN background VARCHAR(20) NOT NULL DEFAULT 'classic'",
  },
  {
    table: "reward_accounts",
    column: "cropX",
    sql: "ALTER TABLE reward_accounts ADD COLUMN cropX INT NOT NULL DEFAULT 50",
  },
  {
    table: "reward_ledger",
    column: "actorUserId",
    sql: "ALTER TABLE reward_ledger ADD COLUMN actorUserId INT NULL",
  },
  {
    table: "reward_ledger",
    column: "requestId",
    sql: "ALTER TABLE reward_ledger ADD COLUMN requestId VARCHAR(36) NULL UNIQUE",
  },
] as const;
