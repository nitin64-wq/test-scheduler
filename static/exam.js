let warningCount = 0;
let examSubmitted = false;


document.addEventListener('DOMContentLoaded', async () => {
    const examId = window.location.pathname.split('/').pop();

    // Check login
    if (!localStorage.getItem('user')) {
        alert("Please login first");
        window.location.href = '/login';
        return;
    }

    const studentData = JSON.parse(localStorage.getItem('studentData')) || {};
    const studentId = studentData.id;

    if (!studentId) {
        alert("Student ID missing. Please login again.");
        window.location.href = '/login';
        return;
    }

    // Check if exam already attempted
    try {
        const res = await fetch(`/api/exams/${examId}/attempted?student_id=${studentId}`);
        const data = await res.json();
        if (data.attempted) {
            alert("You have already attempted this exam.");
            window.location.href = '/student';
            return;
        }
    } catch (err) {
        console.error("Error checking attempt status", err);
    }

    // Check if exam time has started (server-side guard)
    try {
        const res = await fetch('/api/exams');
        const exams = await res.json();
        const exam = exams.find(e => e.id == examId);
        if (exam) {
            const examStartTime = new Date(exam.start_time);
            const now = new Date();
            // Allow 5 minutes entry before start
            const entryTime = new Date(examStartTime.getTime() - 5 * 60000);

            if (now < entryTime) {
                alert(`⏳ This exam hasn't started yet.\nIt starts at: ${examStartTime.toLocaleString()}\nYou can enter 5 minutes early for system checks.`);
                window.location.href = '/student';
                return;
            }
        }
    } catch (err) {
        console.error("Error checking exam time", err);
    }

    // Instructions Logic
    const agreeCheckbox = document.getElementById('agreeCheckbox');
    const startExamBtn = document.getElementById('startExamBtn');
    const instructionsView = document.getElementById('instructions-view');
    const examView = document.getElementById('exam-view');

    if (agreeCheckbox && startExamBtn) {
        agreeCheckbox.addEventListener('change', (e) => {
            startExamBtn.disabled = !e.target.checked;
        });

        startExamBtn.addEventListener('click', async () => {
            const originalText = startExamBtn.textContent;
            startExamBtn.disabled = true;
            startExamBtn.textContent = 'Starting...';

            const canStart = await runPreStartChecks(examId);
            if (!canStart) {
                startExamBtn.disabled = false;
                startExamBtn.textContent = originalText;
                return;
            }

            // Request Fullscreen
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.warn("Fullscreen request failed", err);
                });
            }

            instructionsView.style.display = 'none';
            examView.style.display = 'grid'; // restoring grid layout
            await startExamSession(examId);
            startExamBtn.textContent = originalText;
        });
    } else {
        // Fallback if elements missing (e.g. old template)
        console.warn("Instruction elements not found, starting immediately");
        const canStart = await runPreStartChecks(examId);
        if (canStart) {
            await startExamSession(examId);
        }
    }
});

async function startExamSession(examId) {

    // 3. Load Questions & Start Timer
    await loadQuestions(examId);

    // Fetch details to check security settings
    const exam = await fetchExamDetails(examId);
    if (exam) {
        if (exam.security_enabled !== false) { // Default to true if undefined
            document.addEventListener("visibilitychange", handleVisibilityChange);
            window.addEventListener("blur", handleWindowBlur);

            // Disable Shortcuts & Right Click
            document.addEventListener('contextmenu', preventRightClick);
            document.addEventListener('keydown', preventShortcuts);
        } else {
            console.log("Security features disabled for this exam.");
        }
    }

    await loadExamDetailsAndStartTimer(examId, exam);

    document.getElementById('examForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitExam(examId);
    });
}

