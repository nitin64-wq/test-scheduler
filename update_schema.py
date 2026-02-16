
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

def update_schema():
    conn = connect_db()
    cursor = conn.cursor()
    
    try:
        # Add security_enabled to exams
        cursor.execute("DESCRIBE exams")
        columns = [column[0] for column in cursor.fetchall()]
        
        if 'security_enabled' not in columns:
            print("Adding security_enabled column to exams table...")
            cursor.execute("ALTER TABLE exams ADD COLUMN security_enabled BOOLEAN DEFAULT TRUE")
        else:
            print("security_enabled column already exists.")

        conn.commit()
        print("Schema update successful.")
        
    except Exception as e:
        print(f"Error updating schema: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    update_schema()
