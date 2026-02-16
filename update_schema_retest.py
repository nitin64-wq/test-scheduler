
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

def update_schema_for_retest():
    conn = connect_db()
    cursor = conn.cursor()
    
    try:
        # Check if retest column exists in exam_attempts
        cursor.execute("DESCRIBE exam_attempts")
        columns = [column[0] for column in cursor.fetchall()]
        
        if 'is_retest' not in columns:
            print("Adding is_retest column to exam_attempts table...")
            cursor.execute("ALTER TABLE exam_attempts ADD COLUMN is_retest BOOLEAN DEFAULT FALSE")
        else:
            print("is_retest column already exists.")

        conn.commit()
        print("Schema update for retest successful.")
        
    except Exception as e:
        print(f"Error updating schema: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    update_schema_for_retest()