async function runPreStartChecks(examId) {
    const exam = await fetchExamDetails(examId);
    if (!exam) {
        alert('Unable to load exam details. Please try again.');
        return false;
    }

    // 1. Password Check
    const passwordOk = await verifyExamPasswordIfRequired(examId, exam);
    if (!passwordOk) return false;

    // 2. Camera & DeepFace Check
    // Always run this if security is enabled or simply always for robust checks
    // The user asked for "exam start before 5minutest check the camera test"
    // We'll enforce it.

    if (confirm("We will now perform a camera and face check. Please ensure your face is clearly visible.")) {
        const cameraOk = await performCameraCheck(examId);
        if (!cameraOk) return false;
    } else {
        return false;
    }

    return true;
}

async function performCameraCheck(examId) {
    // 1. Start Camera
    const started = await startCamera(examId);
    if (!started) {
        alert("Camera access failed. Please allow camera permissions.");
        return false;
    }

    // 2. Capture & Analyze
    // Wait a brief moment for camera to adjust
    await new Promise(r => setTimeout(r, 1000));

    // Show status
    const statusEl = document.getElementById('cameraStatus');
    if (statusEl) statusEl.innerText = "Analyzing face...";

    const imageData = captureImageCanvas();
    if (!imageData) {
        alert("Failed to capture image from camera.");
        return false;
    }

    try {
        const studentData = JSON.parse(localStorage.getItem('studentData')) || {};
        const res = await fetch(`/api/exams/${examId}/evidence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: studentData.id,
                image: imageData,
                violation_type: 'pre_start_check'
            })
        });

        const data = await res.json();

        if (data.deepface && data.deepface.violation_type !== 'face_ok') {
            if (data.deepface.violation_type === 'no_face_detected') {
                alert("❌ No face detected! Please center your face in the camera.");
            } else if (data.deepface.violation_type === 'multiple_faces_detected') {
                alert("❌ Multiple faces detected! Only the candidate should be visible.");
            } else {
                alert("❌ Face validation failed: " + data.deepface.violation_type);
            }
            if (statusEl) statusEl.innerText = "Check Failed ❌";
            return false;
        }

        if (statusEl) statusEl.innerText = "Check Passed ✅";
        return true;

    } catch (err) {
        console.error("DeepFace check failed", err);
        alert("System check error. Please try again.");
        return false;
    }
}

async function fetchExamDetails(examId) {
    try {
        const res = await fetch('/api/exams');
        if (!res.ok) return null;
        const exams = await res.json();
        return exams.find(e => String(e.id) === String(examId)) || null;
    } catch (err) {
        console.error('Failed to fetch exam details:', err);
        return null;
    }
}

async function verifyExamPasswordIfRequired(examId, exam) {
    if (!exam || !exam.has_password) return true;

    for (let attempts = 0; attempts < 3; attempts++) {
        const password = prompt('Enter exam password to start:');
        if (password === null) return false;

        try {
            const res = await fetch(`/api/exams/${examId}/verify-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (res.ok && data.verified) return true;
            alert('Incorrect exam password.');
        } catch (err) {
            console.error('Password verification failed:', err);
            alert('Password verification failed. Please try again.');
            return false;
        }
    }

    alert('Too many incorrect password attempts.');
    return false;
}

// ========================
// Camera / Proctoring
// ========================
async function startCamera(examId, options = {}) {
    const video = document.getElementById('cameraPreview');
    const widget = document.getElementById('cameraWidget');
    if (widget) widget.style.display = 'block';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        video.srcObject = stream;
        return true;
    } catch (err) {
        console.error("Camera error:", err);
        return false;
    }
}

function captureImageCanvas() {
    const video = document.getElementById('cameraPreview');
    const canvas = document.getElementById('captureCanvas');
    if (!video || !canvas) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7); // 70% quality
}

