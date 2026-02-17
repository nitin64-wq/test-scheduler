let currentPage = 1;
const studentsPerPage = 5;

document.addEventListener('DOMContentLoaded', () => {
  // Session check
  const authUser = sessionStorage.getItem('authUser');
  if (!authUser) {
    window.location.href = '/login';
    return;
  }

  const { role } = JSON.parse(authUser);
  if (role !== 'admin') {
    document.getElementById('adminWarning').hidden = false;
    document.querySelector('.admin-container').style.display = 'none';
    return;
  }

  // Logout (Handle multiple buttons: header and sidebar)
  const logoutBtns = document.querySelectorAll('#logoutBtn, .logout-btn-sidebar');
  logoutBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.clear();
      localStorage.clear();
      window.location.href = '/login';
    });
  });

  // Sidebar Navigation Active State
  // Sidebar Navigation (Tab Switching)
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.admin-main > section');

  // Hide all sections initially except the first one (or active one)
  sections.forEach(section => section.style.display = 'none');
  if (sections.length > 0) sections[0].style.display = 'block';

  navLinks.forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault();

      // Update active link state
      navLinks.forEach(l => l.classList.remove('active'));
      this.classList.add('active');

      // Hide all sections
      sections.forEach(section => section.style.display = 'none');

      // Show target section
      const targetId = this.getAttribute('data-target');
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.style.display = 'block';
      }
    });
  });

  // Trigger active state on load (default to first tab)
  const activeLink = document.querySelector('.nav-link.active') || navLinks[0];
  if (activeLink) activeLink.click();

  loadStudents(currentPage);
  loadStudentActivity();
  loadDashboardStats();
  loadCreatedExams();
  loadCreatedExams();
  loadCreatedExams();
  loadAttempts(); // Load results/attempts
  loadChallenges(); // Load coding challenges
});

/* =========================
   Custom Dialog Logic
   ========================= */

function showCustomDialog(type, message, defaultValue = '') {
  return new Promise((resolve) => {
    const modal = document.getElementById('customDialogModal');
    const titleEl = document.getElementById('dialogTitle');
    const msgEl = document.getElementById('dialogMessage');
    const inputContainer = document.getElementById('dialogInputContainer');
    const inputEl = document.querySelector('#dialogInputContainer input');
    const okBtn = document.getElementById('dialogOkBtn');
    const cancelBtn = document.getElementById('dialogCancelBtn');

    // Reset State
    inputEl.value = '';

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

    if (type === 'prompt') inputEl.focus();

    // Handlers
    const close = () => {
      modal.style.display = 'none';
      cleanup();
    };

    const onOk = () => {
      close();
      if (type === 'prompt') resolve(inputEl.value);
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

// Load students (replace dummy with API)
async function loadStudents(page = 1) {
  try {
    const res = await fetch('/api/students');
    const students = await res.json();

    const tbody = document.getElementById('studentTable');
    tbody.innerHTML = students.map(student => `
      <tr>
        <td>${student.fullname || student.username}</td>
        <td>${student.email}</td>
        <td>${student.phone}</td>
        <td>${student.course || '-'}</td>
        <td class="actions">
          <button onclick="viewStudentHistory(${student.id}, '${student.fullname || student.username}')" class="action-btn" style="background:#3498db; color:white; margin-right:5px;"><i class="fas fa-history"></i> History</button>
          <button onclick="resetStudentPassword('${student.id}')" class="action-btn" style="background:#f39c12; color:white; margin-right:5px;" title="Reset Password"><i class="fas fa-key"></i></button>
          <button onclick="editStudent('${student.id}')" class="action-btn edit"><i class="fas fa-edit"></i></button>
          <button onclick="confirmDelete('${student.id}')" class="action-btn delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('');

    document.getElementById('pageInfo').textContent = `Page ${page}`;
  } catch (err) {
    showAdminError(err.message);
  }
}

// Edit student
// Edit student
async function editStudent(id) {
  const newUsername = await customPrompt('Enter new username:');
  if (newUsername === null) return;

  try {
    const res = await fetch(`/api/students/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername })
    });
    const data = await res.json();
    if (res.ok) {
      await customAlert(data.message);
      loadStudents(currentPage);
    } else {
      await customAlert("Error: " + (data.error || data.message));
    }
  } catch (err) {
    await customAlert("Failed to update: " + err.message);
  }
}

// Delete student
// Delete student
async function confirmDelete(id) {
  if (await customConfirm('Are you sure you want to delete this student?')) {
    try {
      const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        await customAlert(data.message);
        loadStudents(currentPage);
        loadDashboardStats();
      } else {
        await customAlert("Error: " + (data.error || "Could not delete"));
      }
    } catch (err) {
      await customAlert("Failed to delete: " + err.message);
    }
  }
}

