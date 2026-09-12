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
  `CREATE TABLE IF NOT EXISTS avatar_card_style (cardId VARCHAR(36) PRIMARY KEY, frameId VARCHAR(20) NOT NULL DEFAULT 'lunar', backgroundId VARCHAR(20) NOT NULL DEFAULT 'classic')`,
  `CREATE TABLE IF NOT EXISTS avatar_card_frames (cardId VARCHAR(36) NOT NULL, frameId VARCHAR(20) NOT NULL, purchasedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(cardId,frameId))`,
  `CREATE TABLE IF NOT EXISTS avatar_card_backgrounds (cardId VARCHAR(36) NOT NULL, backgroundId VARCHAR(20) NOT NULL, purchasedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(cardId,backgroundId))`,
  `CREATE TABLE IF NOT EXISTS official_avatar_characters (id VARCHAR(36) PRIMARY KEY, name VARCHAR(40) NOT NULL, url TEXT NOT NULL, visible BOOLEAN NOT NULL DEFAULT TRUE, cropX INT NOT NULL DEFAULT 50, cropY INT NOT NULL DEFAULT 20, cropZoom INT NOT NULL DEFAULT 190, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX official_avatar_visible(visible,updatedAt))`,
  `CREATE TABLE IF NOT EXISTS avatar_bgm_inventory (studentId INT NOT NULL, trackId VARCHAR(40) NOT NULL, purchasePrice INT NOT NULL, purchasedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(studentId,trackId))`,
  `CREATE TABLE IF NOT EXISTS avatar_bgm_settings (studentId INT PRIMARY KEY, equippedTrackId VARCHAR(40) NULL, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS avatar_shop_items (id VARCHAR(64) PRIMARY KEY, category VARCHAR(30) NOT NULL, name VARCHAR(80) NOT NULL, description VARCHAR(300) NOT NULL DEFAULT '', rankLabel VARCHAR(30) NOT NULL, price INT NOT NULL, season VARCHAR(30) NOT NULL DEFAULT '상시', assetUrl TEXT NULL, durationSeconds INT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, deleted BOOLEAN NOT NULL DEFAULT FALSE, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX avatar_shop_category(category,active,deleted))`,
  `CREATE TABLE IF NOT EXISTS avatar_shop_item_assets (itemId VARCHAR(64) NOT NULL, assetRole VARCHAR(40) NOT NULL, assetUrl TEXT NOT NULL, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY(itemId,assetRole), INDEX avatar_shop_asset_item(itemId))`,
  `CREATE TABLE IF NOT EXISTS avatar_world_inventory (studentId INT NOT NULL, worldId VARCHAR(64) NOT NULL, purchasePrice INT NOT NULL, purchasedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(studentId,worldId))`,
  `CREATE TABLE IF NOT EXISTS avatar_world_settings (studentId INT PRIMARY KEY, equippedWorldId VARCHAR(64) NOT NULL DEFAULT 'starlight-court', updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`,
];
// Backfills must run after upgrades because legacy tables may lack columns.
export const rewardBackfills = [
  `INSERT IGNORE INTO avatar_card_frames(cardId,frameId) SELECT ac.id,fi.frameId FROM avatar_collection ac JOIN avatar_frame_inventory fi ON fi.studentId=ac.studentId`,
  `INSERT IGNORE INTO avatar_card_backgrounds(cardId,backgroundId) SELECT ac.id,bi.backgroundId FROM avatar_collection ac JOIN avatar_background_inventory bi ON bi.studentId=ac.studentId`,
  `INSERT IGNORE INTO avatar_card_style(cardId,frameId,backgroundId) SELECT ac.id,COALESCE(w.equipped,'lunar'),COALESCE(w.background,'classic') FROM avatar_collection ac LEFT JOIN avatar_wardrobe w ON w.studentId=ac.studentId`,
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
    table: "avatar_sharing",
    column: "cropX",
    sql: "ALTER TABLE avatar_sharing ADD COLUMN cropX INT NOT NULL DEFAULT 50",
  },
  {
    table: "avatar_sharing",
    column: "cropY",
    sql: "ALTER TABLE avatar_sharing ADD COLUMN cropY INT NOT NULL DEFAULT 20",
  },
  {
    table: "avatar_sharing",
    column: "cropZoom",
    sql: "ALTER TABLE avatar_sharing ADD COLUMN cropZoom INT NOT NULL DEFAULT 190",
  },
  {
    table: "reward_ledger",
    column: "requestId",
    sql: "ALTER TABLE reward_ledger ADD COLUMN requestId VARCHAR(36) NULL UNIQUE",
  },
] as const;
