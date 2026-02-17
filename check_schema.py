
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

def check_schema():
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute("DESCRIBE exam_attempts")
    for x in cursor:
        print(x)
    conn.close()

if __name__ == "__main__":
    check_schema()
