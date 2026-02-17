

let noteReminders = JSON.parse(localStorage.getItem("noteReminders")) || [];
let testsTaken = JSON.parse(localStorage.getItem("testsTaken")) || 0;

let totalTests = 10;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();


document.addEventListener("DOMContentLoaded", () => {

  // Auth guard: redirect to login if no session
  const authUser = sessionStorage.getItem('authUser');
  const studentData = JSON.parse(localStorage.getItem("studentData"));

  if (!authUser || !studentData) {
    // Clear any stale data
    localStorage.removeItem('studentData');
    localStorage.removeItem('user');
    localStorage.removeItem('studentUsername');
    sessionStorage.removeItem('authUser');
    window.location.href = '/login';
    return;
  }

  let studentName = "Student";

  if (studentData && studentData.fullname) {
    studentName = studentData.fullname;
  } else {
    // Fallback
    studentName = localStorage.getItem("studentUsername") || "Student";
  }

  const studentNameEl = document.getElementById("studentName");
  if (studentNameEl) studentNameEl.textContent = studentName;

  if (studentData && studentData.course) {
    const badge = document.getElementById("studentCourseBadge");
    if (badge) badge.textContent = studentData.course;
  }

  // Populate Profile
  if (studentData) {
    if (document.getElementById('profileName')) document.getElementById('profileName').value = studentData.fullname || '';
    if (document.getElementById('profileUsername')) document.getElementById('profileUsername').value = studentData.username || '';
    if (document.getElementById('profileEmail')) document.getElementById('profileEmail').value = studentData.email || '';
    if (document.getElementById('profilePhone')) document.getElementById('profilePhone').value = studentData.phone || '';
    if (document.getElementById('profileCourse')) document.getElementById('profileCourse').value = studentData.course || '';
  }

  // Init UI sections
  updateProgressStats();
  updateProgressMatrix();
  renderTakeTestButton();
  loadExams(); // ✅ Show available exams on load

  // Sidebar Navigation (Tab Switching)
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = [
    document.getElementById('overview-section'),
    document.getElementById('profile-section'),
    document.getElementById('progress-section'),
    document.getElementById('exams-section')
    // Add other sections as needed but currently these are the main ones
  ];

  // Helper to hide all main sections
  function hideAllSections() {
    sections.forEach(sec => {
      if (sec) sec.style.display = 'none';
    });
  }

  // Initial state: Show Overview
  hideAllSections();
  if (sections[0]) sections[0].style.display = 'block';

  navLinks.forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault();

      // Update active link state
      navLinks.forEach(l => l.classList.remove('active'));
      this.classList.add('active');

      // Hide all sections
      hideAllSections();

      // Show target section
      const targetId = this.getAttribute('data-target');
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.style.display = 'block';
      }
    });
  });

  // Check reminders every minute
  setInterval(checkReminders, 60000);

  // Logout event
  const logoutBtns = document.querySelectorAll(".logout-btn, .logout-btn-sidebar");
  logoutBtns.forEach(btn => btn.addEventListener("click", logout));
});

// ========================
// Logout
// ========================
function logout() {
  localStorage.clear();
  sessionStorage.clear();
  window.location.href = "/login";
}

/* =========================
   Custom Dialog Logic
   ========================= */

