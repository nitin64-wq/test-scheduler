
CREATE TABLE exam_evidence (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT,
  student_id INT,
  image_path VARCHAR(255),
  audio_path VARCHAR(255),
  violation_type VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);
