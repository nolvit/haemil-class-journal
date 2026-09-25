CREATE TABLE IF NOT EXISTS exam_schools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  UNIQUE KEY exam_schools_name_unique (name)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS school_exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  schoolId INT NOT NULL,
  grade VARCHAR(80) NOT NULL,
  academicYear INT NOT NULL,
  semester INT NOT NULL,
  examType VARCHAR(30) NOT NULL,
  title VARCHAR(100) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY school_exams_school_index (schoolId, academicYear),
  UNIQUE KEY school_exams_identity_unique (schoolId, grade, academicYear, semester, examType, title)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS school_exam_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  examId INT NOT NULL,
  subject VARCHAR(80) NOT NULL,
  examDate DATE NOT NULL,
  maxScore DOUBLE NOT NULL DEFAULT 100,
  schoolAverage DOUBLE NULL,
  averageSource VARCHAR(500) NULL,
  UNIQUE KEY school_exam_subject_unique (examId, subject)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS student_exam_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  examSubjectId INT NOT NULL,
  studentId INT NOT NULL,
  score DOUBLE NOT NULL,
  lessonCount INT NULL,
  lessonCountStatus VARCHAR(20) NOT NULL,
  lessonCountNote VARCHAR(500) NULL,
  mathSnapshot TEXT NULL,
  recordedByUserId INT NOT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY student_exam_result_unique (examSubjectId, studentId),
  KEY student_exam_results_student_index (studentId)
);
