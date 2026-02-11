let warningCount = 0;
let examSubmitted = false;
let stream = null;
let mediaRecorder = null;
let audioChunks = [];

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

    // Instructions Logic
    const agreeCheckbox = document.getElementById('agreeCheckbox');
    const startExamBtn = document.getElementById('startExamBtn');
    const instructionsView = document.getElementById('instructions-view');
    const examView = document.getElementById('exam-view');

    if (agreeCheckbox && startExamBtn) {
        agreeCheckbox.addEventListener('change', (e) => {
            startExamBtn.disabled = !e.target.checked;
        });

        startExamBtn.addEventListener('click', () => {
            // Request Fullscreen
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.warn("Fullscreen request failed", err);
                });
            }

            instructionsView.style.display = 'none';
            examView.style.display = 'grid'; // restoring grid layout
            startExamSession(examId);
        });
    } else {
        // Fallback if elements missing (e.g. old template)
        console.warn("Instruction elements not found, starting immediately");
        startExamSession(examId);
    }
});

async function startExamSession(examId) {
    // 1. Request Camera & Mic
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const video = document.getElementById('webcam');
        if (video) {
            video.srcObject = stream;
            document.getElementById('camera-status').innerText = "Camera & Mic Active (Recording)";
            document.getElementById('camera-status').style.color = "green";
        }

        // Start Audio Recording
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };
        mediaRecorder.start();

    } catch (err) {
        console.error("Camera Error:", err);
        alert("Camera and Microphone access is required to take this exam. Please allow access and refresh.");
        return;
    }

    // 2. Tab Switch / Blur Detection
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);

    // 3. Load Questions & Start Timer
    await Promise.all([
        loadQuestions(examId),
        loadExamDetailsAndStartTimer(examId)
    ]);

    document.getElementById('examForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitExam(examId);
    });
}

async function loadExamDetailsAndStartTimer(examId) {
    try {
        const res = await fetch('/api/exams');
        if (!res.ok) return;
        const exams = await res.json();
        const exam = exams.find(e => e.id == examId);

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

// Disable Shortcuts & Right Click
document.addEventListener('contextmenu', event => event.preventDefault());

document.addEventListener('keydown', function (e) {
    if (examSubmitted) return;

    // Prevent F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U (DevTools)
    // Prevent Ctrl+C, Ctrl+V (Copy/Paste)
    // Prevent Alt+Tab (though blur handles switching, keydown helps discourage)
    // Prevent Win key (often used for switching)

    if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
        (e.ctrlKey && e.key === 'u') ||
        (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'x')) ||
        e.altKey ||
        e.metaKey
    ) {
        e.preventDefault();
        e.stopPropagation();
        // Optional: show a small toast or just silently block
        // alert("Shortcuts are disabled during the exam.");
        return false;
    }
});

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

    if (warningCount === 1) {
        warningBox.style.display = 'block';
        warningMsg.innerText = "You switched tabs! This is your first and ONLY warning. Next time the exam will auto-submit.";
        alert("WARNING: Tab switching is not allowed. This is your first warning.");
    } else if (warningCount >= 2) {
        warningBox.style.display = 'block';
        warningBox.style.backgroundColor = "#f8d7da";
        warningBox.style.color = "#721c24";
        warningMsg.innerText = "You switched tabs again. Submitting exam automatically...";

        // Remove listeners to prevent loops
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("blur", handleWindowBlur);

        alert("Violation detected! Submitting exam now.");
        // We need to pass the examId to submitExam. Since we are inside a helper, 
        // we might not have it in scope unless we pass it or make it global.
        // For now, let's extract examId from URL again or rely on the caller context?
        // Actually, handleTabSwitch is called by event listeners. 
        // Best to store examId globally or bind it. 
        // Let's grab it from URL as a fallback or fix scope.
        const examId = window.location.pathname.split('/').pop();
        submitExam(examId, true);
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


function captureSnapshot() {
    try {
        const video = document.getElementById('webcam');
        if (!video || !video.srcObject) return null;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    } catch (e) {
        console.error("Snapshot failed", e);
        return null;
    }
}

function stopRecordingAndGetAudio() {
    return new Promise((resolve) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            resolve(null);
            return;
        }

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                const base64Audio = reader.result;
                resolve(base64Audio);
            };
        };
        mediaRecorder.stop();
    });
}

async function submitExam(examId, forced = false) {
    if (examSubmitted) return; // Prevent double submission
    examSubmitted = true;

    // Capture evidence BEFORE stopping the stream
    let evidenceImage = null;
    if (forced) {
        evidenceImage = captureSnapshot();
    }

    let evidenceAudio = await stopRecordingAndGetAudio();

    // Stop Camera Stream
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    const formData = new FormData(document.getElementById('examForm'));
    const answers = {};

    for (let [key, value] of formData.entries()) {
        const qId = key.replace('q_', '');
        answers[qId] = value;
    }

    // Get student ID from localStorage (assuming it was saved during login)
    // If not, we might need to fetch it or use a dummy one for now if auth is weak
    const studentData = JSON.parse(localStorage.getItem('studentData')) || {};
    const studentId = studentData.id || 1; // Fallback to 1 for testing if missing

    try {
        const payload = {
            student_id: studentId,
            answers: answers,
            violation_alert: forced,
            evidence_audio: evidenceAudio
        };

        if (evidenceImage) {
            payload.evidence_image = evidenceImage;
        }

        const res = await fetch(`/api/exams/${examId}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (res.ok) {
            let msg = `Exam Submitted! Your Score: ${result.score}/${result.total}`;
            if (forced) {
                msg = "Exam Automatically Submitted due to tab switching violation!\nEvidence captured and logged.\n" + msg;
            }
            alert(msg);
            window.location.href = '/student';
        } else {
            alert("Submission failed: " + result.error);
            examSubmitted = false; // Allow retry if failed?
        }
    } catch (err) {
        console.error(err);
        alert("Error submitting exam");
        examSubmitted = false;
    }
}
