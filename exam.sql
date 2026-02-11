-- Students table already exists

CREATE TABLE exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_time DATETIME NOT NULL,
  duration_minutes INT NOT NULL
);

CREATE TABLE questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT,
  question_text TEXT NOT NULL,
  option_a VARCHAR(255),
  option_b VARCHAR(255),
  option_c VARCHAR(255),
  option_d VARCHAR(255),
  correct_option CHAR(1),
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

CREATE TABLE exam_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT,
  student_id INT,
  started_at DATETIME,
  submitted_at DATETIME,
  score INT,
  FOREIGN KEY (exam_id) REFERENCES exams(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);