// Pagination
function changePage(offset) {
  currentPage += offset;
  if (currentPage < 1) currentPage = 1;
  loadStudents(currentPage);
}

// Modal & System Actions
// System Actions
async function performSystemAction(actionType) {
  let message = '';
  let url = '';

  if (actionType === 'clearParams') {
    message = "Are you sure you want to Clear All Tests? This cannot be undone.";
    url = '/api/admin/clear-tests';
  } else if (actionType === 'resetSystem') {
    message = "WARNING: Are you sure you want to Reset the System? This will delete ALL students and exams.";
    url = '/api/admin/reset-system';
  } else {
    return;
  }

  if (!await customConfirm(message)) return;

  try {
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      await customAlert(data.message);
      // Refresh everything
      loadDashboardStats();
      loadStudents(currentPage);
      loadStudentActivity();
    } else {
      await customAlert("Error: " + (data.error || "Action failed"));
    }
  } catch (err) {
    await customAlert("System Error: " + err.message);
  }
}

// Load Student Attempts (Results)
// Load Student Attempts (Results)
let allAttemptsData = [];

async function loadAttempts() {
  try {
    const res = await fetch('/api/admin/attempts');
    allAttemptsData = await res.json();
    filterAttempts(); // Render with current filter
  } catch (err) {
    console.error("Failed to load attempts:", err);
  }
}

function filterAttempts() {
  const filterCourse = document.getElementById('filterResultsCourse').value;
  const tbody = document.getElementById('attemptsTable');
  if (!tbody) return;

  // Filter Logic
  let filteredData = allAttemptsData;
  if (filterCourse !== 'All') {
    filteredData = allAttemptsData.filter(a => a.student_course === filterCourse);
  }

  if (!filteredData.length) {
    tbody.innerHTML = '<tr><td colspan="6">No exams found for this selection.</td></tr>';
    return;
  }

  tbody.innerHTML = filteredData.map(a => {
    const total = a.total_questions || 0;
    const score = a.score || 0;
    let statusHtml = '';

    if (total > 0) {
      const percent = (score / total) * 100;
      const isPass = percent >= 40; // Assuming 40% is pass mark
      statusHtml = isPass
        ? `<span style="color:green; font-weight:bold;">Pass (${Math.round(percent)}%)</span>`
        : `<span style="color:red; font-weight:bold;">Fail (${Math.round(percent)}%)</span>`;
    } else {
      statusHtml = '<span style="color:gray;">-</span>';
    }

    return `
      <tr>
        <td>${a.student_name}</td>
        <td>${a.student_course || '-'}</td>
        <td>${a.exam_title}</td>
        <td>${score} / ${total} <br> ${statusHtml}</td>
        <td>${a.submitted_at || 'In Progress'}</td>
        <td>
          <button onclick="resetAttempt(${a.student_id}, ${a.exam_id})" class="action-btn" style="background:#e67e22; color:white;">
            <i class="fas fa-undo"></i> Retest
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Reset Attempt (Allow Retest)
async function resetAttempt(studentId, examId, fromHistory = false) {
  if (!await customConfirm("Are you sure you want to allow this student to RETAKE the exam? This will wipe their current score.")) return;

  try {
    const res = await fetch('/api/attempts/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, exam_id: examId })
    });
    const data = await res.json();

    if (res.ok) {
      showToast(data.message);
      loadAttempts(); // Refresh table
      loadStudentActivity(); // Refresh activity

      // If called from history modal, refresh it
      if (fromHistory && currentHistoryStudentId === studentId) {
        loadHistoryData(studentId);
      }
    } else {
      await customAlert("Error: " + data.message);
    }
  } catch (err) {
    console.error(err);
    await customAlert("Failed to reset attempt.");
  }
}



// Error
function showAdminError(msg) {
  customAlert("Admin Error: " + msg);
}

// Load created exams
async function loadCreatedExams() {
  try {
    const res = await fetch('/api/exams?admin=true');
    const exams = await res.json();
    const tbody = document.getElementById('examsTable');
    if (!tbody) return;

    if (!exams.length) {
      tbody.innerHTML = '<tr><td colspan="6">No exams created yet.</td></tr>';
      return;
    }

    tbody.innerHTML = exams.map(exam => `
      <tr>
        <td>${exam.id}</td>
        <td>${exam.title}</td>
        <td>${exam.course || 'All'}</td>
        <td>${exam.description || '-'}</td>
        <td>${new Date(exam.start_time).toLocaleString()}</td>
        <td>${exam.duration_minutes} mins <br> <small>${exam.security_enabled ? '🔒 Secured' : '🔓 Unsecured'}</small></td>
        <td><small style="font-family:monospace; background:#f0f0f0; padding:2px 4px; border-radius:4px;">${exam.exam_password || 'None'}</small></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error("Failed to load exams:", err);
  }
}

// Create exam
document.getElementById('createExamForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('examTitle').value.trim();
  const description = document.getElementById('examDesc').value.trim();
  const start_time = document.getElementById('examStartTime').value;
  const duration_minutes = parseInt(document.getElementById('examDuration').value, 10);
  const course = document.getElementById('examCourse').value;
  const examPassword = document.getElementById('examPassword').value.trim();
  const fileInput = document.getElementById('examFile');

  if (!title || !start_time || !duration_minutes || !course || !fileInput.files[0]) {
    await customAlert("Please fill all required fields, including Course, and upload a file!");
    return;
  }



  const securityEnabled = document.getElementById('securityEnabled').checked;

  const formData = new FormData();
  formData.append('title', title);
  formData.append('description', description);
  formData.append('start_time', start_time);
  formData.append('duration_minutes', duration_minutes);
  formData.append('course', course); // Add Course
  formData.append('exam_password', examPassword); // Add Exam Password
  formData.append('security_enabled', securityEnabled); // Add Security Toggle
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch('/api/exams', {
      method: 'POST',
      body: formData // No Content-Type header needed for FormData
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message); // Show toast at bottom
      document.getElementById('createExamForm').reset(); // Clear form
      loadCreatedExams(); // Refresh list
    } else {
      await customAlert("Error: " + (data.error || "Something went wrong"));
    }
  } catch (err) {
    console.error("Exam creation failed:", err);
    await customAlert("Failed to create exam. Check console for details.");
  }
});


