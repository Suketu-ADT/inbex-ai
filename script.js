/**
 * INBEX — Login Page Script  v2.0
 * Handles: password visibility, form validation,
 *          loading state, toast notifications, blob parallax
 */

'use strict';

/* =====================================================
   DOM References
===================================================== */
// Auto-redirect if already logged in
if (window.Auth && window.Auth.isAuthenticated()) {
    window.location.href = 'dashboard.html';
}

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const toggleBtn = document.getElementById('toggle-password');
const submitBtn = document.getElementById('submit-btn');
const googleBtn = document.getElementById('google-btn');
const forgotLink = document.getElementById('forgot-link');

const emailGroup = document.getElementById('email-group');
const passwordGroup = document.getElementById('password-group');
const emailError = document.getElementById('email-error');
const passwordError = document.getElementById('password-error');

const iconEyeOpen = toggleBtn.querySelector('.icon-eye-open');
const iconEyeClosed = toggleBtn.querySelector('.icon-eye-closed');

/* =====================================================
   1. SHOW / HIDE PASSWORD
===================================================== */
toggleBtn.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    toggleBtn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
    iconEyeOpen.style.display = isHidden ? 'none' : 'block';
    iconEyeClosed.style.display = isHidden ? 'block' : 'none';
});

/* =====================================================
   2. VALIDATION HELPERS
===================================================== */
function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function setFieldError(group, errorEl, message) {
    if (message) {
        group.classList.add('has-error');
        errorEl.textContent = message;
    } else {
        group.classList.remove('has-error');
        errorEl.textContent = '';
    }
}

function clearOnInput(input, group, errorEl) {
    input.addEventListener('input', () => {
        if (group.classList.contains('has-error')) {
            setFieldError(group, errorEl, null);
        }
    });
}

clearOnInput(emailInput, emailGroup, emailError);
clearOnInput(passwordInput, passwordGroup, passwordError);

function validateForm() {
    let valid = true;

    const email = emailInput.value.trim();
    if (!email) {
        setFieldError(emailGroup, emailError, 'Email address is required.');
        valid = false;
    } else if (!isValidEmail(email)) {
        setFieldError(emailGroup, emailError, 'Please enter a valid email address.');
        valid = false;
    } else {
        setFieldError(emailGroup, emailError, null);
    }

    const pw = passwordInput.value;
    if (!pw) {
        setFieldError(passwordGroup, passwordError, 'Password is required.');
        valid = false;
    } else if (pw.length < 8) {
        setFieldError(passwordGroup, passwordError, 'Password must be at least 8 characters.');
        valid = false;
    } else {
        setFieldError(passwordGroup, passwordError, null);
    }

    return valid;
}

const API_BASE = '';

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validateForm()) {
        const firstError = loginForm.querySelector('.has-error .input-field');
        if (firstError) shakeElement(firstError);
        return;
    }

    setLoading(true);

    try {
        const resp = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: emailInput.value.trim(),
                password: passwordInput.value
            }),
        });

        const result = await resp.json();

        if (!resp.ok) {
            throw new Error(result.detail || 'Invalid email or password.');
        }

        // Store session via Auth helper if available, else localStorage
        if (window.Auth) {
            window.Auth.setSession(result.access_token, result.user);
        } else {
            localStorage.setItem('inbex-token', result.access_token);
            localStorage.setItem('inbex-user', JSON.stringify(result.user));
            localStorage.setItem('inbexAuth', 'true');
        }

        showToast('Signed in successfully!', 'success');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);

    } catch (err) {
        showToast(err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
        setLoading(false);
    }
});

function setLoading(on) {
    submitBtn.classList.toggle('loading', on);
    submitBtn.disabled = on;
    emailInput.disabled = on;
    passwordInput.disabled = on;
}

/* =====================================================
   4. GOOGLE SSO — Redirects to backend OAuth
===================================================== */
googleBtn.addEventListener('click', () => {
    showToast('Redirecting to Google…', 'info');
    window.location.href = `${API_BASE}/auth/google`;
});

/* =====================================================
   5. FORGOT PASSWORD STUB
===================================================== */
forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    showToast('Password reset link sent — check your inbox.', 'success');
});

/* =====================================================
   6. TOAST NOTIFICATION
===================================================== */
let toastTimeout = null;

function showToast(message, type = 'info', duration = 3600) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    if (toastTimeout) clearTimeout(toastTimeout);

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `<span class="toast-dot" aria-hidden="true"></span><span>${message}</span>`;
    document.body.appendChild(el);

    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));

    toastTimeout = setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 450);
    }, duration);
}

/* =====================================================
   7. SHAKE ANIMATION
===================================================== */
function shakeElement(el) {
    if (!el.animate) return;
    el.animate(
        [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-7px)' },
            { transform: 'translateX(7px)' },
            { transform: 'translateX(-4px)' },
            { transform: 'translateX(4px)' },
            { transform: 'translateX(0)' },
        ],
        { duration: 340, easing: 'ease-out' }
    );
}

/* =====================================================
   8. PREMIUM BLOB PARALLAX (Lerp + rAF)
===================================================== */
const premiumBlobs = document.querySelectorAll('.premium-blob');

let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let currentX = window.innerWidth / 2;
let currentY = window.innerHeight / 2;

document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

function animateBlobs() {
    // Smooth lerp (easing factor ~0.05 for natural motion)
    currentX += (mouseX - currentX) * 0.05;
    currentY += (mouseY - currentY) * 0.05;

    // Calculate displacement from center
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    // Normalize roughly -1 to 1 based on screen size
    const dx = (currentX - cx) / cx;
    const dy = (currentY - cy) / cy;

    premiumBlobs.forEach((blob, i) => {
        // Range of movement (e.g. 50px - 150px maximum displacement)
        const range = 60 + (i * 30);

        const moveX = dx * range;
        const moveY = dy * range;

        // Reverse dir for middle blob to add parallax depth
        const dir = i % 2 === 0 ? 1 : -0.6;

        blob.style.transform = `translate(${moveX * dir}px, ${moveY * dir}px)`;
    });

    requestAnimationFrame(animateBlobs);
}

// Start loop
animateBlobs();

/* =====================================================
   9. KEYBOARD FLOW — Enter on email → focus password
===================================================== */
emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); passwordInput.focus(); }
});
