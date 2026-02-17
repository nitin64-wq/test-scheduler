from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
import mysql.connector
import bcrypt
import datetime
import csv
import io
import pandas as pd
import docx
import json
import os
import base64
import uuid
import sys
from dotenv import load_dotenv
 
try:
    from deepface import DeepFace
    DEEPFACE_AVAILABLE = True
    DEEPFACE_IMPORT_ERROR = None
except Exception as deepface_import_err:
    DeepFace = None
    DEEPFACE_AVAILABLE = False
    DEEPFACE_IMPORT_ERROR = str(deepface_import_err)

load_dotenv()

# Database connection 
def connect_db():
    return mysql.connector.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', ''),
        database=os.getenv('DB_NAME', 'test')
    )

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size for camera captures
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/favicon.ico')
def favicon():
    return '', 204

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/register')
def register_page():
    return render_template('register.html')

from flask import make_response as flask_make_response

def no_cache_response(template, **kwargs):
    """Render template with no-cache headers to prevent back-button access after logout."""
    resp = flask_make_response(render_template(template, **kwargs))
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp

@app.route('/student')
def student_page():
    return no_cache_response('student.html')

@app.route('/admin-dashboard')
def serve_admin_dashboard():
    return no_cache_response('admin1.html')

@app.route("/exam/<int:exam_id>")
def serve_exam(exam_id):
    return no_cache_response("exam.html")






# ---------------------------
# API ROUTES
# ---------------------------

# ✅ Health Check
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'}), 200

# ✅ Get all students with activity info
@app.route('/api/students', methods=['GET'])
def get_students():
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)

    # Fallback if DB columns missing: Mock created_at and last_login
    # We use NOW() for created_at just to have a valid date for UI, or we could handle it better.
    # ideally we want real data, but if schema update fails, this keeps app running.
    # Better: Try to select, if fail, fallback? No, simpler to just use what we know exists + mocks.
    # Actually, we can check if columns exist dynamically but that's slow.
    # Let's revert to standard SELECT and add dummy keys.
    cursor.execute("SELECT id, username, email, fullname, phone, course, last_login FROM students")
    students = cursor.fetchall()

    # Check exam attempts and login status for each student
    for s in students:
        # Convert last_login to ISO string for frontend (avoid Flask's UTC conversion)
        if s['last_login']:
            s['last_login'] = s['last_login'].strftime('%Y-%m-%dT%H:%M:%S')
            s['created_at'] = s['last_login']
            # Consider "logged in" if last_login date matches today
            s['logged_in'] = s['last_login'][:10] == datetime.datetime.now().strftime('%Y-%m-%d')
        else:
            s['last_login'] = None
            s['created_at'] = None
            s['logged_in'] = False
        
        cursor.execute("SELECT COUNT(*) as count FROM exam_attempts WHERE student_id = %s", (s['id'],))
        count = cursor.fetchone()['count']
        s['attempted_exam'] = count > 0

    cursor.close()
    conn.close()
    return jsonify(students), 200

