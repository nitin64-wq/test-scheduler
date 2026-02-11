// login.js - Modern Login Handler with Enhanced Features
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginMessage = document.getElementById('loginMessage');
    const submitBtn = document.querySelector('#loginForm button[type="submit"]');
    const loadingIndicator = document.createElement('div');

    // Configure loading indicator
    loadingIndicator.className = 'loading';
    loadingIndicator.innerHTML = '⏳ Processing...';
    loadingIndicator.style.display = 'none';
    loginForm.appendChild(loadingIndicator);

    // Enhanced input validation
    const validateInputs = (username, password, role) => {
        const errors = [];
        if (!username.trim()) errors.push('Username is required');
        if (!password.trim()) errors.push('Password is required');
        if (!role) errors.push('Role selection is required');
        if (password.length < 8) errors.push('Password must be at least 8 characters');
        return errors;
    };

    // Improved message handler
    const showMessage = (message, type = 'error') => {
        loginMessage.innerHTML = message;
        loginMessage.className = `login-message ${type}`;
        loginMessage.style.display = 'block';
        if (type === 'success') {
            setTimeout(() => { loginMessage.style.display = 'none'; }, 3000);
        }
    };

    // Form submission handler
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const role = document.getElementById('role').value;

        // Clear previous messages
        loginMessage.style.display = 'none';

        // Input validation
        const validationErrors = validateInputs(username, password, role);
        if (validationErrors.length > 0) {
            return showMessage(validationErrors.join('<br>'));
        }

        try {
            // UI feedback
            submitBtn.disabled = true;
            loadingIndicator.style.display = 'block';

            // API request (use relative path)
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({ username, password, role })
            });

            // Parse once
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || `HTTP error! status: ${response.status}`);
            }

            // Handle successful login
            if (result.success) {
                showMessage('Login successful! Redirecting...', 'success');

                // Store user session
                sessionStorage.setItem('authUser', JSON.stringify({
                    username,
                    role,
                    token: result.token || Date.now().toString(36) // Mock token for demo
                }));
                localStorage.setItem("studentUsername", username);

                if (result.student) {
                    localStorage.setItem("studentData", JSON.stringify(result.student));
                    localStorage.setItem("user", JSON.stringify(result.student)); // For backward compatibility
                }


                // Role-based redirection
                setTimeout(() => {
                    window.location.href = role === 'admin'
                        ? '/admin-dashboard'
                        : '/student';
                }, 1500);

            } else {
                showMessage(result.message || 'Authentication failed');
            }
        } catch (error) {
            console.error('Login Error:', error);
            showMessage(
                error.message.includes('Failed to fetch')
                    ? 'Network error - Please check your connection'
                    : error.message
            );
        } finally {
            // Reset UI state
            submitBtn.disabled = false;
            loadingIndicator.style.display = 'none';
        }
    });

    // Session check for returning users
    const checkExistingSession = () => {
        const authUser = sessionStorage.getItem('authUser');
        if (authUser) {
            const { role } = JSON.parse(authUser);
            window.location.href = role === 'admin'
                ? '/admin-dashboard'
                : '/student';
        }
    };

    // Initial session check
    checkExistingSession();
});