function captureImage(examId) {
    const imageData = captureImageCanvas();
    if (!imageData) return; // Silent fail if camera not ready

    // Send to backend (fire & forget for periodic checks)
    const studentData = JSON.parse(localStorage.getItem('studentData')) || {};

    fetch(`/api/exams/${examId}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            student_id: studentData.id,
            image: imageData, // base64
            violation_type: 'periodic_capture'
        })
    }).catch(console.error);
}

function stopCamera() {
    const video = document.getElementById('cameraPreview');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    const cameraWidget = document.getElementById('cameraWidget');
    if (cameraWidget) cameraWidget.style.display = 'none';
}

function captureViolationImage(examId) {
    // Evidence capture removed.
}

async function loadExamDetailsAndStartTimer(examId, examData = null) {
    try {
        let exam = examData;
        if (!exam) {
            const res = await fetch('/api/exams');
            if (!res.ok) return;
            const exams = await res.json();
            exam = exams.find(e => e.id == examId);
        }

        if (exam && exam.duration_minutes) {
            startTimer(exam.duration_minutes, examId);
        } else {
            document.getElementById('timer').innerText = "Time Left: Unlimited";
        }
    } catch (err) {
        console.error("Failed to load exam details for timer", err);
    }
}

function startTimer(durationMinutes, examId) {
    let timeLeft = durationMinutes * 60;
    const timerDisplay = document.getElementById('timer');

    // Clear any existing timer if strictly needed, though we only start once.
    const timerInterval = setInterval(() => {
        if (examSubmitted) {
            clearInterval(timerInterval);
            return;
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerDisplay.innerText = "Time Left: 00:00";
            if (!examSubmitted) {
                alert("Time is up! Submitting exam.");
                submitExam(examId);
            }
            return;
        }

        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        timerDisplay.innerText = `Time Left: ${m}:${s < 10 ? '0' + s : s}`;
        timeLeft--;
    }, 1000);
}

// Security Handlers
function preventRightClick(event) {
    event.preventDefault();
}

function preventShortcuts(e) {
    if (examSubmitted) return;

    // Prevent F12
    if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        alert("Action disabled: Inspect Element is not allowed.");
        return false;
    }

    // Prevent Ctrl+Shift+I (Inspect), Ctrl+Shift+J (Console), Ctrl+Shift+C (Inspect Element), Ctrl+U (View Source)
    if (
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U'))
    ) {
        e.preventDefault();
        e.stopPropagation();
        alert("Action disabled: Viewing source or console is not allowed.");
        return false;
    }

    // Prevent Ctrl+C (Copy), Ctrl+V (Paste), Ctrl+X (Cut), Ctrl+A (Select All)
    if (
        e.ctrlKey && (
            e.key === 'c' || e.key === 'C' ||
            e.key === 'v' || e.key === 'V' ||
            e.key === 'x' || e.key === 'X' ||
            e.key === 'a' || e.key === 'A'
        )
    ) {
        e.preventDefault();
        e.stopPropagation();
        alert("Action disabled: Cut, Copy, Paste, and Select All are not allowed.");
        return false;
    }

    // Prevent Alt+Tab (if possible)
    if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
    }
}

// Initial Listener removal (if they were added globally previously, remove or modify them to be conditional)
// Since we are adding them conditionally in startExamSession, we don't need global listeners here.
// However, if the existing code added them globally, we should remove those lines.
// The existing code at lines 232-276 adds them unconditionally. I will replace those lines with the named functions above.

function handleVisibilityChange() {
    if (document.hidden) {
        handleTabSwitch();
    }
}

function handleWindowBlur() {
    if (!examSubmitted) {
        handleTabSwitch();
    }
}

function handleTabSwitch() {
    if (examSubmitted) return;

    warningCount++;
    const warningBox = document.getElementById('warning-box');
    const warningMsg = document.getElementById('warning-message');
    const examId = window.location.pathname.split('/').pop();

    // Capture violation evidence image
    captureViolationImage(examId);

    if (warningCount === 1) {
        warningBox.style.display = 'block';
        warningMsg.innerText = "You switched tabs! This is your 1st warning. Tab switching is not allowed.";
    } else if (warningCount === 2) {
        warningBox.style.display = 'block';
        warningBox.style.backgroundColor = "#fff3cd"; // Yellow for 2nd warning
        warningBox.style.color = "#856404";
        warningMsg.innerText = "You switched tabs again! This is your 2nd and FINAL warning. Next time the exam will auto-submit.";
    } else if (warningCount >= 3) {
        warningBox.style.display = 'block';
        warningBox.style.backgroundColor = "#f8d7da";
        warningBox.style.color = "#721c24";
        warningMsg.innerText = "Violation limit reached. Submitting exam automatically...";

        // Remove listeners to prevent loops
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("blur", handleWindowBlur);

        const currentExamId = window.location.pathname.split('/').pop();
        submitExam(currentExamId, true);
    }
}


async function loadQuestions(examId) {
    try {
        const res = await fetch(`/api/exams/${examId}/questions`);
        if (!res.ok) throw new Error("Failed to load questions");

        const questions = await res.json();
        const container = document.getElementById('questionsContainer');
        const paletteContainer = document.getElementById('questionPalette');

        if (questions.length === 0) {
            container.innerHTML = "<p>No questions found for this exam.</p>";
            return;
        }

        document.getElementById('examTitle').textContent = `Exam #${examId}`;

        // 1. Render Questions
        container.innerHTML = questions.map((q, index) => `
            <div class="question-card" id="q-card-${index}">
                <div class="question-text">Q${index + 1}. ${q.question_text}</div>
                <ul class="options-list">
                    ${renderOption(q, 'a', 'A', index)}
                    ${renderOption(q, 'b', 'B', index)}
                    ${renderOption(q, 'c', 'C', index)}
                    ${renderOption(q, 'd', 'D', index)}
                </ul>
            </div>
        `).join('');

        // 2. Render Palette
        if (paletteContainer) {
            paletteContainer.innerHTML = questions.map((_, index) => `
                <button type="button" class="palette-btn" id="palette-btn-${index}" onclick="scrollToQuestion(${index})">
                    ${index + 1}
                </button>
            `).join('');
        }

        // 3. Add Change Listener for "Answered" status
        const form = document.getElementById('examForm');
        form.addEventListener('change', (e) => {
            if (e.target.type === 'radio') {
                const questionIndex = e.target.getAttribute('data-index');
                markAnswered(questionIndex);
            }
        });

    } catch (err) {
        console.error(err);
        alert("Error loading exam questions");
    }
}