# ✅ System Control: Clear All Tests
@app.route('/api/admin/clear-tests', methods=['POST'])
def clear_all_tests():
    conn = connect_db()
    cursor = conn.cursor()
    try:
        # Delete all related data first to satisfy Foreign Keys
        cursor.execute("DELETE FROM exam_evidence") # Clear evidence first
        cursor.execute("DELETE FROM exam_attempts")
        cursor.execute("DELETE FROM questions")
        cursor.execute("DELETE FROM exams")
        conn.commit()
        return jsonify({'message': 'All exams and related data cleared successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ System Control: Reset System
@app.route('/api/admin/reset-system', methods=['POST'])
def reset_system():
    conn = connect_db()
    cursor = conn.cursor()
    try:
        # Delete all students and exams
        # Disable foreign key checks to ensure smooth truncation/deletion if needed, 
        # but DELETE shouldn't need it if cascade works. 
        cursor.execute("DELETE FROM exam_evidence") # Clear evidence
        cursor.execute("DELETE FROM exam_attempts")
        cursor.execute("DELETE FROM questions")
        cursor.execute("DELETE FROM exams")
        cursor.execute("DELETE FROM students")
        conn.commit()
        return jsonify({'message': 'System reset successfully. All data wiped.'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Register new student
@app.route('/api/register', methods=['POST'])
def register_student():
    conn = connect_db()
    cursor = conn.cursor()
    try:
        data = request.get_json()
        required_fields = ['username', 'password', 'email', 'fullName', 'phone', 'course']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'All fields are required'}), 400

        hashed_password = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        # Reverted to match original schema (no created_at)
        cursor.execute("""
            INSERT INTO students (username, password, email, fullname, phone, course)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (data['username'], hashed_password, data['email'], data['fullName'], data['phone'], data['course']))
        conn.commit()
        return jsonify({'message': 'Registration successful'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Login (admin or student)
@app.route('/api/login', methods=['POST'])
def login():
    conn = None
    cursor = None
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        role = data.get('role')

        if not all([username, password, role]):
            return jsonify({'error': 'Missing credentials'}), 400

        # Admin check
        if role == 'admin':
            conn = connect_db()
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM admins WHERE username = %s", (username,))
            admin = cursor.fetchone()
            
            if admin and bcrypt.checkpw(password.encode('utf-8'), admin['password'].encode('utf-8')):
                return jsonify({'success': True, 'role': 'admin', 'username': admin['username']})
            elif username == 'admin' and password == 'admin123': # Fallback for initial setup if DB fails/empty
                return jsonify({'success': True, 'role': 'admin', 'username': 'admin'})
                
            return jsonify({'success': False, 'message': 'Invalid admin credentials'}), 401

        # Student check
        if role == 'student':
            conn = connect_db()
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM students WHERE username = %s OR email = %s", (username, username))
            student = cursor.fetchone()
            if not student:
                return jsonify({'success': False, 'message': 'No student found'}), 404

            if bcrypt.checkpw(password.encode('utf-8'), student['password'].encode('utf-8')):
                # Update last_login timestamp
                cursor.execute("UPDATE students SET last_login = NOW() WHERE id = %s", (student['id'],))
                conn.commit()
                
                # Remove password from response
                student.pop('password', None)
                return jsonify({'success': True, 'role': 'student', 'student': student})
            return jsonify({'success': False, 'message': 'Invalid password'}), 401

        return jsonify({'error': 'Invalid role'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor: cursor.close()
        if conn and conn.is_connected(): conn.close()

# ✅ Create New Admin
@app.route('/api/admin/create-admin', methods=['POST'])
def create_admin():
    conn = connect_db()
    cursor = conn.cursor()
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400

        # Check if username exists
        cursor.execute("SELECT id FROM admins WHERE username = %s", (username,))
        if cursor.fetchone():
            return jsonify({'error': 'Admin username already exists'}), 400

        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        cursor.execute("INSERT INTO admins (username, password) VALUES (%s, %s)", (username, hashed_password))
        conn.commit()

        return jsonify({'message': 'New admin created successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Change Admin Password
@app.route('/api/admin/change-password', methods=['POST'])
def change_admin_password():
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    try:
        data = request.get_json()
        username = data.get('username')
        old_password = data.get('old_password')
        new_password = data.get('new_password')

        if not all([username, old_password, new_password]):
            return jsonify({'error': 'Missing fields'}), 400

        cursor.execute("SELECT * FROM admins WHERE username = %s", (username,))
        admin = cursor.fetchone()

        if not admin or not bcrypt.checkpw(old_password.encode('utf-8'), admin['password'].encode('utf-8')):
            return jsonify({'error': 'Invalid current password'}), 401

        new_hashed = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        cursor.execute("UPDATE admins SET password = %s WHERE id = %s", (new_hashed, admin['id']))
        conn.commit()

        return jsonify({'message': 'Password updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Reset Student Password (by Admin)
@app.route('/api/admin/reset-student-password', methods=['POST'])
def reset_student_password():
    conn = connect_db()
    cursor = conn.cursor()
    try:
        data = request.get_json()
        student_id = data.get('student_id')
        new_password = data.get('new_password')

        if not student_id or not new_password:
            return jsonify({'error': 'Student ID and new password required'}), 400

        hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        cursor.execute("UPDATE students SET password = %s WHERE id = %s", (hashed_password, student_id))
        conn.commit()

        return jsonify({'message': 'Student password reset successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Create new exam with file upload
@app.route('/api/exams', methods=['POST'])
def create_exam():
    try:
        print("--- DEBUG: create_exam called ---")
        print("Form Data:", request.form)
        print("Files:", request.files)
        
        title = request.form.get('title')
        description = request.form.get('description')
        start_time_str = request.form.get('start_time')
        duration_minutes = request.form.get('duration') or request.form.get('duration_minutes')
        course = request.form.get('course')
        exam_password = request.form.get('exam_password', '').strip() or None
        
        # Security enabled (default true if not provided or if 'true')
        security_enabled = request.form.get('security_enabled', 'true').lower() == 'true'
        
        file = request.files.get('file')

        print(f"Parsed: title={title}, start={start_time_str}, dur={duration_minutes}, course={course}, file={file}")

        if not title:
            return jsonify({'error': 'Missing title'}), 400
        if not start_time_str:
            return jsonify({'error': 'Missing start_time'}), 400
        if not duration_minutes:
            return jsonify({'error': 'Missing duration'}), 400
        if not file:
            return jsonify({'error': 'Missing file'}), 400

        # Convert datetime-local to MySQL format safely
        try:
            start_time = datetime.datetime.fromisoformat(start_time_str)
        except ValueError:
            return jsonify({'error': 'Invalid datetime format'}), 400

        # Parse File based on extension
        filename = file.filename
        questions_list = []

        try:
            if filename.endswith('.xlsx'):
                # Try to read the Excel file
                try:
                    file.stream.seek(0)
                    xls = pd.ExcelFile(file)
                    print(f"DEBUG: Excel Sheets found: {xls.sheet_names}")
                except Exception as e:
                    return jsonify({'error': f"Invalid Excel file: {str(e)}"}), 400

                # flexible column mapping
                required_fields = {
                    'question_text': ['question_text', 'question', 'question text', 'q', 'questions', 'statement'],
                    'option_a': ['option_a', 'option a', 'a', '(a)', 'opt a', 'choice a'],
                    'option_b': ['option_b', 'option b', 'b', '(b)', 'opt b', 'choice b'],
                    'option_c': ['option_c', 'option c', 'c', '(c)', 'opt c', 'choice c'],
                    'option_d': ['option_d', 'option d', 'd', '(d)', 'opt d', 'choice d'],
                    'correct_option': ['correct_option', 'correct option', 'correct', 'answer', 'ans', 'correct answer']
                }

                df = None
                found_correct_sheet = False
                final_col_map = {}

                for sheet in xls.sheet_names:
                    temp_df = pd.read_excel(xls, sheet_name=sheet)
                    # Create a normalized map of columns: lowercase and stripped -> original column name
                    cols_lower = {str(c).strip().lower(): c for c in temp_df.columns}
                    
                    print(f"DEBUG: Sheet '{sheet}' normalized columns: {list(cols_lower.keys())}")
                    
                    # Check if this sheet has all required fields (using synonyms)
                    sheet_col_map = {}
                    missing_fields = []
                    
                    for field, synonyms in required_fields.items():
                        found_col = None
                        for syn in synonyms:
                            if syn in cols_lower:
                                found_col = cols_lower[syn]
                                break
                        if found_col:
                            sheet_col_map[field] = found_col
                        else:
                            missing_fields.append(field)
                    
                    if not missing_fields:
                        df = temp_df
                        final_col_map = sheet_col_map
                        found_correct_sheet = True
                        print(f"DEBUG: Found valid sheet '{sheet}' with mapping: {final_col_map}")
                        break
                    else:
                        print(f"DEBUG: Sheet '{sheet}' missing fields: {missing_fields}")
                
                if not found_correct_sheet:
                     return jsonify({'error': f"Invalid Excel format. scanned sheets: {xls.sheet_names}. Could not find columns for: Question, Option A, B, C, D, Answer."}), 400
                
                # Replace NaN values with empty strings
                df = df.fillna('')
                
                count_uploaded = 0
                count_skipped = 0

                for index, row in df.iterrows():
                    # Check if the question cell is actually empty using pandas isna()
                    q_val = row[final_col_map['question_text']]
                    if pd.isna(q_val) or str(q_val).strip() == '':
                        count_skipped += 1
                        continue

                    # A more robust function to clean cells
                    def clean_cell(val):
                        if pd.isna(val): 
                            return ""
                        s = str(val).strip()
                        # Fix for Excel automatically converting numbers to floats (e.g., 1.0 to 1)
                        if s.endswith('.0'): 
                            s = s[:-2]
                        return s

                    # Extracting and cleaning data for all 50+ questions
                    q_text = clean_cell(row[final_col_map['question_text']])
                    opt_a = clean_cell(row[final_col_map['option_a']])
                    opt_b = clean_cell(row[final_col_map['option_b']])
                    opt_c = clean_cell(row[final_col_map['option_c']])
                    opt_d = clean_cell(row[final_col_map['option_d']])
                    correct = clean_cell(row[final_col_map['correct_option']])

                    # Only append if the question text exists
                    if q_text:
                        questions_list.append({
                            'question_text': q_text,
                            'option_a': opt_a,
                            'option_b': opt_b,
                            'option_c': opt_c,
                            'option_d': opt_d,
                            'correct_option': correct.upper() # Ensure answer is always uppercase
                        })
                        count_uploaded += 1
                
                print(f"DEBUG: Excel processing complete. Uploaded: {count_uploaded}, Skipped: {count_skipped}")

            elif filename.endswith('.docx'):
                doc = docx.Document(file)
                text = '\n'.join([p.text for p in doc.paragraphs if p.text.strip()])
                questions_list = parse_text_questions(text)

            elif filename.endswith('.txt'):
                text = file.read().decode('utf-8')
                questions_list = parse_text_questions(text)

            else:
                return jsonify({'error': 'Unsupported file format. Use .xlsx, .docx, or .txt'}), 400

            if not questions_list:
                return jsonify({'error': 'No questions found in file'}), 400

        except Exception as e:
            return jsonify({'error': f'Error reading file: {str(e)}'}), 400

        conn = connect_db()
        cursor = conn.cursor()
        
        # Insert Exam
        cursor.execute("""
            INSERT INTO exams (title, description, start_time, duration_minutes, course, exam_password, security_enabled)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (title, description, start_time, duration_minutes, course, exam_password, security_enabled))
        conn.commit()
        exam_id = cursor.lastrowid

        # Insert Questions
        questions_count = 0
        for q in questions_list:
            cursor.execute("""
                INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (exam_id, q['question_text'], q['option_a'], q['option_b'], q['option_c'], q['option_d'], q['correct_option']))
            questions_count += 1
        
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({'message': f'Exam created successfully with {questions_count} questions', 'exam_id': exam_id}), 201
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def parse_text_questions(text):
    questions = []
    lines = text.split('\n')
    current_q = {}
    
    import re

    for line in lines:
        line = line.strip()
        if not line: continue
        
        # Match Question (e.g., "1. Question text")
        # Also supports "Question: Text" for backward compatibility
        if re.match(r'^\d+\.|^Question:', line):
            if current_q: 
                # Validate previous question before adding
                if 'question_text' in current_q and 'correct_option' in current_q:
                    questions.append(current_q)
            
            # Remove "1. " or "Question: " prefix
            clean_text = re.sub(r'^\d+\.\s*|^Question:\s*', '', line).strip()
            current_q = {'question_text': clean_text}

        # Match Options (e.g., "A. Option" or "• A. Option")
        elif re.match(r'^[•\-]?\s*[A-D]\.', line):
            # Extract Option Letter (A, B, C, D)
            match = re.search(r'([A-D])\.', line)
            if match:
                opt_letter = match.group(1).lower() # a, b, c, d
                # Remove prefix (bullet, letter, dot)
                opt_text = re.sub(r'^[•\-]?\s*[A-D]\.\s*', '', line).strip()
                current_q[f'option_{opt_letter}'] = opt_text

        # Match Answer (e.g., "Answer: B")
        elif line.lower().startswith('answer:') or line.startswith('Correct Option:'):
            ans_text = re.sub(r'^Answer:\s*|^Correct Option:\s*', '', line, flags=re.IGNORECASE).strip()
            # Ensure we only get the letter (e.g. "B" from "B (Explanation)")
            ans_match = re.search(r'([A-D])', ans_text, re.IGNORECASE)
            if ans_match:
                current_q['correct_option'] = ans_match.group(1).upper()
            
    if current_q and 'question_text' in current_q and 'correct_option' in current_q:
        questions.append(current_q)
        
    return questions

def analyze_evidence_with_deepface(image_path):
    """Run DeepFace checks and return normalized face analysis data."""
    result = {
        'enabled': DEEPFACE_AVAILABLE,
        'face_count': None,
        'dominant_emotion': None,
        'violation_type': None,
        'analysis_error': None
    }

    if not DEEPFACE_AVAILABLE:
        result['analysis_error'] = DEEPFACE_IMPORT_ERROR or 'DeepFace is not installed'
        return result

    try:
        faces = DeepFace.extract_faces(
            img_path=image_path,
            detector_backend='opencv',
            enforce_detection=False,
            align=False
        )
        valid_faces = []
        for face in faces:
            area = face.get('facial_area', {}) if isinstance(face, dict) else {}
            if area.get('w', 0) > 0 and area.get('h', 0) > 0:
                valid_faces.append(face)

        face_count = len(valid_faces)
        result['face_count'] = face_count

        if face_count == 0:
            result['violation_type'] = 'no_face_detected'
        elif face_count > 1:
            result['violation_type'] = 'multiple_faces_detected'
        else:
            result['violation_type'] = 'face_ok'

        analysis = DeepFace.analyze(
            img_path=image_path,
            actions=['emotion'],
            detector_backend='opencv',
            enforce_detection=False
        )
        if isinstance(analysis, list) and analysis:
            analysis = analysis[0]
        if isinstance(analysis, dict):
            result['dominant_emotion'] = analysis.get('dominant_emotion')
    except Exception as e:
        result['analysis_error'] = str(e)
        result['violation_type'] = 'deepface_error'

    return result
    
# Get questions for an exam
@app.route('/api/exams/<int:exam_id>/questions', methods=['GET'])
def get_exam_questions(exam_id):
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT id, question_text, option_a, option_b, option_c, option_d 
        FROM questions WHERE exam_id = %s
    """, (exam_id,))
    questions = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(questions), 200


# Submit exam answers
@app.route('/api/exams/<int:exam_id>/submit', methods=['POST'])
def submit_exam(exam_id):
    data = request.get_json()
    student_id = data.get("student_id")
    answers = data.get("answers", {})

    violation_alert = data.get("violation_alert", False)

    conn = connect_db()
    cursor = conn.cursor(dictionary=True)

    # Fetch correct answers
    cursor.execute("SELECT id, correct_option FROM questions WHERE exam_id = %s", (exam_id,))
    correct_answers = cursor.fetchall()

    score = 0
    for q in correct_answers:
        qid = str(q["id"])
        # Normalize: strip whitespace and convert to upper case
        correct_opt = str(q["correct_option"]).strip().upper()
        
        if qid in answers:
            student_ans = str(answers[qid]).strip().upper()
            if student_ans == correct_opt:
                score += 1

    total = len(correct_answers)

    # Save exam attempt (Upsert: Update if exists, else Insert)
    # We check if a record exists for this student/exam combo
    cursor.execute("SELECT id FROM exam_attempts WHERE exam_id = %s AND student_id = %s", (exam_id, student_id))
    existing_attempt = cursor.fetchone()

    # Fetch Student Details for snapshot
    cursor.execute("SELECT fullname, course FROM students WHERE id = %s", (student_id,))
    student_details = cursor.fetchone()
    student_name = student_details['fullname'] if student_details else "Unknown"
    course_name = student_details['course'] if student_details else "Unknown"

    if existing_attempt:
        # Update existing record
        cursor.execute("""
            UPDATE exam_attempts 
            SET started_at = IFNULL(started_at, NOW()), submitted_at = NOW(), score = %s, student_name = %s, course_name = %s
            WHERE id = %s
        """, (score, student_name, course_name, existing_attempt['id']))
        exam_attempt_id = existing_attempt['id']
    else:
        # New insert
        cursor.execute("""
            INSERT INTO exam_attempts (exam_id, student_id, started_at, submitted_at, score, student_name, course_name)
            VALUES (%s, %s, NOW(), NOW(), %s, %s, %s)
        """, (exam_id, student_id, score, student_name, course_name))
        exam_attempt_id = cursor.lastrowid

    conn.commit()

    cursor.close()
    conn.close()

    return jsonify({"score": score, "total": total, "attempt_id": exam_attempt_id}), 200



# ✅ Reset Exam Attempt (Enable Retest)
@app.route('/api/attempts/reset', methods=['POST'])
def reset_exam_attempt():
    data = request.get_json()
    student_id = data.get('student_id')
    exam_id = data.get('exam_id')

    if not student_id or not exam_id:
        return jsonify({'error': 'Missing student_id or exam_id'}), 400

    conn = connect_db()
    cursor = conn.cursor()
    try:
        # Instead of deleting, mark as retest allowed (reset submission details)
        # We keep is_retest=1 to indicate this is a retest scenario
        cursor.execute("""
            UPDATE exam_attempts 
            SET submitted_at = NULL, score = NULL, is_retest = 1, started_at = NULL
            WHERE student_id = %s AND exam_id = %s
        """, (student_id, exam_id))
        
        updated_count = cursor.rowcount
        conn.commit()
        
        if updated_count > 0:
            return jsonify({'message': 'Exam attempt reset. Student can now retest.'}), 200
        else:
            return jsonify({'message': 'No attempt found to reset.'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Get All Attempts (for Admin "Manage Results/Retest")
@app.route('/api/admin/attempts', methods=['GET'])
def get_all_attempts():
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT 
                ea.id, 
                ea.student_id, 
                s.fullname as student_name, 
                s.course as student_course,
                ea.exam_id, 
                e.title as exam_title, 
                ea.score, 
                ea.submitted_at,
                (SELECT COUNT(*) FROM questions q WHERE q.exam_id = ea.exam_id) as total_questions
            FROM exam_attempts ea
            JOIN students s ON ea.student_id = s.id
            JOIN exams e ON ea.exam_id = e.id
            ORDER BY ea.submitted_at DESC
        """
        cursor.execute(query)
        attempts = cursor.fetchall()
        
        # Format dates
        for a in attempts:
            if a['submitted_at']:
                a['submitted_at'] = a['submitted_at'].strftime('%Y-%m-%d %H:%M:%S')
                
        return jsonify(attempts), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Check if exam already attempted
@app.route('/api/exams/<int:exam_id>/attempted', methods=['GET'])
def check_exam_attempt(exam_id):
    student_id = request.args.get('student_id')
    if not student_id:
        return jsonify({'error': 'Student ID required'}), 400
        
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Check if submitted_at is NOT NULL
        cursor.execute("SELECT COUNT(*) as count FROM exam_attempts WHERE exam_id = %s AND student_id = %s AND submitted_at IS NOT NULL", (exam_id, student_id))
        result = cursor.fetchone()
        count = result['count'] if result else 0
        return jsonify({'attempted': count > 0}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Get all exam statuses for a student
@app.route('/api/exams/attempted-list', methods=['GET'])
def get_attempted_exams_list():
    student_id = request.args.get('student_id')
    if not student_id:
        return jsonify({'error': 'Student ID required'}), 400
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Fetch status details
        cursor.execute("SELECT exam_id, submitted_at, is_retest FROM exam_attempts WHERE student_id = %s", (student_id,))
        rows = cursor.fetchall()
        
        # Map: exam_id -> { attempted: bool, is_retest: bool }
        status_map = {}
        for row in rows:
            is_completed = row['submitted_at'] is not None
            # If submitted_at is NULL, it might be in-progress OR a retest reset.
            # If is_retest=1 and submitted_at is NULL, it's a "Retest Available" state.
            
            status_map[row['exam_id']] = {
                'attempted': is_completed,
                'is_retest': bool(row.get('is_retest'))
            }
            
        return jsonify({'exam_statuses': status_map}), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Save camera evidence image during exam
@app.route('/api/exams/<int:exam_id>/evidence', methods=['POST'])
def save_exam_evidence(exam_id):
    try:
        data = request.get_json()
        student_id = data.get('student_id')
        image_data = data.get('image')  # base64 string
        violation_type = data.get('violation_type', 'periodic_capture')

        print(f"--- DEBUG: Evidence received for exam {exam_id}, student {student_id}, type: {violation_type}")

        if not student_id or not image_data:
            print(f"--- DEBUG: Missing data. student_id={student_id}, image_data_present={bool(image_data)}")
            return jsonify({'error': 'Missing student_id or image'}), 400

        # Decode base64 image
        # Remove the data URL prefix if present (e.g. "data:image/jpeg;base64,...")
        if ',' in image_data:
            image_data = image_data.split(',')[1]

        image_bytes = base64.b64decode(image_data)
        print(f"--- DEBUG: Decoded image size: {len(image_bytes)} bytes")

        # Save to uploads/evidence/
        evidence_dir = os.path.join(os.path.dirname(__file__), 'uploads', 'evidence')
        os.makedirs(evidence_dir, exist_ok=True)

        filename = f"exam{exam_id}_student{student_id}_{uuid.uuid4().hex[:8]}.jpg"
        filepath = os.path.join(evidence_dir, filename)

        with open(filepath, 'wb') as f:
            f.write(image_bytes)
        print(f"--- DEBUG: Image saved to {filepath}")

        deepface_result = analyze_evidence_with_deepface(filepath)
        stored_violation_type = violation_type
        if violation_type in ('periodic_capture', 'pre_start_check') and deepface_result.get('violation_type'):
            stored_violation_type = f"deepface_{deepface_result['violation_type']}"

        # Save record to DB
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO exam_evidence (exam_id, student_id, image_path, violation_type)
            VALUES (%s, %s, %s, %s)
        """, (exam_id, student_id, f'uploads/evidence/{filename}', stored_violation_type))
        conn.commit()
        cursor.close()
        conn.close()
        print(f"--- DEBUG: Evidence record saved to DB")

        return jsonify({
            'message': 'Evidence saved',
            'filename': filename,
            'violation_type': stored_violation_type,
            'deepface': deepface_result
        }), 201
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route("/api/exams", methods=["GET"])
def get_exams():
    try:
        course_filter = request.args.get('course')
        conn = connect_db()
        cur = conn.cursor(dictionary=True)
        
        query = "SELECT id, title, description, start_time, duration_minutes, course, exam_password, security_enabled FROM exams"
        params = ()
        
        if course_filter:
            query += " WHERE course = %s"
            params = (course_filter,)
            
        cur.execute(query, params)
        exams = cur.fetchall()
        
        is_admin_req = request.args.get('admin', 'false').lower() == 'true'

        # Add has_password flag and remove actual password from response unless admin
        # Also convert start_time to ISO string without timezone to prevent UTC conversion
        for exam in exams:
            exam['has_password'] = bool(exam.get('exam_password'))
            if not is_admin_req:
                exam.pop('exam_password', None)
            else:
                # If admin, ensure None becomes empty string or keep as is
                if exam.get('exam_password') is None:
                    exam['exam_password'] = ''
            # Convert datetime to ISO string (local time, no timezone suffix)
            if exam.get('start_time'):
                exam['start_time'] = exam['start_time'].strftime('%Y-%m-%dT%H:%M:%S')
        
        conn.close()
        return jsonify(exams), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ✅ Verify exam password
@app.route('/api/exams/<int:exam_id>/verify-password', methods=['POST'])
def verify_exam_password(exam_id):
    data = request.get_json()
    password = data.get('password', '')
    
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT exam_password FROM exams WHERE id = %s", (exam_id,))
        exam = cursor.fetchone()
        if not exam:
            return jsonify({'error': 'Exam not found'}), 404
        
        # If no password set, allow access
        if not exam['exam_password']:
            return jsonify({'verified': True}), 200
        
        # Check password match
        if password == exam['exam_password']:
            return jsonify({'verified': True}), 200
        else:
            return jsonify({'verified': False, 'message': 'Incorrect exam password'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

    





# ✅ Export student activity data
@app.route('/api/export', methods=['GET'])
def export_data():
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, username, email, fullname, phone, course FROM students")
    students = cursor.fetchall()
    cursor.close()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Username', 'Email', 'Full Name', 'Phone', 'Course'])
    for s in students:
        writer.writerow([s['id'], s['username'], s['email'], s['fullname'], s['phone'], s.get('course', '')])
    output.seek(0)

    return send_file(
        io.BytesIO(output.getvalue().encode()),
        mimetype='text/csv',
        as_attachment=True,
        download_name='students.csv'
    )

# ✅ Admin Stats
@app.route('/api/admin/stats', methods=['GET'])
def get_admin_stats():
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Total Students
        cursor.execute("SELECT COUNT(*) as count FROM students")
        total_students = cursor.fetchone()['count']

        # Active Students (Students who have attempted at least one exam)
        cursor.execute("SELECT COUNT(DISTINCT student_id) as count FROM exam_attempts")
        active_students = cursor.fetchone()['count']

        # Active Today (Students who attempted an exam today)
        cursor.execute("SELECT COUNT(DISTINCT student_id) as count FROM exam_attempts WHERE DATE(started_at) = CURDATE()")
        active_today = cursor.fetchone()['count']

        # Total Tests (Exams Created)
        cursor.execute("SELECT COUNT(*) as count FROM exams")
        total_tests = cursor.fetchone()['count']

        # Average Score
        cursor.execute("SELECT AVG(score) as avg_score FROM exam_attempts")
        avg_score_row = cursor.fetchone()
        average_score = float(avg_score_row['avg_score']) if avg_score_row['avg_score'] is not None else 0.0

        return jsonify({
            'total_students': total_students,
            'active_students': active_students,
            'active_today': active_today,
            'total_tests': total_tests,
            'average_score': round(average_score, 2)
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Delete Student
@app.route('/api/students/<int:id>', methods=['DELETE'])
def delete_student(id):
    conn = connect_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM students WHERE id = %s", (id,))
        conn.commit()
        if cursor.rowcount > 0:
            return jsonify({'message': 'Student deleted successfully'}), 200
        else:
            return jsonify({'error': 'Student not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Check if Student exists (helper for Update) or specific Get
@app.route('/api/students/<int:id>', methods=['GET'])
def get_student(id):
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, username, email, fullname, phone FROM students WHERE id = %s", (id,))
        student = cursor.fetchone()
        if student:
            return jsonify(student), 200
        else:
            return jsonify({'error': 'Student not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Update Student
@app.route('/api/students/<int:id>', methods=['PUT'])
def update_student(id):
    data = request.get_json()
    conn = connect_db()
    cursor = conn.cursor()
    try:
        # Construct update query dynamically based on provided fields
        fields = []
        values = []
        
        if 'username' in data:
            fields.append("username = %s")
            values.append(data['username'])
        if 'email' in data:
            fields.append("email = %s")
            values.append(data['email'])
        if 'fullname' in data:
            fields.append("fullname = %s")
            values.append(data['fullname'])
        if 'phone' in data:
            fields.append("phone = %s")
            values.append(data['phone'])
            
        if not fields:
            return jsonify({'error': 'No fields to update'}), 400
            
        values.append(id)
        query = f"UPDATE students SET {', '.join(fields)} WHERE id = %s"
        
        cursor.execute(query, tuple(values))
        conn.commit()
        
        if cursor.rowcount > 0:
            return jsonify({'message': 'Student updated successfully'}), 200
        else:
            return jsonify({'message': 'Student updated (or no changes detected)'}), 200
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Get Student Stats (Course-wise)
@app.route('/api/student/<int:id>/stats', methods=['GET'])
def get_student_stats(id):
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get student's course
        cursor.execute("SELECT course FROM students WHERE id = %s", (id,))
        student = cursor.fetchone()
        student_course = student['course'] if student else None

        # Tests Given (only for student's course)
        if student_course:
            cursor.execute("""
                SELECT COUNT(*) as count FROM exam_attempts ea
                JOIN exams e ON ea.exam_id = e.id
                WHERE ea.student_id = %s AND e.course = %s
            """, (id, student_course))
        else:
            cursor.execute("SELECT COUNT(*) as count FROM exam_attempts WHERE student_id = %s", (id,))
        tests_given = cursor.fetchone()['count']

        # Total Tests Available (only for student's course)
        if student_course:
            cursor.execute("SELECT COUNT(*) as count FROM exams WHERE course = %s", (student_course,))
        else:
            cursor.execute("SELECT COUNT(*) as count FROM exams")
        total_tests = cursor.fetchone()['count']

        # Tests Left (Total - Given)
        tests_left = max(0, total_tests - tests_given)

        return jsonify({
            'tests_given': tests_given,
            'tests_left': tests_left,
            'total_tests': total_tests
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Get Student Learning Matrix
@app.route('/api/student/<int:id>/matrix', methods=['GET'])
def get_student_matrix(id):
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get student's course first
        cursor.execute("SELECT course FROM students WHERE id = %s", (id,))
        student = cursor.fetchone()
        student_course = student['course'] if student else None

        # Only show exams assigned to the student's course
        if student_course:
            query = """
                SELECT 
                    e.id as exam_id,
                    e.title, 
                    a.score, 
                    a.submitted_at,
                    (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as total_questions
                FROM exams e 
                LEFT JOIN exam_attempts a ON e.id = a.exam_id AND a.student_id = %s
                WHERE e.course = %s
            """
            cursor.execute(query, (id, student_course))
        else:
            query = """
                SELECT 
                    e.id as exam_id,
                    e.title, 
                    a.score, 
                    a.submitted_at,
                    (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as total_questions
                FROM exams e 
                LEFT JOIN exam_attempts a ON e.id = a.exam_id AND a.student_id = %s
            """
            cursor.execute(query, (id,))

        results = cursor.fetchall()
        
        matrix_data = []
        for row in results:
            score = row['score'] if row['score'] is not None else 0
            total_q = row['total_questions'] if row['total_questions'] else 0
            status = 'Completed' if row['submitted_at'] else 'Not Started'
            
            # Calculate percentage
            percentage = round((score / total_q) * 100) if total_q > 0 and score > 0 else 0
            
            matrix_data.append({
                'exam_id': row['exam_id'],
                'subject': row['title'],
                'status': status,
                'score': score,
                'total_questions': total_q,
                'percentage': percentage
            })

        return jsonify(matrix_data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Create Backup (JSON dump)
@app.route('/api/admin/backup', methods=['GET'])
def create_backup():
    try:
        conn = connect_db()
        cursor = conn.cursor(dictionary=True)
        
        backup_data = {}
        
        # Students
        cursor.execute("SELECT * FROM students")
        backup_data['students'] = cursor.fetchall()
        
        # Exams
        cursor.execute("SELECT * FROM exams")
        backup_data['exams'] = cursor.fetchall() # Date/Time objects might need serialization help
        
        # Questions
        cursor.execute("SELECT * FROM questions")
        backup_data['questions'] = cursor.fetchall()
        
        # Attempts
        cursor.execute("SELECT * FROM exam_attempts")
        backup_data['exam_attempts'] = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        # Custom serializer for datetime objects
        def default(o):
            if isinstance(o, (datetime.date, datetime.datetime)):
                return o.isoformat()
            return str(o)
            
        json_output = json.dumps(backup_data, default=default, indent=4)
        
        return send_file(
            io.BytesIO(json_output.encode()),
            mimetype='application/json',
            as_attachment=True,
            download_name=f'backup_{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        )
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ✅ Export Exam Results (Report)
@app.route('/api/admin/export-results', methods=['GET'])
def export_results():
    try:
        conn = connect_db()
        cursor = conn.cursor(dictionary=True)
        
        query = """
            SELECT 
                s.fullname, s.email, s.course,
                e.title as exam_title, 
                a.score, 
                a.started_at, a.submitted_at
            FROM exam_attempts a
            JOIN students s ON a.student_id = s.id
            JOIN exams e ON a.exam_id = e.id
            ORDER BY a.submitted_at DESC
        """
        cursor.execute(query)
        results = cursor.fetchall()
        
        cursor.close()
        conn.close()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Student Name', 'Email', 'Course', 'Exam Title', 'Score', 'Started At', 'Submitted At'])
        
        for r in results:
            writer.writerow([
                r['fullname'], 
                r['email'], 
                r.get('course', ''),
                r['exam_title'], 
                r['score'], 
                r['started_at'], 
                r['submitted_at']
            ])
            
        output.seek(0)

        return send_file(
            io.BytesIO(output.getvalue().encode()),
            mimetype='text/csv',
            as_attachment=True,
            download_name='exam_results_report.csv'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ✅ Execute Code (Coding Arena)
@app.route('/api/run_code', methods=['POST'])
def run_code():
    try:
        data = request.get_json()
        code = data.get('code')
        language = data.get('language', 'python')
        user_input = data.get('input', '')

        if not code:
            return jsonify({'output': 'No code provided'}), 400

        # Create unique temp file
        filename = f"temp_code_{uuid.uuid4().hex[:8]}.py"
        
        # Use absolute path for temp file to avoid CWD issues
        abs_filename = os.path.join(os.getcwd(), filename)
        
        with open(abs_filename, 'w') as f:
            f.write(code)

        import subprocess
        try:
            # Run the code using the same python interpreter as the server
            # Use sys.executable to ensure we find python
            result = subprocess.run(
                [sys.executable, abs_filename],
                input=user_input,
                capture_output=True,
                text=True,
                timeout=5
            )
            output = result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            output = "Error: Execution timed out (Limit: 5 seconds)"
        except Exception as e:
            output = f"Error: {str(e)}"
        finally:
            # Cleanup
            if os.path.exists(abs_filename):
                os.remove(abs_filename)

        return jsonify({'output': output}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ✅ Get Coding Challenges
@app.route('/api/admin/challenges', methods=['GET'])
def get_challenges():
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM coding_problems ORDER BY created_at DESC")
        challenges = cursor.fetchall()
        return jsonify(challenges), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Create Coding Challenge
@app.route('/api/admin/challenges', methods=['POST'])
def create_challenge():
    conn = connect_db()
    cursor = conn.cursor()
    try:
        data = request.get_json()
        title = data.get('title')
        description = data.get('description')
        example_input = data.get('example_input', '')
        example_output = data.get('example_output', '')

        if not title or not description:
            return jsonify({'error': 'Title and description required'}), 400

        cursor.execute("""
            INSERT INTO coding_problems (title, description, example_input, example_output)
            VALUES (%s, %s, %s, %s)
        """, (title, description, example_input, example_output))
        conn.commit()
        return jsonify({'message': 'Challenge created', 'id': cursor.lastrowid}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Delete Coding Challenge
@app.route('/api/admin/challenges/<int:id>', methods=['DELETE'])
def delete_challenge(id):
    conn = connect_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM coding_problems WHERE id = %s", (id,))
        conn.commit()
        return jsonify({'message': 'Challenge deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ✅ Submit Coding Challenge
@app.route('/api/coding/submit', methods=['POST'])
def submit_coding_challenge():
    conn = connect_db()
    cursor = conn.cursor()
    try:
        data = request.get_json()
        student_id = data.get('student_id')
        challenge_id = data.get('challenge_id')
        code = data.get('code')
        status = data.get('status', 'Pending')

        print(f"DEBUG: Coding submission received. Student: {student_id}, Challenge: {challenge_id}")

        if not student_id or not challenge_id or not code:
            return jsonify({'error': 'Missing required fields'}), 400

        # Create table if not exists (in case it wasn't created by script)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS coding_submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL,
                challenge_id INT NOT NULL,
                code TEXT NOT NULL,
                status ENUM('Pending', 'Accepted', 'Rejected') DEFAULT 'Pending',
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
                FOREIGN KEY (challenge_id) REFERENCES coding_problems(id) ON DELETE CASCADE
            )
        """)

        cursor.execute("""
            INSERT INTO coding_submissions (student_id, challenge_id, code, status)
            VALUES (%s, %s, %s, %s)
        """, (student_id, challenge_id, code, status))
        conn.commit()

        return jsonify({'message': 'Solution submitted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
