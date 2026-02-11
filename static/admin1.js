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

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.clear();
      localStorage.clear();
      window.location.href = '/login';
    });
  }

  loadStudents(currentPage);
  loadStudentActivity();
  loadDashboardStats();
});

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
        <td class="actions">
          <button onclick="viewProgress('${student.id}', '${student.fullname || student.username}')" class="action-btn view" title="View Progress"><i class="fas fa-chart-line"></i></button>
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
  const newUsername = prompt('Enter new username:');
  if (newUsername === null) return;

  try {
    const res = await fetch(`/api/students/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername })
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      loadStudents(currentPage);
    } else {
      alert("Error: " + (data.error || data.message));
    }
  } catch (err) {
    alert("Failed to update: " + err.message);
  }
}

// Delete student
// Delete student
async function confirmDelete(id) {
  if (confirm('Are you sure you want to delete this student?')) {
    try {
      const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        loadStudents(currentPage);
        loadDashboardStats();
      } else {
        alert("Error: " + (data.error || "Could not delete"));
      }
    } catch (err) {
      alert("Failed to delete: " + err.message);
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
let currentAction = null;

function openModal(actionType) {
  currentAction = actionType;
  const modalText = document.querySelector('#confirmModal p');

  if (actionType === 'clearParams') {
    modalText.textContent = "Are you sure you want to Clear All Tests? This cannot be undone.";
  } else if (actionType === 'resetSystem') {
    modalText.textContent = "WARNING: Are you sure you want to Reset the System? This will delete ALL students and exams.";
  }

  document.getElementById('confirmModal').style.display = 'block';
}

function closeModal() {
  document.getElementById('confirmModal').style.display = 'none';
  currentAction = null;
}

async function confirmAction() {
  if (!currentAction) return;

  let url = '';
  if (currentAction === 'clearParams') {
    url = '/api/admin/clear-tests';
  } else if (currentAction === 'resetSystem') {
    url = '/api/admin/reset-system';
  }

  try {
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      // Refresh everything
      loadDashboardStats();
      loadStudents(currentPage);
      loadStudentActivity();
    } else {
      alert("Error: " + (data.error || "Action failed"));
    }
  } catch (err) {
    alert("System Error: " + err.message);
  }

  closeModal();
}

// Progress Matrix View for Admin
async function viewProgress(studentId, studentName) {
  document.getElementById('progressStudentName').textContent = studentName;
  const container = document.getElementById('adminMatrixContainer');
  container.innerHTML = '<p>Loading...</p>';

  document.getElementById('progressModal').style.display = 'flex'; // Flex to center

  try {
    const res = await fetch(`/api/student/${studentId}/matrix`);
    const matrix = await res.json();

    container.innerHTML = "";

    if (!matrix || matrix.length === 0) {
      container.innerHTML = "<p style='padding:10px;'>No exams assigned/taken yet.</p>";
      return;
    }

    matrix.forEach((item) => {
      const isCompleted = item.status === 'Completed';
      const div = document.createElement("div");
      div.classList.add("matrix-row");
      div.innerHTML = `
          <div class="matrix-cell subject" title="${item.subject}">${item.subject}</div>
          <div class="matrix-cell"><span class="${!isCompleted ? 'not-started' : ''}">${!isCompleted ? 1 : 0}</span></div>
          <div class="matrix-cell">0</div>
          <div class="matrix-cell"><span class="${isCompleted ? 'completed' : ''}">${isCompleted ? 1 : 0}</span></div>
          <div class="matrix-cell"><span class="${(isCompleted && item.score >= 8) ? 'mastered' : ''}">${(isCompleted && item.score >= 8) ? 1 : 0}</span></div>
        `;
      // Note: I simplified the span classes slightly to match what style1.css likely expects or what I will add to styles3.css
      container.appendChild(div);
    });

  } catch (err) {
    console.error("Error loading matrix:", err);
    container.innerHTML = "<p>Error loading progress.</p>";
  }
}

function closeProgressModal() {
  document.getElementById('progressModal').style.display = 'none';
}

// Error
function showAdminError(msg) {
  alert("Admin Error: " + msg);
}

// Create exam
document.getElementById('createExamForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('examTitle').value.trim();
  const description = document.getElementById('examDesc').value.trim();
  const start_time = document.getElementById('examStartTime').value;
  const duration_minutes = parseInt(document.getElementById('examDuration').value, 10);
  const fileInput = document.getElementById('examFile');

  if (!title || !start_time || !duration_minutes || !fileInput.files[0]) {
    alert("Please fill all required fields and upload a file!");
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('description', description);
  formData.append('start_time', start_time);
  formData.append('duration_minutes', duration_minutes);
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch('/api/exams', {
      method: 'POST',
      body: formData // No Content-Type header needed for FormData
    });

    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      document.getElementById('createExamForm').reset(); // Clear form
    } else {
      alert("Error: " + (data.error || "Something went wrong"));
    }
  } catch (err) {
    console.error("Exam creation failed:", err);
    alert("Failed to create exam. Check console for details.");
  }
});


// Export exam data
function exportData() {
  window.location.href = '/api/export';
}

// Monitor student activity (placeholder, needs backend support)
async function loadStudentActivity() {
  try {
    const res = await fetch('/api/students');
    const students = await res.json();

    let html = "<table><tr><th>Student</th><th>Logged In</th><th>Exam Attempted</th></tr>";
    students.forEach(s => {
      html += `<tr>
        <td>${s.username}</td>
        <td>${s.logged_in ? "✅" : "❌"}</td>
        <td>${s.attempted_exam ? "✅" : "❌"}</td>
      </tr>`;
    });
    html += "</table>";
    document.getElementById('studentActivity').innerHTML = html;
  } catch (err) {
    showAdminError("Activity load failed: " + err.message);
  }
}

// Load System Analytics
async function loadDashboardStats() {
  try {
    const res = await fetch('/api/admin/stats');
    if (!res.ok) return; // Silent fail or log
    const data = await res.json();

    document.getElementById('total').textContent = `Total Students: ${data.total_students}`;
    document.getElementById('active').textContent = `Active Students: ${data.active_students}`;
    document.getElementById('today').textContent = `Active Today: ${data.active_today}`;
    document.getElementById('tests').textContent = `Total Tests: ${data.total_tests}`;
    document.getElementById('average').textContent = `Avg. Score: ${data.average_score}`;
  } catch (err) {
    console.error("Stats error:", err);
  }
}


