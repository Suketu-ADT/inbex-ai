/**
 * INBEX - Automation page logic
 */
'use strict';

const API_BASE = '';
let automations = [];
let currentMode = 'recurring'; // 'recurring' or 'bulk'

document.addEventListener('DOMContentLoaded', () => {
    if (window.Auth) window.Auth.requireAuth();

    initTheme();
    initProfile();
    initTimezone();
    bindEvents();
    checkGmailStatus();
    loadAutomations();
    highlightCategoryFromQuery();
});

function initTheme() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;
    const savedTheme = localStorage.getItem('inbex-theme') || 'dark';
    htmlElement.setAttribute('data-theme', savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = htmlElement.getAttribute('data-theme');
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
            htmlElement.setAttribute('data-theme', nextTheme);
            localStorage.setItem('inbex-theme', nextTheme);
        });
    }
}

function initProfile() {
    const user = window.Auth ? window.Auth.getUser() : null;
    if (!user) return;

    const name = user.name || user.username || user.email || 'User';
    const avatar = document.getElementById('user-avatar');
    const welcomeTitle = document.querySelector('.welcome-title');

    if (avatar) {
        const encoded = encodeURIComponent(name);
        avatar.src = `https://ui-avatars.com/api/?name=${encoded}&background=6366f1&color=fff&rounded=true`;
        avatar.alt = name;
    }

    if (welcomeTitle) {
        welcomeTitle.textContent = `Automation Center`;
    }
}

function initTimezone() {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    document.getElementById('automation-timezone').value = timeZone;
    document.getElementById('automation-timezone-display').value = timeZone;
}