// Export exam data (Students)
function exportData() {
  window.location.href = '/api/export';
}

// Export Results Report
function exportResults() {
  window.location.href = '/api/admin/export-results';
}

// Create Backup (JSON)
function createBackup() {
  window.location.href = '/api/admin/backup';
}

// Monitor student activity (placeholder, needs backend support)
async function loadStudentActivity() {
  try {
    const res = await fetch('/api/students');
    const students = await res.json();

    let html = `<table class="data-table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Logged In Today</th>
          <th>Last Login</th>
          <th>Exam Attempted</th>
        </tr>
      </thead>
      <tbody>`;

    students.forEach(s => {
      const lastLogin = s.last_login ? new Date(s.last_login).toLocaleString() : 'Never';
      html += `<tr>
        <td>${s.fullname || s.username}</td>
        <td>${s.logged_in ? "✅ Online" : "❌ Offline"}</td>
        <td>${lastLogin}</td>
        <td>${s.attempted_exam ? "✅ Yes" : "❌ Not Yet"}</td>
      </tr>`;
    });
    html += "</tbody></table>";
    document.getElementById('studentActivity').innerHTML = html;
  } catch (err) {
    showAdminError("Activity load failed: " + err.message);
  }
}

// Load System Analytics
let charts = {}; // Store chart instances

async function loadDashboardStats() {
  try {
    const [statsRes, studentsRes, attemptsRes] = await Promise.all([
      fetch('/api/admin/stats'),
      fetch('/api/students'),
      fetch('/api/admin/attempts')
    ]);

    if (!statsRes.ok) return;

    const stats = await statsRes.json();
    const students = await studentsRes.json();
    const attempts = await attemptsRes.json();

    document.getElementById('total').textContent = `Total Students: ${stats.total_students}`;
    document.getElementById('active').textContent = `Active Students: ${stats.active_students}`;
    document.getElementById('today').textContent = `Active Today: ${stats.active_today}`;
    document.getElementById('tests').textContent = `Total Tests: ${stats.total_tests}`;
    document.getElementById('average').textContent = `Avg. Score: ${stats.average_score}`;

    renderAnalyticsCharts(students, attempts);

  } catch (err) {
    console.error("Stats error:", err);
  }
}