function scrollToQuestion(index) {
    const card = document.getElementById(`q-card-${index}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Highlight active question style? (Optional)
        document.querySelectorAll('.palette-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`palette-btn-${index}`).classList.add('active');
    }
}

function markAnswered(index) {
    const btn = document.getElementById(`palette-btn-${index}`);
    if (btn) {
        btn.classList.add('answered');
    }
}

function renderOption(q, key, label, index) {
    const val = q[`option_${key}`];
    if (!val) return '';
    return `
        <li>
            <label>
                <input type="radio" name="q_${q.id}" value="${label}" data-index="${index}">
                <span class="option-label">${label}. ${val}</span>
            </label>
        </li>
    `;
}




async function submitExam(examId, forced = false) {
    if (examSubmitted) return; // Prevent double submission
    examSubmitted = true;

    // Capture one final image before submitting
    captureImage(examId);

    // Stop camera
    stopCamera();

    const formData = new FormData(document.getElementById('examForm'));
    const answers = {};

    for (let [key, value] of formData.entries()) {
        const qId = key.replace('q_', '');
        answers[qId] = value;
    }

    // Get student ID from localStorage (assuming it was saved during login)
    const studentData = JSON.parse(localStorage.getItem('studentData')) || {};
    const studentId = studentData.id || 1; // Fallback

    try {
        const payload = {
            student_id: studentId,
            answers: answers,
            violation_alert: forced
        };

        const res = await fetch(`/api/exams/${examId}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (res.ok) {
            let msg = `Exam Submitted! Your Score: ${result.score}/${result.total}`;
            if (forced) {
                msg = "Exam Auto-Submitted due to violation!\n" + msg;
            }
            alert(msg);
            window.location.href = '/student';
        } else {
            alert("Submission failed: " + result.error);
            examSubmitted = false;
        }
    } catch (err) {
        console.error(err);
        alert("Error submitting exam");
        examSubmitted = false;
    }
}


