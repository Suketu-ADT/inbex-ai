/**
 * INBEX — Sign Up Page Script
 * Handles: password visibility toggles, strength meter,
 *          confirm password match, form validation,
 *          loading state, toast notifications, blob parallax
 */

'use strict';

/* =====================================================
   DOM References
===================================================== */
if (window.Auth && window.Auth.isAuthenticated()) {
    window.location.href = 'dashboard.html';
}

const signupForm = document.getElementById('signup-form');
const nameInput = document.getElementById('full-name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm-password');

const nameGroup = document.getElementById('name-group');
const emailGroup = document.getElementById('email-group');
const passwordGroup = document.getElementById('password-group');
const confirmGroup = document.getElementById('confirm-group');

const nameError = document.getElementById('name-error');
const emailError = document.getElementById('email-error');
const passwordError = document.getElementById('password-error');
const confirmError = document.getElementById('confirm-error');

const strengthWrap = document.getElementById('strength-wrap');
const strengthBars = document.getElementById('strength-bars');
const strengthLabel = document.getElementById('password-strength-label');

const togglePw = document.getElementById('toggle-password');
const toggleCfm = document.getElementById('toggle-confirm');
const submitBtn = document.getElementById('submit-btn');
const googleBtn = document.getElementById('google-btn');

/* =====================================================
   1. SHOW / HIDE PASSWORD TOGGLES
===================================================== */
function setupToggle(btn, input) {
    const eyeOpen = btn.querySelector('.icon-eye-open');
    const eyeClosed = btn.querySelector('.icon-eye-closed');

    btn.addEventListener('click', () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        btn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
        eyeOpen.style.display = isHidden ? 'none' : 'block';
        eyeClosed.style.display = isHidden ? 'block' : 'none';
    });
}

setupToggle(togglePw, passwordInput);
setupToggle(toggleCfm, confirmInput);

/* =====================================================
   2. PASSWORD STRENGTH METER
===================================================== */
const strengthMeta = [
    { level: 0, label: '' },
    { level: 1, label: 'Too weak' },
    { level: 2, label: 'Could be stronger' },
    { level: 3, label: 'Good password' },
    { level: 4, label: 'Strong password' },
];

/**
 * Calculates password strength on a scale of 0–4.
 * @param {string} pw
 * @returns {number}
 */
function calcStrength(pw) {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw) || /\d/.test(pw)) score++;
    return Math.min(score, 4);
}

passwordInput.addEventListener('input', () => {
    const pw = passwordInput.value;

    // Show/hide the meter
    if (pw.length > 0) {
        strengthWrap.hidden = false;
    } else {
        strengthWrap.hidden = true;
        return;
    }

    const level = calcStrength(pw);
    strengthBars.setAttribute('data-level', level);
    strengthLabel.textContent = strengthMeta[level].label;

    // Clear error while typing
    if (passwordGroup.classList.contains('has-error')) {
        setFieldError(passwordGroup, passwordError, null);
    }
    // Recheck confirm match if already touched
    if (confirmInput.value && confirmGroup.classList.contains('has-error')) {
        if (pw === confirmInput.value) setFieldError(confirmGroup, confirmError, null);
    }
});

/* =====================================================
   3. FIELD ERROR HELPERS
===================================================== */
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

clearOnInput(nameInput, nameGroup, nameError);
clearOnInput(emailInput, emailGroup, emailError);
clearOnInput(confirmInput, confirmGroup, confirmError);

/* =====================================================
   4. FORM VALIDATION
===================================================== */
function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function validateForm() {
    let valid = true;

    // Full Name
    const name = nameInput.value.trim();
    if (!name) {
        setFieldError(nameGroup, nameError, 'Your name is required.');
        valid = false;
    } else if (name.length < 2) {
        setFieldError(nameGroup, nameError, 'Name must be at least 2 characters.');
        valid = false;
    } else {
        setFieldError(nameGroup, nameError, null);
    }

    // Email
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

    // Password
    const pw = passwordInput.value;
    if (!pw) {
        setFieldError(passwordGroup, passwordError, 'Please create a password.');
        valid = false;
    } else if (pw.length < 8) {
        setFieldError(passwordGroup, passwordError, 'Password must be at least 8 characters.');
        valid = false;
    } else if (calcStrength(pw) < 2) {
        setFieldError(passwordGroup, passwordError, 'Password is too weak. Add numbers or symbols.');
        valid = false;
    } else {
        setFieldError(passwordGroup, passwordError, null);
    }

    // Confirm Password
    const cfm = confirmInput.value;
    if (!cfm) {
        setFieldError(confirmGroup, confirmError, 'Please confirm your password.');
        valid = false;
    } else if (cfm !== pw) {
        setFieldError(confirmGroup, confirmError, 'Passwords don\'t match.');
        valid = false;
    } else {
        setFieldError(confirmGroup, confirmError, null);
    }

    return valid;
}

/* =====================================================
   5. FORM SUBMISSION
===================================================== */
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validateForm()) {
        const firstError = signupForm.querySelector('.has-error .input-field');
        if (firstError) {
            shakeElement(firstError);
            firstError.focus({ preventScroll: false });
        }
        return;
    }

    setLoading(true);

    try {
        await signupViaAPI({
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            password: passwordInput.value,
        });

        showToast('Account created! Redirecting…', 'success');

        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 800);

    } catch (err) {
        showToast(err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
        setLoading(false);
    }
});

/**
 * Real async signup — calls the FastAPI backend.
 * @param {{ name: string, email: string, password: string }} data
 */
async function signupViaAPI(data) {
    const response = await fetch('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.detail || 'Signup failed. Please try again.');
    }

    // Save token and user data using Auth helper (assuming auth.js is loaded)
    if (window.Auth) {
        window.Auth.setSession(result.access_token, result.user);
    } else {
        localStorage.setItem('inbex-token', result.access_token);
        localStorage.setItem('inbex-user', JSON.stringify(result.user));
        localStorage.setItem('inbexAuth', 'true');
    }
}

function setLoading(on) {
    submitBtn.classList.toggle('loading', on);
    submitBtn.disabled = on;
    nameInput.disabled = on;
    emailInput.disabled = on;
    passwordInput.disabled = on;
    confirmInput.disabled = on;
}

/* =====================================================
   6. GOOGLE SSO STUB
===================================================== */
googleBtn.addEventListener('click', () => {
    showToast('Redirecting to Google…', 'info');
    window.location.href = '/auth/google';
});

/* =====================================================
   7. TOAST
===================================================== */
let toastTimeout = null;

function showToast(message, type = 'info', duration = 3800) {
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
   8. SHAKE ANIMATION
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
   9. PREMIUM BLOB PARALLAX (Lerp + rAF)
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
   10. KEYBOARD FLOW — Enter advances fields
===================================================== */
const fields = [nameInput, emailInput, passwordInput, confirmInput];
fields.forEach((field, i) => {
    field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && i < fields.length - 1) {
            e.preventDefault();
            fields[i + 1].focus();
        }
    });
});