function renderAnalyticsCharts(students, attempts) {
  // 1. Students per Course (Pie Chart)
  const courseCounts = {};
  students.forEach(s => {
    const c = s.course || 'Unknown';
    courseCounts[c] = (courseCounts[c] || 0) + 1;
  });

  const ctx1 = document.getElementById('studentCourseChart').getContext('2d');
  if (charts.courseChart) charts.courseChart.destroy();

  charts.courseChart = new Chart(ctx1, {
    type: 'doughnut',
    data: {
      labels: Object.keys(courseCounts),
      datasets: [{
        data: Object.values(courseCounts),
        backgroundColor: ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#34495e'],
        borderWidth: 1
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });

  // 2. Performance (Bar Chart) - Avg Score per Exam
  const examStats = {}; // { examTitle: { totalScore: 0, count: 0 } }

  attempts.forEach(a => {
    if (!examStats[a.exam_title]) {
      examStats[a.exam_title] = { total: 0, count: 0, max: a.total_questions };
    }
    examStats[a.exam_title].total += (a.score || 0);
    examStats[a.exam_title].count += 1;
  });

  const examLabels = Object.keys(examStats);
  const examAvgScores = examLabels.map(title => {
    const s = examStats[title];
    return s.count ? (s.total / s.count).toFixed(1) : 0;
  });

  const ctx2 = document.getElementById('studentPerformanceChart').getContext('2d');
  if (charts.perfChart) charts.perfChart.destroy();

  charts.perfChart = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: examLabels,
      datasets: [{
        label: 'Average Score',
        data: examAvgScores,
        backgroundColor: '#3498db',
        borderColor: '#2980b9',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Score' } }
      }
    }
  });
}


// Toast Notification Helper
function showToast(message, isError = false) {
  let toast = document.getElementById('toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    Object.assign(toast.style, {
      position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
      backgroundColor: '#333', color: '#fff', padding: '12px 24px', borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: '10000', opacity: '0',
      transition: 'opacity 0.3s ease-in-out', fontSize: '1rem', fontWeight: '500', pointerEvents: 'none'
    });
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.backgroundColor = isError ? '#e74c3c' : '#2ecc71';
  requestAnimationFrame(() => toast.style.opacity = '1');
  setTimeout(() => toast.style.opacity = '0', 3000);
}


/* =========================
   Student History / Single Retest Logic
   ========================= */

let currentHistoryStudentId = null;

async function viewStudentHistory(studentId, studentName) {
  currentHistoryStudentId = studentId;
  document.getElementById('historyStudentName').textContent = studentName;
  document.getElementById('studentHistoryModal').style.display = 'block';
  await loadHistoryData(studentId);
}

function closeHistoryModal() {
  document.getElementById('studentHistoryModal').style.display = 'none';
  currentHistoryStudentId = null;
}