function showCustomDialog(type, message, defaultValue = '') {
  return new Promise((resolve) => {
    const modal = document.getElementById('customDialogModal');
    if (!modal) {
      // Fallback if modal missing
      if (type === 'alert') { alert(message); resolve(true); }
      else if (type === 'confirm') { resolve(confirm(message)); }
      else if (type === 'prompt') { resolve(prompt(message, defaultValue)); }
      return;
    }
    const titleEl = document.getElementById('dialogTitle');
    const msgEl = document.getElementById('dialogMessage');
    const inputContainer = document.getElementById('dialogInputContainer');
    const inputEl = document.querySelector('#dialogInputContainer input');
    const okBtn = document.getElementById('dialogOkBtn');
    const cancelBtn = document.getElementById('dialogCancelBtn');

    // Reset State
    if (inputEl) inputEl.value = '';

    // UI Setup
    if (type === 'alert') {
      titleEl.textContent = 'Alert';
      cancelBtn.style.display = 'none';
      inputContainer.style.display = 'none';
    } else if (type === 'confirm') {
      titleEl.textContent = 'Confirm Action';
      cancelBtn.style.display = 'block';
      cancelBtn.textContent = 'Cancel';
      inputContainer.style.display = 'none';
    } else if (type === 'prompt') {
      titleEl.textContent = 'Input Required';
      cancelBtn.style.display = 'block';
      cancelBtn.textContent = 'Cancel';
      inputContainer.style.display = 'block';
      inputEl.value = defaultValue;
    }

    msgEl.textContent = message;
    modal.style.display = 'block';

    if (type === 'prompt' && inputEl) inputEl.focus();

    // Handlers
    const close = () => {
      modal.style.display = 'none';
      cleanup();
    };

    const onOk = () => {
      close();
      if (type === 'prompt') resolve(inputEl ? inputEl.value : null);
      else resolve(true);
    };

    const onCancel = () => {
      close();
      if (type === 'prompt') resolve(null);
      else resolve(false);
    };

    function cleanup() {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

async function customAlert(msg) { await showCustomDialog('alert', msg); }
async function customConfirm(msg) { return await showCustomDialog('confirm', msg); }
async function customPrompt(msg, val = '') { return await showCustomDialog('prompt', msg, val); }




async function setNoteReminder() {
  const reminderType = document.getElementById("reminderType").value;
  const reminderTime = document.getElementById("noteReminderTime").value;
  const email = document.getElementById("reminderEmail").value;
  const notesArea = document.getElementById("notesArea");

  if (!reminderTime) {
    await customAlert("Please select a reminder time");
    return;
  }

  const reminder = {
    id: Date.now(),
    type: reminderType,
    time: reminderTime,
    email,
    notePreview:
      notesArea.value.substring(0, 30) +
      (notesArea.value.length > 30 ? "..." : ""),
  };

  noteReminders.push(reminder);
  localStorage.setItem("noteReminders", JSON.stringify(noteReminders));

  renderNoteReminders();
  scheduleNotification(reminder);
  if (email) scheduleEmailNotification(reminder);

  await customAlert(`Reminder set for ${new Date(reminderTime).toLocaleString()}`);
}

function renderNoteReminders() {
  const list = document.getElementById("noteRemindersList");
  list.innerHTML = noteReminders
    .map(
      (r) => `
        <div class="reminder-item" data-id="${r.id}">
          <span>⏰ ${new Date(r.time).toLocaleString()}</span>
          <p>${r.notePreview}</p>
          <button onclick="deleteReminder(${r.id})">×</button>
        </div>
      `
    )
    .join("");
}

function deleteReminder(id) {
  noteReminders = noteReminders.filter((r) => r.id !== id);
  localStorage.setItem("noteReminders", JSON.stringify(noteReminders));
  renderNoteReminders();
}

function checkReminders() {
  const now = new Date();
  noteReminders.forEach((r) => {
    if (new Date(r.time) <= now) {
      showNotification(`Notes Reminder: ${r.notePreview}`);
      deleteReminder(r.id);
    }
  });
}

function scheduleNotification(reminder) {
  const delay = new Date(reminder.time) - new Date();
  if (delay > 0) {
    setTimeout(() => {
      showNotification(`Reminder: ${reminder.notePreview}`);
      deleteReminder(reminder.id);
    }, delay);
  }
}

async function showNotification(message) {
  if (!("Notification" in window)) {
    await customAlert(message);
    return;
  }

  if (Notification.permission === "granted") {
    new Notification(message);
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") new Notification(message);
    });
  }

  await customAlert(message);
}

function loadNoteReminders() {
  noteReminders = JSON.parse(localStorage.getItem("noteReminders")) || [];
  renderNoteReminders();
}


function saveNotes() {
  const notesArea = document.getElementById("notesArea");
  localStorage.setItem("savedNotes", notesArea.value);
  customAlert("Notes saved successfully!");
}

function loadNotes() {
  const notesArea = document.getElementById("notesArea");
  const saved = localStorage.getItem("savedNotes");
  if (saved) notesArea.value = saved;
}


// Progress Tracking

async function updateProgressStats() {
  const studentData = JSON.parse(localStorage.getItem("studentData"));
  if (!studentData || !studentData.id) {
    console.warn("No student data found, skipping stats update.");
    return;
  }

  try {
    const res = await fetch(`/api/student/${studentData.id}/stats`);
    const stats = await res.json();

    if (!res.ok) throw new Error(stats.error || "Failed to fetch stats");

    document.getElementById("testsGivenCount").textContent = stats.tests_given;
    document.getElementById("testsLeftCount").textContent = stats.tests_left;

    // Update Global State for Matrix
    testsTaken = stats.tests_given;
    totalTests = stats.total_tests || 10; // Fallback if 0

    const progressFill = document.getElementById("progressFill");
    if (progressFill) {
      // Avoid division by zero
      const total = stats.total_tests === 0 ? 1 : stats.total_tests;
      const percent = Math.min(100, (stats.tests_given / total) * 100);
      progressFill.style.width = percent + "%";
      progressFill.textContent = Math.floor(percent) + "%";
    }

    // Refresh matrix since it depends on global `testsTaken`
    updateProgressMatrix();

  } catch (err) {
    console.error("Error updating progress:", err);
  }
}

function recordTestCompletion() {

  setTimeout(updateProgressStats, 500); // Small delay to allow DB update
}


async function updateProgressMatrix() {
  const container = document.getElementById("matrixRows");
  if (!container) return;

  const studentData = JSON.parse(localStorage.getItem("studentData"));
  if (!studentData || !studentData.id) return;

  try {
    const res = await fetch(`/api/student/${studentData.id}/matrix`);
    const matrix = await res.json();

    container.innerHTML = "";

    if (!matrix || matrix.length === 0) {
      container.innerHTML = "<p style='padding:10px;'>No exams assigned yet.</p>";
      return;
    }

    matrix.forEach((item) => {
      const isCompleted = item.status === 'Completed';
      const score = item.score || 0;
      const total = item.total_questions || 0;
      const percentage = item.percentage || 0;

      // Mastery: >= 80% = Mastered, else just Completed
      const isMastered = isCompleted && percentage >= 80;

      const div = document.createElement("div");
      div.classList.add("matrix-row");
      div.innerHTML = `
          <div class="matrix-cell subject" title="${item.subject}">${item.subject}</div>
          <div class="matrix-cell not-started">${!isCompleted ? '⬜' : ''}</div>
          <div class="matrix-cell in-progress">${isCompleted && !isMastered ? '🟡' : ''}</div>
          <div class="matrix-cell completed">${isCompleted ? score + '/' + total + ' (' + percentage + '%)' : '-'}</div>
          <div class="matrix-cell mastered">${isMastered ? '🟢' : ''}</div>
        `;
      container.appendChild(div);
    });

  } catch (err) {
    console.error("Error loading matrix:", err);
    container.innerHTML = "<p>Error loading progress.</p>";
  }
}


function renderTakeTestButton() {
  const btn = document.getElementById("takeTestBtn");
  if (!btn) return;

  btn.className = "take-test-btn";
  btn.addEventListener("click", async () => {
    recordTestCompletion();
    await customAlert("Test completed! Progress updated.");
  });
}


async function loadExams() {
  try {
    const studentData = JSON.parse(localStorage.getItem("studentData"));
    let url = "/api/exams";
    if (studentData && studentData.course) {
      url += `?course=${encodeURIComponent(studentData.course)}`;
    }

    const res = await fetch(url);
    const exams = await res.json();
    const examList = document.getElementById("examList");
    examList.innerHTML = "";

    if (!exams || exams.length === 0) {
      examList.innerHTML = "<p>No exams available</p>";
      return;
    }

    // Fetch attempted exam status map
    let statusMap = {};
    if (studentData && studentData.id) {
      try {
        const attemptRes = await fetch(`/api/exams/attempted-list?student_id=${studentData.id}`);
        const attemptData = await attemptRes.json();
        // Fallback for older API or new format
        if (attemptData.exam_statuses) {
          statusMap = attemptData.exam_statuses;
        } else if (attemptData.attempted_exam_ids) {
          // Old format fallback
          attemptData.attempted_exam_ids.forEach(id => statusMap[id] = { attempted: true, is_retest: false });
        }
      } catch (e) {
        console.error("Error fetching attempted exams:", e);
      }
    }

    exams.forEach((exam) => {
      const status = statusMap[exam.id] || { attempted: false, is_retest: false };
      const isAttempted = status.attempted;
      // If it is a retest and NOT attempted (because we reset allowed), we show (Retest)
      // Actually, if we reset, attempted becomes FALSE. But is_retest becomes TRUE.
      const isRetest = status.is_retest;

      const examStartTime = new Date(exam.start_time);
      const examEndTime = new Date(examStartTime.getTime() + (exam.duration_minutes * 60 * 1000));
      const now = new Date();
      const isStarted = now >= examStartTime;
      const isExpired = now >= examEndTime;
      const hasPassword = exam.has_password;

      const card = document.createElement("div");
      card.className = "quiz-card";

      let buttonHtml;
      let statusHtml = "";

      // Dynamic Title
      let titleHtml = `<h3>${exam.title}`;
      if (isRetest && !isAttempted) {
        titleHtml += ` <span style="color:#e67e22; font-weight:bold;">(Retest)</span>`;
      }
      if (hasPassword) {
        titleHtml += ` <span style="font-size:0.7em; color:#e67e22;">🔑 Password Protected</span>`;
      }
      titleHtml += `</h3>`;

      if (isAttempted) {
        // Already completed
        buttonHtml = `<button disabled style="background: #6c757d; cursor: not-allowed; opacity: 0.8; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 0.95rem;">✅ Already Completed</button>`;
      } else if (isExpired && !isRetest) {
        // Exam time has passed (unless it's a retest, which overrides expiry)
        buttonHtml = `<button disabled style="background: #dc3545; cursor: not-allowed; opacity: 0.7; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 0.95rem;">⏰ Exam Expired</button>`;
      } else if (!isStarted) {
        // Exam hasn't started yet — show countdown
        const diff = examStartTime - now;
        const hrs = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        statusHtml = `<div style="background: #fff3cd; color: #856404; padding: 8px 12px; border-radius: 6px; margin: 8px 0; font-size: 0.85rem;">
          ⏳ Exam starts in <strong>${hrs}h ${mins}m</strong> — Please wait
        </div>`;
        buttonHtml = `<button disabled style="background: #ffc107; cursor: not-allowed; color: #333; border: none; padding: 10px 20px; border-radius: 6px; font-size: 0.95rem;">🔒 Not Yet Available</button>`;
      } else {
        // Exam is available to take
        const lockIcon = hasPassword ? '🔑 ' : '';
        const retestBadge = isRetest ? '🔄 ' : '';
        buttonHtml = `<button onclick="startExam(${exam.id}, ${hasPassword})" style="background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 0.95rem;">${retestBadge}${lockIcon}Take Exam</button>`;
      }

      card.innerHTML = `
        ${titleHtml}
        <p>${exam.description || "No description"}</p>
        <small>Start: ${examStartTime.toLocaleString()}</small><br>
        <small>Duration: ${exam.duration_minutes || exam.duration} mins</small><br>
        ${statusHtml}
        ${buttonHtml}
      `;
      examList.appendChild(card);
    });
  } catch (err) {
    console.error("Error loading exams:", err);
  }
}


async function startExam(examId, hasPassword) {
  // Password check is handled on the actual exam page now to avoid double entry.
  window.location.href = `/exam/${examId}`;
}
