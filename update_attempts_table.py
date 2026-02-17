
import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

def connect_db():
    return mysql.connector.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', ''),
        database=os.getenv('DB_NAME', 'test')
    )

def add_columns():
    conn = connect_db()
    cursor = conn.cursor()
    try:
        print("Checking/Adding 'student_name' and 'course_name' to 'exam_attempts'...")
        
        # Check if columns exist
        cursor.execute("SHOW COLUMNS FROM exam_attempts LIKE 'student_name'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE exam_attempts ADD COLUMN student_name VARCHAR(255)")
            print("Added 'student_name'.")
        else:
            print("'student_name' exists.")
            
        cursor.execute("SHOW COLUMNS FROM exam_attempts LIKE 'course_name'")
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE exam_attempts ADD COLUMN course_name VARCHAR(255)")
            print("Added 'course_name'.")
        else:
            print("'course_name' exists.")
        
        conn.commit()
    except Exception as e:
        print(f"Error altering table: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    add_columns()
