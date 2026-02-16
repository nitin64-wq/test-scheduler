-- ============================================
-- Migration Script: Fix missing columns
-- Run this on your existing 'test' database
-- ============================================

-- 1. Add 'last_login' column to students table (if missing)
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_login DATETIME DEFAULT NULL;

-- 2. Add 'course' column to exams table (if missing)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS course VARCHAR(50) DEFAULT NULL;

-- 3. Add 'exam_password' column to exams table (if missing)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS exam_password VARCHAR(100) DEFAULT NULL;

-- 4. Change questions option columns from VARCHAR(255) to TEXT
-- This fixes the error when Excel questions have long option text (50+ questions often have longer text)
ALTER TABLE questions MODIFY COLUMN option_a TEXT NOT NULL;
ALTER TABLE questions MODIFY COLUMN option_b TEXT NOT NULL;
ALTER TABLE questions MODIFY COLUMN option_c TEXT NOT NULL;
ALTER TABLE questions MODIFY COLUMN option_d TEXT NOT NULL;
ALTER TABLE questions MODIFY COLUMN question_text TEXT NOT NULL;

-- 5. Fix exam_evidence table columns if they have wrong names
-- Check if 'file_path' exists and rename to 'image_path'
-- Note: If this errors, the column might already be correct
-- ALTER TABLE exam_evidence CHANGE COLUMN file_path image_path VARCHAR(255);
-- ALTER TABLE exam_evidence CHANGE COLUMN evidence_type violation_type VARCHAR(50);

-- If exam_evidence table doesn't exist at all, create it:
CREATE TABLE IF NOT EXISTS exam_evidence (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT,
  student_id INT,
  image_path VARCHAR(255),
  violation_type VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

SELECT 'Migration complete!' AS status;