async function loadHistoryData(studentId) {
  try {
    const res = await fetch(`/api/student/${studentId}/matrix`);
    const history = await res.json();
    const tbody = document.getElementById('studentHistoryTableBody');

    if (!history.length) {
      tbody.innerHTML = '<tr><td colspan="6">No exams assigned or attempted yet.</td></tr>';
      return;
    }

    tbody.innerHTML = history.map(h => {
      // Determine if action is needed
      // If completed, show Retest button
      let actionBtn = '-';
      if (h.status === 'Completed') {
        actionBtn = `<button onclick="resetAttempt(${studentId}, ${h.exam_id}, true)" class="action-btn" style="background:#e67e22; color:white; padding:4px 8px; font-size:12px;">Reset / Retest</button>`;
      } else if (h.status === 'In Progress') {
        // Maybe also allow reset if stuck?
        actionBtn = `<button onclick="resetAttempt(${studentId}, ${h.exam_id}, true)" class="action-btn" style="background:#f39c12; color:white; padding:4px 8px; font-size:12px;">Force Reset</button>`;
      }

      return `
        <tr>
          <td>${h.subject}</td>
          <td>${h.status}</td>
          <td>${h.score} / ${h.total_questions}</td>
          <td>${h.total_questions}</td>
          <td>${h.percentage}%</td>
          <td>${actionBtn}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error("History load error", err);
    alert("Failed to load history.");
  }
}

// Wrapper for resetAttempt
async function historyResetAttempt(studentId, examId) {
  await resetAttempt(studentId, examId, true);
}

// Close modal when clicking outside
window.onclick = function (event) {
  const modal = document.getElementById('studentHistoryModal');
  if (event.target == modal) {
    closeHistoryModal();
  }
}


/* ===========================
   Admin Management Handlers
   =========================== */

// Create Admin
const createAdminForm = document.getElementById('createAdminForm');
if (createAdminForm) {
  createAdminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('newAdminUsername').value;
    const password = document.getElementById('newAdminPassword').value;

    try {
      const res = await fetch('/api/admin/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (res.ok) {
        await customAlert(data.message);
        createAdminForm.reset();
      } else {
        await customAlert("Error: " + (data.error || "Failed to create admin"));
      }
    } catch (err) {
      await customAlert("Error: " + err.message);
    }
  });
}

// Change Admin Password
const changeAdminPassForm = document.getElementById('changeAdminPasswordForm');
if (changeAdminPassForm) {
  changeAdminPassForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('currentAdminUsername').value;
    const old_password = document.getElementById('currentAdminOldPass').value;
    const new_password = document.getElementById('currentAdminNewPass').value;

    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, old_password, new_password })
      });
      const data = await res.json();

      if (res.ok) {
        await customAlert(data.message);
        changeAdminPassForm.reset();
      } else {
        await customAlert("Error: " + (data.error || "Failed to change password"));
      }
    } catch (err) {
      await customAlert("Error: " + err.message);
    }
  });
}

// Reset Student Password
async function resetStudentPassword(studentId) {
  const newPassword = await customPrompt("Enter new password for this student:");
  if (!newPassword) return; // Cancelled

  try {
    const res = await fetch('/api/admin/reset-student-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, new_password: newPassword })
    });
    const data = await res.json();

    if (res.ok) {
      await customAlert(data.message);
    } else {
      await customAlert("Error: " + (data.error || "Failed to reset password"));
    }
  } catch (err) {
    await customAlert("Error: " + err.message);
  }
}

/* ===========================
   Coding Challenges Management
   =========================== */

// Create Challenge
const createChallengeForm = document.getElementById('createChallengeForm');
if (createChallengeForm) {
  createChallengeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('chalTitle').value;
    const description = document.getElementById('chalDesc').value;
    const example_input = document.getElementById('chalInput').value;
    const example_output = document.getElementById('chalOutput').value;

    try {
      const res = await fetch('/api/admin/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, example_input, example_output })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Challenge Created!");
        createChallengeForm.reset();
        loadChallenges();
      } else {
        await customAlert("Error: " + data.error);
      }
    } catch (err) {
      console.error(err);
      await customAlert("Failed to create challenge.");
    }
  });
}

// Load Challenges
async function loadChallenges() {
  const list = document.getElementById('challengesList');
  if (!list) return;

  try {
    const res = await fetch('/api/admin/challenges');
    const challenges = await res.json();

    if (challenges.length === 0) {
      list.innerHTML = "<p>No challenges created yet.</p>";
      return;
    }

    list.innerHTML = challenges.map(c => `
      <div style="background: #f9f9f9; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid #eee;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="margin:0;">${c.title}</h4>
          <button onclick="deleteChallenge(${c.id})" style="background:none; border:none; color:red; cursor:pointer;">
            <i class="fas fa-trash"></i>
          </button>
        </div>
        <p style="margin: 5px 0; font-size: 0.9em; color:#555;">${c.description.substring(0, 50)}...</p>
      </div>
    `).join('');
  } catch (err) {
    console.error("Error loading challenges:", err);
    list.innerHTML = "<p>Error loading challenges.</p>";
  }
}

// Delete Challenge
async function deleteChallenge(id) {
  if (!await customConfirm("Delete this challenge?")) return;
  try {
    const res = await fetch(`/api/admin/challenges/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast("Challenge deleted");
      loadChallenges();
    } else {
      await customAlert("Failed to delete");
    }
  } catch (err) {
    console.error(err);
  }
}
