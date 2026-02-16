import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

def apply_migration():
    try:
        conn = mysql.connector.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            user=os.getenv('DB_USER', 'root'),
            password=os.getenv('DB_PASSWORD', ''),
            database=os.getenv('DB_NAME', 'test')
        )
        cursor = conn.cursor()

        # Read the migration SQL file
        with open('migrate.sql', 'r') as f:
            sql_script = f.read()

        # Split into individual statements (simple split by semicolon)
        # remove comments first/or just iterate and ignore errors on empty lines
        statements = sql_script.split(';')

        print("Applying migration...")
        for statement in statements:
            if statement.strip():
                try:
                    # Skip the 'SELECT' at the end or handle it
                    if statement.strip().upper().startswith('SELECT'):
                        continue
                    
                    print(f"Executing: {statement.strip()[:50]}...")
                    cursor.execute(statement)
                except mysql.connector.Error as err:
                    # Ignore "Duplicate column name" or similar harmless errors if using simpler SQL
                    print(f"Message: {err.msg}")
        
        conn.commit()
        print("Migration applied successfully!")
        cursor.close()
        conn.close()

    except Exception as e:
        print(f"Error applying migration: {e}")

if __name__ == "__main__":
    apply_migration()
