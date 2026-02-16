document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirmPassword = document.getElementById('regConfirmPassword').value;
  const phone = document.getElementById('regNumber').value;
  const course = document.getElementById('regCourse').value;
  const terms = document.getElementById('terms').checked;

  const errors = [];
  if (!/^[A-Za-z ]{3,50}$/.test(fullName)) errors.push('Invalid full name');
  if (!validateEmail(email)) errors.push('Invalid email format');
  if (!course) errors.push('Please select a course');
  if (password.length < 8) errors.push('Password too short');
  if (password !== confirmPassword) errors.push('Passwords mismatch');
  if (!terms) errors.push('Must accept terms');

  if (errors.length > 0) {
    showMessage(errors.join(', '));
    return;
  }

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName,
        email,
        username,
        password,
        phone,
        course
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Registration failed');
    }

    showMessage('Registration successful!');
    // Optionally redirect or reset form here

  } catch (err) {
    showMessage(err.message || 'Failed to connect to server');
  }
});

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showMessage(msg) {
  const msgEl = document.getElementById('registerMessage');
  msgEl.innerHTML = msg;
  msgEl.style.color = msg.includes('successful') ? 'green' : 'red';
}
