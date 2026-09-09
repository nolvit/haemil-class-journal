/** Idempotent additive migration; no legacy learning tables are altered. */
export const rewardDDL = [
  `CREATE TABLE IF NOT EXISTS reward_accounts (studentId INT PRIMARY KEY, balance INT NOT NULL DEFAULT 0, lifetime INT NOT NULL DEFAULT 0, completedOrders INT NOT NULL DEFAULT 0, masterUrl TEXT NULL, representativeId VARCHAR(36) NULL, cropY INT NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS reward_days (studentId INT NOT NULL, day VARCHAR(10) NOT NULL, points INT NOT NULL, UNIQUE KEY reward_day_unique(studentId, day))`,
  `CREATE TABLE IF NOT EXISTS reward_ledger (id INT AUTO_INCREMENT PRIMARY KEY, studentId INT NOT NULL, delta INT NOT NULL, reason VARCHAR(200) NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX reward_ledger_student(studentId, id))`,
  `CREATE TABLE IF NOT EXISTS avatar_orders (id VARCHAR(36) PRIMARY KEY, studentId INT NOT NULL, status VARCHAR(20) NOT NULL, price INT NOT NULL, input TEXT NOT NULL, prompt TEXT NOT NULL, masterUrl TEXT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX avatar_order_student(studentId, createdAt))`,
  `CREATE TABLE IF NOT EXISTS avatar_candidates (id VARCHAR(36) PRIMARY KEY, orderId VARCHAR(36) NOT NULL, url TEXT NOT NULL, INDEX avatar_candidate_order(orderId))`,
  `CREATE TABLE IF NOT EXISTS avatar_collection (id VARCHAR(36) PRIMARY KEY, studentId INT NOT NULL, orderId VARCHAR(36) NOT NULL UNIQUE, url TEXT NOT NULL, mode VARCHAR(20) NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX avatar_collection_student(studentId))`,
];
