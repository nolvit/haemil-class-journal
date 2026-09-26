CREATE TABLE IF NOT EXISTS math_assignments (
  id VARCHAR(36) PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE,
  sourceBasketId VARCHAR(128) NOT NULL, studentId INT NOT NULL,
  idempotencyKey VARCHAR(128) NOT NULL UNIQUE, requestHash VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL, status ENUM('open','closed') NOT NULL DEFAULT 'open',
  retryGrants INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY math_assignments_student_index(studentId, createdAt)
);
CREATE TABLE IF NOT EXISTS math_assignment_items (
  assignmentId VARCHAR(36) NOT NULL, ordinal INT NOT NULL,
  questionId VARCHAR(128) NOT NULL, answerType ENUM('choice','numeric') NOT NULL,
  answerKey VARCHAR(255) NOT NULL,
  gradingRule ENUM('value','ratio','exact') NOT NULL,
  exactForm BOOLEAN NOT NULL DEFAULT FALSE,
  questionLabel VARCHAR(200),
  PRIMARY KEY(assignmentId, ordinal),
  UNIQUE KEY math_assignment_items_question_unique(assignmentId, questionId)
);
CREATE TABLE IF NOT EXISTS math_assignment_attempts (
  id VARCHAR(36) PRIMARY KEY, assignmentId VARCHAR(36) NOT NULL,
  attemptNumber INT NOT NULL, answers MEDIUMTEXT NOT NULL, results MEDIUMTEXT NOT NULL,
  photoPages TEXT NOT NULL,
  score INT NOT NULL, total INT NOT NULL,
  submittedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY math_assignment_attempts_number_unique(assignmentId, attemptNumber)
);
CREATE TABLE IF NOT EXISTS math_assignment_photos (
  id VARCHAR(36) PRIMARY KEY, attemptId VARCHAR(36) NOT NULL,
  pageNumber INT NOT NULL, mimeType VARCHAR(20) NOT NULL,
  image LONGBLOB NOT NULL, expiresAt TIMESTAMP NOT NULL,
  UNIQUE KEY math_assignment_photos_page_unique(attemptId, pageNumber),
  KEY math_assignment_photos_expiry_index(expiresAt)
);
CREATE TABLE IF NOT EXISTS math_assignment_audit (
  id VARCHAR(36) PRIMARY KEY, assignmentId VARCHAR(36) NOT NULL,
  actorUserId INT NOT NULL, action VARCHAR(40) NOT NULL,
  detail TEXT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY math_assignment_audit_assignment_index(assignmentId, createdAt)
);
CREATE TABLE IF NOT EXISTS math_ocr_monthly_usage (
  billingAccountId VARCHAR(128) NOT NULL, month VARCHAR(7) NOT NULL,
  used INT NOT NULL DEFAULT 0, paidAllowance INT NOT NULL DEFAULT 0,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(billingAccountId, month)
);
CREATE TABLE IF NOT EXISTS math_ocr_requests (
  id VARCHAR(36) PRIMARY KEY, assignmentId VARCHAR(36) NOT NULL,
  studentId INT NOT NULL, attemptNumber INT NOT NULL, pageNumber INT NOT NULL,
  imageHash VARCHAR(64) NOT NULL, status ENUM('pending','complete','failed') NOT NULL,
  response TEXT, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt TIMESTAMP NOT NULL,
  UNIQUE KEY math_ocr_requests_image_unique(assignmentId,attemptNumber,pageNumber,imageHash),
  KEY math_ocr_requests_rate_index(studentId,createdAt)
);
CREATE TABLE IF NOT EXISTS math_ocr_allowance_audit (
  id VARCHAR(36) PRIMARY KEY, billingAccountId VARCHAR(128) NOT NULL,
  month VARCHAR(7) NOT NULL, actorUserId INT NOT NULL,
  previousAllowance INT NOT NULL, nextAllowance INT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY math_ocr_allowance_audit_month_index(billingAccountId,month,createdAt)
);
