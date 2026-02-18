document.addEventListener('DOMContentLoaded', () => {
  // UI Elements
  const sendOtpBtn = document.getElementById('sendOtpBtn');
  const registerForm = document.getElementById('registerForm');
  const msgEl = document.getElementById('registerMessage');

  // Helper: Show Message
  function showMessage(msg, type = 'error') {
    if (!msgEl) return;
    msgEl.innerHTML = msg;
    msgEl.style.color = type === 'success' ? '#2ecc71' : '#e74c3c'; // Green or Red
    msgEl.style.padding = '10px';
    msgEl.style.background = type === 'success' ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)';
    msgEl.style.borderRadius = '5px';
  }

  // Helper: Validate Email
  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // Send OTP Logic
  if (sendOtpBtn) {
    sendOtpBtn.addEventListener('click', async () => {
      const emailInput = document.getElementById('regEmail');
      const email = emailInput ? emailInput.value.trim() : '';

      if (!validateEmail(email)) {
        showMessage('Please enter a valid email address first.', 'error');
        if (emailInput) emailInput.focus();
        return;
      }

      try {
        sendOtpBtn.disabled = true;
        sendOtpBtn.textContent = 'Sending...';

        const response = await fetch('/api/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        const data = await response.json();
        console.log('Server response:', data);

        if (!response.ok) {
          throw new Error(data.error || 'Failed to send OTP');
        }

        showMessage('OTP sent to your email!', 'success');

        // Start Countdown Timer
        let countdown = 60;
        sendOtpBtn.textContent = `Resend in ${countdown}s`;

        const timer = setInterval(() => {
          countdown--;
          sendOtpBtn.textContent = `Resend in ${countdown}s`;

          if (countdown <= 0) {
            clearInterval(timer);
            sendOtpBtn.textContent = 'Resend Code';
            sendOtpBtn.disabled = false;
          }
        }, 1000);

        // Focus on OTP input
        const otpInput = document.getElementById('otp');
        if (otpInput) otpInput.focus();

      } catch (err) {
        console.error('OTP Error:', err);
        showMessage(err.message, 'error');
        // FORCE ALERT for visibility
        // alert('Failed to send OTP: ' + err.message);
        sendOtpBtn.textContent = 'Try Again';
        sendOtpBtn.disabled = false;
      }
    });
  }

  // Registration Submission Logic
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      showMessage(''); // Clear previous messages

      // Get Values
      const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value.trim() : '';

      const fullName = getVal('fullName');
      const email = getVal('regEmail');
      const username = getVal('regUsername');
      const password = document.getElementById('regPassword').value;
      const confirmPassword = document.getElementById('regConfirmPassword').value;
      const phone = getVal('regNumber');
      const course = getVal('regCourse');
      const otp = getVal('otp');
      const termsEl = document.getElementById('terms');
      const terms = termsEl ? termsEl.checked : false;

      // Validation
      const errors = [];
      if (fullName.length < 3) errors.push('Full name must be at least 3 characters');
      if (!validateEmail(email)) errors.push('Invalid email format');
      if (!username) errors.push('Username is required');
      if (password.length < 8) errors.push('Password must be at least 8 characters');
      if (password !== confirmPassword) errors.push('Passwords do not match');
      if (!phone) errors.push('Phone number is required');
      if (!course) errors.push('Please select a course');
      if (otp.length !== 6) errors.push('OTP must be exactly 6 digits');
      if (!terms) errors.push('You must agree to the terms and conditions');

      if (errors.length > 0) {
        showMessage(errors.join('<br>'), 'error');
        return;
      }

      // Submit
      try {
        const btn = registerForm.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Creating Account...';
        }

        const response = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName,
            email,
            username,
            password,
            phone,
            course,
            otp
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Registration failed');
        }

        showMessage('Registration successful! Redirecting...', 'success');

        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);

      } catch (err) {
        showMessage(err.message || 'Failed to connect to server', 'error');
        const btn = registerForm.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Create Account';
        }
      }
    });
  }
});