function bindEvents() {
    document.getElementById('automation-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('automation-reset-btn').addEventListener('click', resetForm);
    document.getElementById('open-automation-form-btn').addEventListener('click', () => {
        document.getElementById('automation-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('automation-name').focus();
    });

    // Tab switching
    document.getElementById('tab-recurring').addEventListener('click', () => setMode('recurring'));
    document.getElementById('tab-bulk').addEventListener('click', () => setMode('bulk'));
}

function setMode(mode) {
    currentMode = mode;
    const recurringBtn = document.getElementById('tab-recurring');
    const bulkBtn = document.getElementById('tab-bulk');
    const recurringFields = document.getElementById('recurring-only-fields');
    const submitBtn = document.getElementById('automation-submit-btn');
    const typeBadge = document.getElementById('automation-type-badge');
    const formTitle = document.getElementById('automation-form-title');

    if (mode === 'recurring') {
        recurringBtn.classList.add('active');
        bulkBtn.classList.remove('active');
        recurringFields.style.display = 'block';
        submitBtn.textContent = document.getElementById('automation-id').value ? 'Update Automation' : 'Save Automation';
        typeBadge.textContent = 'Daily';
        formTitle.textContent = document.getElementById('automation-id').value ? 'Edit Daily Email' : 'Create Daily Email';
        
        // Ensure inputs are required
        document.getElementById('automation-time').required = true;
    } else {
        bulkBtn.classList.add('active');
        recurringBtn.classList.remove('active');
        recurringFields.style.display = 'none';
        submitBtn.textContent = 'Send Bulk Broadcast Now';
        typeBadge.textContent = 'Bulk';
        formTitle.textContent = 'Send Bulk Broadcast';
        
        // Time is not required for bulk
        document.getElementById('automation-time').required = false;
    }
}

async function handleFormSubmit(event) {
    event.preventDefault();
    if (currentMode === 'recurring') {
        await saveAutomation();
    } else {
        await sendBulkBroadcast();
    }
}

async function checkGmailStatus() {
    const pill = document.getElementById('gmail-status-pill');

    try {
        const response = await fetch(`${API_BASE}/gmail/status`, {
            headers: window.Auth.getHeaders(),
        });

        if (!response.ok) throw new Error('Failed to load Gmail status');

        const data = await response.json();
        if (data.connected) {
            pill.className = 'badge badge-success';
            pill.style.background = 'rgba(16, 185, 129, 0.15)';
            pill.style.color = '#10b981';
            pill.textContent = `Gmail Connected: ${data.email}`;
        } else {
            pill.className = 'badge badge-warn';
            pill.style.background = 'rgba(245, 158, 11, 0.15)';
            pill.style.color = '#f59e0b';
            pill.textContent = 'Connect Gmail before sending scheduled emails';
        }
    } catch (_err) {
        pill.className = 'badge badge-muted';
        pill.textContent = 'Unable to verify Gmail connection';
    }
}

async function loadAutomations() {
    const tbody = document.getElementById('automation-table-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:28px;">Loading automations...</td></tr>';

    try {
        const response = await fetch(`${API_BASE}/automations`, {
            headers: window.Auth.getHeaders(),
        });

        if (response.status === 401) {
            window.Auth.clearSession();
            window.location.href = 'index.html';
            return;
        }

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to load automations');
        }

        automations = await response.json();
        renderAutomations();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#f87171;padding:28px;">${escapeHtml(err.message)}</td></tr>`;
        document.getElementById('automation-cards').innerHTML = '';
        showToastAuto(err.message, 'error');
    }
}

function renderAutomations() {
    renderAutomationTable();
    renderAutomationCards();
}

function renderAutomationTable() {
    const tbody = document.getElementById('automation-table-body');

    if (!automations.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:28px;">No automations created yet.</td></tr>';
        return;
    }

    tbody.innerHTML = automations.map((automation) => {
        const status = getStatusMeta(automation);
        const nextRun = automation.next_run_at ? formatDateTime(automation.next_run_at, automation.timezone) : 'Paused';

        return `
            <tr>
                <td>${escapeHtml(automation.name)}</td>
                <td>${escapeHtml(automation.recipient_email)}</td>
                <td>${escapeHtml(formatTime(automation.send_time, automation.timezone))}</td>
                <td>${escapeHtml(nextRun)}</td>
                <td><span class="badge" style="${status.style}">${escapeHtml(status.label)}</span></td>
                <td>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-outline small" onclick="editAutomation('${automation.id}')">Edit</button>
                        <button class="btn btn-outline small" onclick="runAutomation('${automation.id}')">Run Now</button>
                        <button class="btn btn-outline small" onclick="toggleAutomation('${automation.id}')">${automation.is_active ? 'Pause' : 'Activate'}</button>
                        <button class="btn btn-outline small" onclick="deleteAutomation('${automation.id}')" style="border-color:rgba(248,113,113,0.4);color:#f87171;">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderAutomationCards() {
    const cards = document.getElementById('automation-cards');

    if (!automations.length) {
        cards.innerHTML = `
            <article class="workflow-card">
                <div class="workflow-details">
                    <p style="color:var(--text-muted);">Create an automation to see the email content, recent run status, and schedule details here.</p>
                </div>
            </article>
        `;
        return;
    }

    cards.innerHTML = automations.map((automation) => {
        const status = getStatusMeta(automation);
        return `
            <article class="workflow-card">
                <div class="workflow-header">
                    <div style="display:flex;align-items:center;gap:var(--sp-2);flex-wrap:wrap;">
                        <span class="badge badge-ai">Daily Email</span>
                        <h3 class="workflow-title" style="margin:0;">${escapeHtml(automation.name)}</h3>
                    </div>
                    <span class="badge" style="${status.style}">${escapeHtml(status.label)}</span>
                </div>
                <div class="workflow-details">
                    <p><strong>To</strong> ${escapeHtml(automation.recipient_email)}</p>
                    <p><strong>Subject</strong> ${escapeHtml(automation.subject)}</p>
                    <p><strong>Schedule</strong> Every day at ${escapeHtml(formatTime(automation.send_time, automation.timezone))}</p>
                    <p><strong>Timezone</strong> ${escapeHtml(automation.timezone)}</p>
                    <p><strong>Runs</strong> ${escapeHtml(String(automation.run_count || 0))}</p>
                    <p><strong>Last success</strong> ${escapeHtml(automation.last_run_at ? formatDateTime(automation.last_run_at, automation.timezone) : 'Not sent yet')}</p>
                    <p><strong>Last error</strong> ${escapeHtml(automation.last_error || 'None')}</p>
                </div>
                <div class="draft-box">
                    <p style="white-space:pre-wrap;">${escapeHtml(automation.body)}</p>
                </div>
            </article>
        `;
    }).join('');
}

async function saveAutomation() {
    const id = document.getElementById('automation-id').value;
    const payload = {
        name: document.getElementById('automation-name').value.trim(),
        recipient_email: document.getElementById('automation-recipient').value.trim(),
        subject: document.getElementById('automation-subject').value.trim(),
        body: document.getElementById('automation-body').value.trim(),
        send_time: document.getElementById('automation-time').value,
        timezone: document.getElementById('automation-timezone').value,
        is_active: document.getElementById('automation-active').checked,
    };

    const submitBtn = document.getElementById('automation-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = id ? 'Saving...' : 'Creating...';

    try {
        const response = await fetch(`${API_BASE}/automations${id ? `/${id}` : ''}`, {
            method: id ? 'PUT' : 'POST',
            headers: window.Auth.getHeaders(),
            body: JSON.stringify(payload),
        });

        const data = response.status === 204 ? null : await response.json();
        if (!response.ok) throw new Error(data?.detail || 'Failed to save automation');

        showToastAuto(id ? 'Automation updated' : 'Automation created', 'success');
        resetForm();
        await loadAutomations();
    } catch (err) {
        showToastAuto(err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = document.getElementById('automation-id').value ? 'Update Automation' : 'Save Automation';
    }
}

async function sendBulkBroadcast() {
    const payload = {
        name: document.getElementById('automation-name').value.trim(),
        recipient_emails: document.getElementById('automation-recipient').value.trim(),
        subject: document.getElementById('automation-subject').value.trim(),
        body: document.getElementById('automation-body').value.trim(),
    };

    const submitBtn = document.getElementById('automation-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending Bulk...';

    try {
        const response = await fetch(`${API_BASE}/automations/bulk`, {
            method: 'POST',
            headers: window.Auth.getHeaders(),
            body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data?.detail || 'Failed to send bulk broadcast');

        showToastAuto(`Broadcast complete! Sent: ${data.success_count}, Failed: ${data.fail_count}`, 'success');
        resetForm();
    } catch (err) {
        showToastAuto(err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Bulk Broadcast Now';
    }
}

function editAutomation(id) {
    const automation = automations.find((item) => item.id === id);
    if (!automation) return;

    setMode('recurring');

    document.getElementById('automation-id').value = automation.id;
    document.getElementById('automation-name').value = automation.name;
    document.getElementById('automation-recipient').value = automation.recipient_email;
    document.getElementById('automation-subject').value = automation.subject;
    document.getElementById('automation-body').value = automation.body;
    document.getElementById('automation-time').value = automation.send_time;
    document.getElementById('automation-timezone').value = automation.timezone;
    document.getElementById('automation-timezone-display').value = automation.timezone;
    document.getElementById('automation-active').checked = automation.is_active;
    document.getElementById('automation-form-title').textContent = 'Edit Daily Email';
    document.getElementById('automation-submit-btn').textContent = 'Update Automation';

    document.getElementById('automation-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
    document.getElementById('automation-form').reset();
    document.getElementById('automation-id').value = '';
    document.getElementById('automation-form-title').textContent = 'Create Daily Email';
    document.getElementById('automation-submit-btn').textContent = 'Save Automation';
    document.getElementById('automation-active').checked = true;
    initTimezone();
}

async function toggleAutomation(id) {
    try {
        const response = await fetch(`${API_BASE}/automations/${id}/toggle`, {
            method: 'POST',
            headers: window.Auth.getHeaders(),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Failed to update automation');

        showToastAuto(data.is_active ? 'Automation activated' : 'Automation paused', 'success');
        await loadAutomations();
    } catch (err) {
        showToastAuto(err.message, 'error');
    }
}

async function runAutomation(id) {
    try {
        const response = await fetch(`${API_BASE}/automations/${id}/run`, {
            method: 'POST',
            headers: window.Auth.getHeaders(),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Failed to run automation');

        showToastAuto('Email sent successfully', 'success');
        await loadAutomations();
    } catch (err) {
        showToastAuto(err.message, 'error');
    }
}

async function deleteAutomation(id) {
    const automation = automations.find((item) => item.id === id);
    if (!automation) return;

    const confirmed = window.confirm(`Delete automation "${automation.name}"?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/automations/${id}`, {
            method: 'DELETE',
            headers: window.Auth.getHeaders(),
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to delete automation');
        }

        showToastAuto('Automation deleted', 'success');
        resetForm();
        await loadAutomations();
    } catch (err) {
        showToastAuto(err.message, 'error');
    }
}

function getStatusMeta(automation) {
    if (!automation.is_active) {
        return {
            label: 'Paused',
            style: 'background:rgba(100,116,139,0.15);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);',
        };
    }

    if (automation.last_error) {
        return {
            label: 'Error',
            style: 'background:rgba(248,113,113,0.15);color:#f87171;border:1px solid rgba(248,113,113,0.2);',
        };
    }

    return {
        label: 'Active',
        style: 'background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.2);',
    };
}

function formatTime(time24, timeZone) {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    const minuteStr = String(minutes).padStart(2, '0');
    return `${hour12}:${minuteStr} ${period}`;
}

function formatDateTime(isoString, timeZone) {
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone,
    }).format(new Date(isoString));
}

function highlightCategoryFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const category = params.get('category');
    if (category) {
        showToastAuto(`Create any daily automation you want for ${category} emails`, 'success');
    }
}

function showToastAuto(message, type = 'success') {
    const toast = document.getElementById('auto-toast');
    toast.textContent = message;
    toast.style.borderLeftColor = type === 'error' ? '#f87171' : '#10b981';
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    toast.style.pointerEvents = 'auto';

    clearTimeout(window._autoToastTimer);
    window._autoToastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.pointerEvents = 'none';
    }, 3000);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.editAutomation = editAutomation;
window.toggleAutomation = toggleAutomation;
window.runAutomation = runAutomation;
window.deleteAutomation = deleteAutomation;
