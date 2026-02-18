
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

def update_schema_otp():
    conn = connect_db()
    cursor = conn.cursor()
    
    try:
        print("Creating otp_verifications table if not exists...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS otp_verifications (
                email VARCHAR(100) NOT NULL PRIMARY KEY,
                otp_code VARCHAR(6) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL 10 MINUTE)
            )
        """)
        
        print("Schema update for OTP successful.")
        
    except Exception as e:
        print(f"Error updating schema: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    update_schema_otp()
