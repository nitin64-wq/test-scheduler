

let noteReminders = JSON.parse(localStorage.getItem("noteReminders")) || [];
let testsTaken = JSON.parse(localStorage.getItem("testsTaken")) || 0;

let totalTests = 10;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();


document.addEventListener("DOMContentLoaded", () => {

  let studentName = "Student";
  const studentData = JSON.parse(localStorage.getItem("studentData"));

  if (studentData && studentData.fullname) {
    studentName = studentData.fullname;
  } else {
    // Fallback
    studentName = localStorage.getItem("studentUsername") || "Student";
  }

  const studentNameEl = document.getElementById("studentName");
  if (studentNameEl) studentNameEl.textContent = studentName;

  // Init UI sections
  updateProgressStats();
  updateProgressMatrix();
  renderTakeTestButton();
  loadExams(); // ✅ Show available exams on load

  // Check reminders every minute
  setInterval(checkReminders, 60000);

  // Logout event
  const logoutBtn = document.querySelector(".logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
});

// ========================
// Logout
// ========================
function logout() {
  localStorage.clear();
  sessionStorage.clear();
  window.location.href = "/login";
}


function setNoteReminder() {
  const reminderType = document.getElementById("reminderType").value;
  const reminderTime = document.getElementById("noteReminderTime").value;
  const email = document.getElementById("reminderEmail").value;
  const notesArea = document.getElementById("notesArea");

  if (!reminderTime) {
    alert("Please select a reminder time");
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

  alert(`Reminder set for ${new Date(reminderTime).toLocaleString()}`);
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

function showNotification(message) {
  if (!("Notification" in window)) {
    alert(message);
    return;
  }

  if (Notification.permission === "granted") {
    new Notification(message);
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") new Notification(message);
    });
  }

  alert(message);
}

function loadNoteReminders() {
  noteReminders = JSON.parse(localStorage.getItem("noteReminders")) || [];
  renderNoteReminders();
}


function saveNotes() {
  const notesArea = document.getElementById("notesArea");
  localStorage.setItem("savedNotes", notesArea.value);
  alert("Notes saved successfully!");
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
 

      const div = document.createElement("div");
      div.classList.add("matrix-row");
      div.innerHTML = `
          <div class="matrix-cell subject" title="${item.subject}">${item.subject}</div>
          <div class="matrix-cell not-started">${!isCompleted ? 1 : 0}</div>
          <div class="matrix-cell in-progress">0</div>
          <div class="matrix-cell completed">${isCompleted ? 1 : 0}</div>
          <div class="matrix-cell mastered">${(isCompleted && item.score >= 8) ? 1 : 0}</div>
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
  btn.addEventListener("click", () => {
    recordTestCompletion();
    alert("Test completed! Progress updated.");
  });
}


async function loadExams() {
  try {
    const res = await fetch("/api/exams");
    const exams = await res.json();
    const examList = document.getElementById("examList");
    examList.innerHTML = "";

    if (!exams || exams.length === 0) {
      examList.innerHTML = "<p>No exams available</p>";
      return;
    }

    exams.forEach((exam) => {
      const card = document.createElement("div");
      card.className = "quiz-card";
      card.innerHTML = `
        <h3>${exam.title}</h3>
        <p>${exam.description || "No description"}</p>
        <small>Start: ${new Date(exam.start_time).toLocaleString()}</small><br>
        <small>Duration: ${exam.duration_minutes || exam.duration} mins</small><br>
        <button onclick="startExam(${exam.id})">Take Exam</button>
      `;
      examList.appendChild(card);
    });
  } catch (err) {
    console.error("Error loading exams:", err);
  }
}


function startExam(examId) {
  alert("Starting exam with ID: " + examId);
  window.location.href = `/exam/${examId}`;
}
