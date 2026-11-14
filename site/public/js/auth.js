async function postData(url = '', data = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

function showAlert(el, message, type = 'success') {
  if (!el) return;
  el.textContent = message;
  el.className = `alert ${type}`;
  el.style.display = 'block';
}

// Login
const loginForm = document.querySelector('#loginForm');
if (loginForm) {
  const alertBox = document.querySelector('#loginAlert');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(loginForm));
    const data = await postData('/api/login', formData);
    if (data.success) {
      showAlert(alertBox, 'Login successful. Redirecting...', 'success');
      const redirect = localStorage.getItem('postLoginRedirect');
      const target = redirect || (data.user.role === 'admin' ? '/admin' : '/user');
      if (redirect) localStorage.removeItem('postLoginRedirect');
      setTimeout(() => (window.location.href = target), 700);
    } else {
      showAlert(alertBox, data.message || 'Login failed', 'error');
    }
  });
}

// Register (two-step: form → OTP → account created)
const registerForm = document.querySelector('#registerForm');
const otpForm = document.querySelector('#otpForm');
if (registerForm && otpForm) {
  const alertBox = document.querySelector('#registerAlert');
  const otpHint = document.querySelector('#otpHint');
  let pendingEmail = '';
  let pendingFormData = null;

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = registerForm.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Sending OTP...';
    pendingFormData = Object.fromEntries(new FormData(registerForm));
    const data = await postData('/api/register', pendingFormData);
    btn.disabled = false;
    btn.textContent = 'Send OTP';
    if (data.success) {
      if (data.otpSent) {
        pendingEmail = pendingFormData.email;
        showAlert(alertBox, `OTP sent to ${pendingEmail}. Check your inbox (and spam folder).`, 'success');
        registerForm.style.display = 'none';
        otpForm.style.display = 'block';
        otpHint.textContent = `Enter the 6-digit code sent to ${pendingEmail}. Expires in 10 minutes.`;
        otpForm.querySelector('input[name=otp]').focus();
      } else {
        showAlert(alertBox, 'Account created. You can log in now.', 'success');
        registerForm.reset();
        setTimeout(() => { window.location.href = '/login'; }, 1200);
      }
    } else {
      showAlert(alertBox, data.message || 'Registration failed', 'error');
    }
  });

  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = otpForm.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Verifying...';
    const otp = otpForm.querySelector('input[name=otp]').value.trim();
    const data = await postData('/api/verify-otp', { email: pendingEmail, otp });
    btn.disabled = false;
    btn.textContent = 'Verify & Create Account';
    if (data.success) {
      showAlert(alertBox, 'Email verified! Account created. Redirecting to login...', 'success');
      setTimeout(() => { window.location.href = '/login'; }, 1500);
    } else {
      showAlert(alertBox, data.message || 'Verification failed', 'error');
    }
  });

  document.querySelector('#resendOtpBtn').addEventListener('click', async () => {
    if (!pendingFormData) return;
    const btn = document.querySelector('#resendOtpBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    const data = await postData('/api/register', pendingFormData);
    btn.disabled = false;
    btn.textContent = 'Resend OTP';
    if (data.success && data.otpSent) {
      showAlert(alertBox, 'OTP resent. Check your inbox.', 'success');
    } else {
      showAlert(alertBox, data.message || 'Could not resend OTP', 'error');
    }
  });
}

// Forgot password (placeholder)
const forgotForm = document.querySelector('#forgotForm');
if (forgotForm) {
  const alertBox = document.querySelector('#forgotAlert');
  forgotForm.addEventListener('submit', (e) => {
    e.preventDefault();
    showAlert(alertBox, 'Password reset feature is handled by admin. Contact support.', 'success');
  });
}
