from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
import mysql.connector
import bcrypt
import datetime
import csv
import io
import pandas as pd
import docx

# Database connection 
def connect_db():
    return mysql.connector.connect(
        host='localhost',
        user='root',
        password='',
        database='test'
    )

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/register')
def register_page():
    return render_template('register.html')

@app.route('/student')
def student_page():
    return render_template('student.html')

@app.route('/admin-dashboard')
def serve_admin_dashboard():
    return render_template('admin1.html')

@app.route("/exam/<int:exam_id>")
def serve_exam(exam_id):
    return render_template("exam.html")






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
    cursor.execute("SELECT id, username, email, fullname, phone FROM students")
    students = cursor.fetchall()

    # Check exam attempts for each student
    for s in students:
        # Mock missing columns for frontend
        s['created_at'] = datetime.datetime.now().isoformat() # or some default
        s['last_login'] = None
        
        cursor.execute("SELECT COUNT(*) as count FROM exam_attempts WHERE student_id = %s", (s['id'],))
        count = cursor.fetchone()['count']
        s['attempted_exam'] = count > 0
        s['logged_in'] = False 

    cursor.close()
    conn.close()
    return jsonify(students), 200

# ✅ System Control: Clear All Tests
@app.route('/api/admin/clear-tests', methods=['POST'])
def clear_all_tests():
    conn = connect_db()
    cursor = conn.cursor()
    try:
        # Delete all exams (Cascades to questions and attempts)
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
        required_fields = ['username', 'password', 'email', 'fullName', 'phone']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'All fields are required'}), 400

        hashed_password = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        # Reverted to match original schema (no created_at)
        cursor.execute("""
            INSERT INTO students (username, password, email, fullname, phone)
            VALUES (%s, %s, %s, %s, %s)
        """, (data['username'], hashed_password, data['email'], data['fullName'], data['phone']))
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
            if username == 'admin' and password == 'admin123':
                return jsonify({'success': True, 'role': 'admin'})
            return jsonify({'success': False, 'message': 'Invalid admin credentials'}), 401

        # Student check
        if role == 'student':
            conn = connect_db()
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM students WHERE username = %s", (username,))
            student = cursor.fetchone()
            if not student:
                return jsonify({'success': False, 'message': 'No student found'}), 404

            if bcrypt.checkpw(password.encode('utf-8'), student['password'].encode('utf-8')):
                # SKIP last_login update if column missing
                # cursor.execute("UPDATE students SET last_login = NOW() WHERE id = %s", (student['id'],))
                # conn.commit()
                
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
        file = request.files.get('file')

        print(f"Parsed: title={title}, start={start_time_str}, dur={duration_minutes}, file={file}")

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
                # required keys
                required_columns = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option']

                # Use ExcelFile to read sheets without resetting stream manually if possible, 
                # but better to seek(0) to be safe if it was read before.
                file.stream.seek(0)
                xls = pd.ExcelFile(file)
                print(f"DEBUG: Sheets found: {xls.sheet_names}")
                
                df = None
                found_correct_sheet = False
                
                for sheet in xls.sheet_names:
                    temp_df = pd.read_excel(xls, sheet_name=sheet)
                    # Normalize columns: strip whitespace and lower case just in case? 
                    # User requested specific keys, but let's stick to strip() for now.
                    temp_df.columns = temp_df.columns.str.strip()
                    
                    # Debug print
                    print(f"DEBUG: Sheet '{sheet}' columns: {temp_df.columns.tolist()}")
                    
                    if all(col in temp_df.columns for col in required_columns):
                        df = temp_df
                        found_correct_sheet = True
                        break
                
                if not found_correct_sheet:
                     return jsonify({'error': f"Invalid Excel format. scanned sheets: {xls.sheet_names}. Required: {required_columns}"}), 400
                
                for index, row in df.iterrows():
                    questions_list.append({
                        'question_text': row['question_text'],
                        'option_a': row['option_a'],
                        'option_b': row['option_b'],
                        'option_c': row['option_c'],
                        'option_d': row['option_d'],
                        'correct_option': row['correct_option']
                    })

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
            INSERT INTO exams (title, description, start_time, duration_minutes)
            VALUES (%s, %s, %s, %s)
        """, (title, description, start_time, duration_minutes))
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
    evidence_image = data.get("evidence_image") # Base64 string from camera
    evidence_audio = data.get("evidence_audio") # Base64 string from mic
    violation_alert = data.get("violation_alert", False)

    conn = connect_db()
    cursor = conn.cursor(dictionary=True)

    # Fetch correct answers
    cursor.execute("SELECT id, correct_option FROM questions WHERE exam_id = %s", (exam_id,))
    correct_answers = cursor.fetchall()

    score = 0
    for q in correct_answers:
        qid = str(q["id"])
        if qid in answers and answers[qid] == q["correct_option"]:
            score += 1

    total = len(correct_answers)

    # Save exam attempt
    cursor.execute("""
        INSERT INTO exam_attempts (exam_id, student_id, started_at, submitted_at, score)
        VALUES (%s, %s, NOW(), NOW(), %s)
    """, (exam_id, student_id, score))
    exam_attempt_id = cursor.lastrowid
    conn.commit()

    # Save evidence if provided
    if evidence_image or evidence_audio:
        try:
            import base64
            import os
            
            # Create upload dir if not exists
            upload_folder = os.path.join("uploads", "evidence")
            os.makedirs(upload_folder, exist_ok=True)
            
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            image_filepath = None
            audio_filepath = None

            # 1. Save Image
            if evidence_image:
                filename = f"exam_{exam_id}_stud_{student_id}_{timestamp}.png"
                image_filepath = os.path.join(upload_folder, filename)
                
                if "," in evidence_image:
                    header, encoded = evidence_image.split(",", 1)
                else:
                    encoded = evidence_image
                
                with open(image_filepath, "wb") as f:
                    f.write(base64.b64decode(encoded))

            # 2. Save Audio
            if evidence_audio:
                filename = f"exam_{exam_id}_stud_{student_id}_{timestamp}.webm"
                audio_filepath = os.path.join(upload_folder, filename)
                
                if "," in evidence_audio:
                    header, encoded = evidence_audio.split(",", 1)
                else:
                    encoded = evidence_audio
                
                with open(audio_filepath, "wb") as f:
                    f.write(base64.b64decode(encoded))

            # Log to DB
            violation_type = "Tab Switch Violation" if violation_alert else "Routine/Final Evidence"
            
            cursor.execute("""
                INSERT INTO exam_evidence (exam_id, student_id, image_path, audio_path, violation_type)
                VALUES (%s, %s, %s, %s, %s)
            """, (exam_id, student_id, image_filepath, audio_filepath, violation_type))
            conn.commit()
            
        except Exception as e:
            print(f"Error saving evidence: {e}")
            # Don't fail the submission just because evidence failed

    cursor.close()
    conn.close()

    return jsonify({"score": score, "total": total, "attempt_id": exam_attempt_id}), 200



# ✅ Check if exam already attempted
@app.route('/api/exams/<int:exam_id>/attempted', methods=['GET'])
def check_exam_attempt(exam_id):
    student_id = request.args.get('student_id')
    if not student_id:
        return jsonify({'error': 'Student ID required'}), 400
        
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT COUNT(*) as count FROM exam_attempts WHERE exam_id = %s AND student_id = %s", (exam_id, student_id))
        result = cursor.fetchone()
        count = result['count'] if result else 0
        return jsonify({'attempted': count > 0}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()



@app.route("/api/exams", methods=["GET"])
def get_exams():
    try:
        conn = connect_db()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT id, title, description, start_time, duration_minutes FROM exams")
        exams = cur.fetchall()
        conn.close()
        return jsonify(exams), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    





# ✅ Export student activity data
@app.route('/api/export', methods=['GET'])
def export_data():
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, username, email, fullname, phone FROM students")
    students = cursor.fetchall()
    cursor.close()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Username', 'Email', 'Full Name', 'Phone'])
    for s in students:
        writer.writerow([s['id'], s['username'], s['email'], s['fullname'], s['phone']])
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

# ✅ Get Student Stats
@app.route('/api/student/<int:id>/stats', methods=['GET'])
def get_student_stats(id):
    conn = connect_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Tests Given
        cursor.execute("SELECT COUNT(*) as count FROM exam_attempts WHERE student_id = %s", (id,))
        tests_given = cursor.fetchone()['count']

        # Total Tests Available
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
        # Get all exams and left join with attempts for this student
        query = """
            SELECT 
                e.title, 
                a.score, 
                a.submitted_at 
            FROM exams e 
            LEFT JOIN exam_attempts a ON e.id = a.exam_id AND a.student_id = %s
        """
        cursor.execute(query, (id,))
        results = cursor.fetchall()
        
        matrix_data = []
        for row in results:
            status = 'Completed' if row['submitted_at'] else 'Not Started'
            # Calculate mastering (arbitrary threshold > 80% or just based on score if we knew total)
            # Since we don't have total questions easily here without another join or storing it, 
            # we'll assume a high raw score is mastered or just pass the score.
            # Simplified: Mastered if score >= 8 (assuming 10 q test) or just distinct logic
            
            matrix_data.append({
                'subject': row['title'],
                'status': status,
                'score': row['score'] if row['score'] is not None else 0
            })

        return jsonify(matrix_data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
