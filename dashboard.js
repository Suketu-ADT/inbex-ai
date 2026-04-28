/**
 * INBEX — Dashboard Script
 * Handles: Theme toggling, Gmail integration, real email loading, stats
 */
'use strict';

const API_BASE = '';

document.addEventListener('DOMContentLoaded', () => {
    if (window.Auth) window.Auth.requireAuth();

    // --- Theme System ---
    const themeToggleBtn = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;
    const savedTheme = localStorage.getItem('inbex-theme') || 'dark';
    htmlElement.setAttribute('data-theme', savedTheme);

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('inbex-theme', newTheme);
    });

    // --- Tab Filtering ---
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const category = tab.textContent.trim();
            filterEmails(category);
        });
    });

    // --- Load Data ---
    loadDashboardStats();
    checkGmailStatus();
    loadUserProfile();
    loadAutomationTasks();
});

// ── Category colors ──
const CAT_COLORS = {
    HR: '#c084fc', Work: '#60a5fa', Finance: '#34d399',
    Personal: '#fbbf24', Spam: '#f87171'
};

const CAT_BADGES = {
    HR: 'badge-hr', Work: 'badge-work', Finance: 'badge-finance',
    Personal: 'badge-personal', Spam: 'badge-spam'
};

// Store fetched emails for filtering
let allGmailEmails = [];
let currentPageToken = null;
let pageHistory = [null]; // stack of pageTokens for "Prev"
let currentPageIndex = 0;

const URGENT_KEYWORDS = ['urgent', 'important', 'asap', 'deadline', 'critical', 'action required', 'immediately', 'priority', 'time sensitive'];

function loadInbexPrefs() {
    const defaults = { autoSend: false, financeApproval: true, urgencyThreshold: '90', emailDigest: true, inappNotif: true };
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('inbex-prefs')) }; }
    catch { return { ...defaults }; }
}

function isUrgentEmail(email) {
    const text = `${email.subject || ''} ${email.snippet || ''} ${email.body || ''}`.toLowerCase();
    const hasKeyword = URGENT_KEYWORDS.some(kw => text.includes(kw));
    if (hasKeyword) return true;

    // Also flag as urgent if confidence exceeds the user's urgency threshold
    const prefs = loadInbexPrefs();
    const threshold = parseInt(prefs.urgencyThreshold, 10) / 100;
    if (email.confidence >= threshold && email.category === 'Work') return true;

    return false;
}

// ── Dashboard Stats ──
async function loadDashboardStats() {
    if (!window.Auth || !window.Auth.isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/dashboard/stats`, {
            headers: window.Auth.getHeaders()
        });

        if (response.status === 401) {
            window.Auth.clearSession();
            window.location.href = 'index.html';
            return;
        }

        if (response.ok) {
            const data = await response.json();
            
            const userNameEl = document.querySelector('.welcome-title');
            if (userNameEl && data.user_name) {
                const firstName = data.user_name.split(' ')[0];
                userNameEl.textContent = `Welcome back, ${firstName}`;
            }

            updateStatValue('stat-total', data.total_emails_processed);
            updateStatValue('stat-urgent', data.urgent_emails);
            updateStatValue('stat-automated', data.automated_today);
            updateStatValue('stat-pending', data.pending_decisions);
        }
    } catch (error) {
        console.error('Failed to load dashboard stats:', error);
    }
}

function updateStatValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = (value || 0).toLocaleString();
}

// ── Gmail Integration ──
async function checkGmailStatus() {
    if (!window.Auth || !window.Auth.isAuthenticated()) return;

    try {
        const resp = await fetch(`${API_BASE}/gmail/status`, {
            headers: window.Auth.getHeaders()
        });

        if (resp.ok) {
            const data = await resp.json();
            const connectBtn = document.getElementById('gmail-connect-btn');
            const disconnectBtn = document.getElementById('gmail-disconnect-btn');
            const statusBadge = document.getElementById('gmail-status-badge');

            if (data.connected) {
                if (connectBtn) connectBtn.style.display = 'none';
                if (disconnectBtn) {
                    disconnectBtn.style.display = 'inline-flex';
                    disconnectBtn.title = `Connected: ${data.email}`;
                }
                if (statusBadge) {
                    statusBadge.textContent = `✅ ${data.email}`;
                    statusBadge.style.display = 'inline-flex';
                }
                loadGmailEmails();
            } else {
                if (connectBtn) connectBtn.style.display = 'inline-flex';
                if (disconnectBtn) disconnectBtn.style.display = 'none';
                if (statusBadge) statusBadge.style.display = 'none';
            }
        }
    } catch (err) {
        console.error('Gmail status check failed:', err);
    }
}

async function connectGmail() {
    try {
        const resp = await fetch(`${API_BASE}/gmail/connect`, {
            headers: window.Auth.getHeaders()
        });
        if (resp.ok) {
            const data = await resp.json();
            window.location.href = data.auth_url;
        }
    } catch (err) {
        console.error('Gmail connect error:', err);
    }
}

async function disconnectGmail() {
    try {
        await fetch(`${API_BASE}/gmail/disconnect`, {
            method: 'POST',
            headers: window.Auth.getHeaders()
        });
        window.location.reload();
    } catch (err) {
        console.error('Gmail disconnect error:', err);
    }
}

async function loadGmailEmails(pageToken = null) {
    const emailList = document.getElementById('email-list');
    if (!emailList) return;

    // Show loading
    emailList.innerHTML = `
        <div class="email-loading" style="text-align:center;padding:40px;color:var(--text-muted);">
            <div class="loading-spinner" style="width:32px;height:32px;border:3px solid rgba(99,102,241,0.2);border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>
            <p>Fetching emails from Gmail...</p>
        </div>`;

    try {
        let url = `${API_BASE}/gmail/emails?max=25`;
        if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

        const resp = await fetch(url, {
            headers: window.Auth.getHeaders()
        });

        if (!resp.ok) {
            const err = await resp.json();
            emailList.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);"><p>${err.detail || 'Failed to load emails'}</p></div>`;
            return;
        }

        const data = await resp.json();
        const emails = data.emails || data; // support both old and new format
        currentPageToken = data.nextPageToken || null;
        allGmailEmails = emails;

        // Tag urgent emails
        allGmailEmails.forEach(e => { e._isUrgent = isUrgentEmail(e); });

        // Update urgent stat with actual count
        const urgentCount = allGmailEmails.filter(e => e._isUrgent).length;
        updateStatValue('stat-urgent', urgentCount);

        renderEmails(emails);
        renderPagination();
    } catch (err) {
        console.error('Gmail fetch error:', err);
        emailList.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);"><p>Failed to connect to server</p></div>`;
    }
}

function renderPagination() {
    // Remove old pagination
    const old = document.getElementById('email-pagination');
    if (old) old.remove();

    const panel = document.querySelector('.priority-inbox-panel');
    if (!panel) return;

    const hasPrev = currentPageIndex > 0;
    const hasNext = !!currentPageToken;
    if (!hasPrev && !hasNext) return;

    const pag = document.createElement('div');
    pag.id = 'email-pagination';
    pag.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:12px;padding:12px 20px;border-top:1px solid var(--border-color);';

    pag.innerHTML = `
        <button class="btn btn-outline small" onclick="prevEmailPage()" ${hasPrev ? '' : 'disabled'} style="font-size:0.8rem;padding:6px 16px;${hasPrev ? '' : 'opacity:0.4;cursor:not-allowed;'}">
            ← Previous
        </button>
        <span style="font-size:0.78rem;color:var(--text-muted);">Page ${currentPageIndex + 1}</span>
        <button class="btn btn-outline small" onclick="nextEmailPage()" ${hasNext ? '' : 'disabled'} style="font-size:0.8rem;padding:6px 16px;${hasNext ? '' : 'opacity:0.4;cursor:not-allowed;'}">
            Next →
        </button>
    `;
    panel.appendChild(pag);
}

function nextEmailPage() {
    if (!currentPageToken) return;
    currentPageIndex++;
    if (pageHistory.length <= currentPageIndex) {
        pageHistory.push(currentPageToken);
    }
    loadGmailEmails(currentPageToken);
}

function prevEmailPage() {
    if (currentPageIndex <= 0) return;
    currentPageIndex--;
    const token = pageHistory[currentPageIndex] || null;
    loadGmailEmails(token);
}

function renderEmails(emails) {
    const emailList = document.getElementById('email-list');
    if (!emailList) return;

    if (emails.length === 0) {
        emailList.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);"><p>No emails found</p></div>`;
        return;
    }

    // Also populate AI email selector
    populateAiSelector(emails);

    emailList.innerHTML = emails.map(email => {
        const fromStr = email.from || 'Unknown';
        const senderMatch = fromStr.match(/^(.+?)\s*</) || [, fromStr];
        const senderName = senderMatch[1].replace(/"/g, '').trim();
        const dateStr = formatDate(email.date);
        const catColor = CAT_COLORS[email.category] || '#60a5fa';
        const confidencePct = Math.round((email.confidence || 0) * 100);

        return `
            <div class="email-item ${email.isUnread ? 'unread' : ''}" data-category="${email.category}" data-gmail-id="${escapeHtml(String(email.id))}" style="cursor:pointer;">
                <div class="email-meta">
                    <span class="sender-name">${escapeHtml(senderName)}</span>
                    <span class="timestamp">${dateStr}</span>
                </div>
                <h4 class="email-subject">${escapeHtml(email.subject || '(No Subject)')}</h4>
                <p class="email-preview">${escapeHtml(email.snippet || '')}</p>
                <div class="email-footer">
                    <span class="badge" style="background:${catColor}20;color:${catColor};border:1px solid ${catColor}33;">${email.category}</span>
                    <span class="badge badge-ai" style="font-size:0.7rem;">🎯 ${confidencePct}%</span>
                    ${email.isUnread ? '<span class="badge badge-urgent" style="font-size:0.7rem;">Unread</span>' : ''}
                    ${email._isUrgent ? '<span class="badge" style="background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.25);font-size:0.7rem;">🔴 Urgent</span>' : ''}
                    ${email.calendar_event ? `<a href="${email.calendar_event.htmlLink}" target="_blank" class="badge" style="background:rgba(52,211,153,0.12);color:#34d399;border:1px solid rgba(52,211,153,0.25);font-size:0.7rem;text-decoration:none;" title="Added to Calendar" onclick="event.stopPropagation()">📅 Calendar</a>` : ''}
                </div>
            </div>`;
    }).join('');
}

// Event delegation for email item clicks
document.addEventListener('click', (e) => {
    const emailItem = e.target.closest('.email-item[data-gmail-id]');
    if (!emailItem) return;
    // Don't open modal if a link/button inside was clicked
    if (e.target.closest('a') || e.target.closest('button')) return;
    const gmailId = emailItem.getAttribute('data-gmail-id');
    if (gmailId) openEmailModal(gmailId);
});

function filterEmails(category) {
    // Reset urgent card highlight
    const urgentCard = document.getElementById('stat-card-urgent');
    if (urgentCard) urgentCard.style.outline = '';

    if (category === 'All') {
        renderEmails(allGmailEmails);
    } else {
        renderEmails(allGmailEmails.filter(e => e.category === category));
    }
}

function filterUrgentEmails() {
    const urgent = allGmailEmails.filter(e => e._isUrgent);
    if (urgent.length === 0) {
        alert('No urgent emails found on this page.');
        return;
    }
    renderEmails(urgent);

    // Highlight the urgent card
    const urgentCard = document.getElementById('stat-card-urgent');
    if (urgentCard) urgentCard.style.outline = '2px solid var(--clr-danger)';

    // Reset filter tabs
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.classList.remove('active'));

    addDecisionLog(`Filtered ${urgent.length} urgent emails`);
}

function loadUserProfile() {
    const user = window.Auth ? window.Auth.getUser() : null;
    if (!user) return;

    const name = user.name || user.username || user.email || 'User';
    const avatar = document.getElementById('user-avatar');
    if (avatar) {
        const encoded = encodeURIComponent(name);
        avatar.src = `https://ui-avatars.com/api/?name=${encoded}&background=6366f1&color=fff&rounded=true`;
        avatar.alt = name;
    }

    const welcomeTitle = document.querySelector('.welcome-title');
    if (welcomeTitle) {
        const firstName = name.split(' ')[0];
        welcomeTitle.textContent = `Welcome back, ${firstName}`;
    }

    // Populate dropdown
    const dropName = document.getElementById('dropdown-name');
    const dropEmail = document.getElementById('dropdown-email');
    if (dropName) dropName.textContent = name;
    if (dropEmail) dropEmail.textContent = user.email || '';
}

function toggleProfileMenu() {
    const dd = document.getElementById('profile-dropdown');
    if (!dd) return;
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function signOutFromDashboard() {
    if (window.Auth) window.Auth.clearSession();
    window.location.href = 'index.html';
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dd = document.getElementById('profile-dropdown');
    const avatar = document.getElementById('user-avatar');
    if (dd && dd.style.display !== 'none' && !dd.contains(e.target) && e.target !== avatar) {
        dd.style.display = 'none';
    }
});

// ── Email Detail Modal ──
let currentModalEmail = null;

function openEmailModal(gmailId) {
    const email = allGmailEmails.find(e => String(e.id) === String(gmailId));
    if (!email) {
        console.warn('[Modal] Email not found for id:', gmailId);
        return;
    }
    currentModalEmail = email;

    const catColor = CAT_COLORS[email.category] || '#60a5fa';
    const fromStr = email.from || 'Unknown';
    const senderMatch = fromStr.match(/^(.+?)\s*<(.+?)>/) || [, fromStr, ''];

    document.getElementById('modal-subject').textContent = email.subject || '(No Subject)';
    document.getElementById('modal-from').textContent = senderMatch[1].replace(/"/g, '').trim();
    document.getElementById('modal-to').textContent = email.to ? ` → ${email.to}` : '';
    document.getElementById('modal-date').textContent = email.date || '';
    document.getElementById('modal-body').textContent = email.body || email.snippet || '';
    document.getElementById('modal-confidence').textContent = `🎯 ${Math.round(email.confidence * 100)}% confidence`;

    const badge = document.getElementById('modal-category-badge');
    badge.textContent = email.category;
    badge.style.cssText = `font-size:0.78rem;background:${catColor}20;color:${catColor};border:1px solid ${catColor}33;`;

    document.getElementById('email-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Generate AI Summary (Flashcard)
    generateAiSummary(email);
}

async function generateAiSummary(email) {
    const section = document.getElementById('modal-summary-section');
    const content = document.getElementById('modal-summary-content');
    if (!section || !content) return;

    section.style.display = 'block';
    content.textContent = 'Generating AI Flashcard...';

    try {
        const resp = await fetch(`${API_BASE}/generate-summary`, {
            method: 'POST',
            headers: window.Auth.getHeaders(),
            body: JSON.stringify({ text: email.body || email.snippet })
        });

        if (resp.ok) {
            const data = await resp.json();
            content.textContent = data.summary;
        } else {
            content.textContent = 'Summary unavailable for this email.';
        }
    } catch (err) {
        content.textContent = 'Connection error. Could not summarize.';
    }
}

function closeEmailModal() {
    document.getElementById('email-modal').style.display = 'none';
    const summarySection = document.getElementById('modal-summary-section');
    if (summarySection) summarySection.style.display = 'none';
    document.body.style.overflow = '';
    currentModalEmail = null;
}

function replyFromModal() {
    if (!currentModalEmail) return;
    // Select this email in the AI assistant selector and generate reply
    const select = document.getElementById('ai-email-select');
    select.value = currentModalEmail.id;
    onEmailSelected();
    closeEmailModal();
    // Scroll to AI panel
    document.querySelector('.ai-assistant-panel').scrollIntoView({ behavior: 'smooth' });
}

// Close modal on Escape key or backdrop click
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEmailModal(); });
document.addEventListener('click', (e) => {
    if (e.target.id === 'email-modal') closeEmailModal();
});

// ── AI Assistant — Email Selector + Reply Generation ──
let selectedAiEmail = null;

function populateAiSelector(emails) {
    const select = document.getElementById('ai-email-select');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">— Select an email to reply —</option>';
    emails.forEach(email => {
        const senderMatch = email.from.match(/^(.+?)\s*</) || [, email.from];
        const senderName = senderMatch[1].replace(/"/g, '').trim();
        const opt = document.createElement('option');
        opt.value = email.id;
        opt.textContent = `${senderName} — ${(email.subject || '(No Subject)').substring(0, 50)}`;
        select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
}

function onEmailSelected() {
    const select = document.getElementById('ai-email-select');
    const emailId = select.value;

    if (!emailId) {
        document.getElementById('ai-draft-section').style.display = 'none';
        document.getElementById('ai-idle-state').style.display = 'block';
        selectedAiEmail = null;
        return;
    }

    selectedAiEmail = allGmailEmails.find(e => e.id === emailId);
    if (!selectedAiEmail) return;

    document.getElementById('ai-idle-state').style.display = 'none';
    document.getElementById('ai-draft-section').style.display = 'block';

    const senderMatch = selectedAiEmail.from.match(/^(.+?)\s*</) || [, selectedAiEmail.from];
    document.getElementById('ai-reply-label').textContent = `Reply to: ${senderMatch[1].replace(/"/g, '').trim()}`;

    generateAiReply();
}

async function generateAiReply() {
    if (!selectedAiEmail) return;

    const textarea = document.getElementById('ai-reply-text');
    const sourceLabel = document.getElementById('ai-source-label');
    const confRow = document.getElementById('ai-confidence-row');
    const sendBtn = document.getElementById('ai-send-btn');
    const regenBtn = document.getElementById('ai-regen-btn');

    textarea.value = 'Generating AI reply...';
    textarea.disabled = true;
    sendBtn.disabled = true;
    regenBtn.disabled = true;
    confRow.style.display = 'none';

    addDecisionLog(`Generating reply for "${selectedAiEmail.subject?.substring(0, 30)}..."`);

    try {
        const resp = await fetch(`${API_BASE}/generate-reply`, {
            method: 'POST',
            headers: window.Auth.getHeaders(),
            body: JSON.stringify({
                email_text: `Subject: ${selectedAiEmail.subject}\nFrom: ${selectedAiEmail.from}\n\n${selectedAiEmail.body}`,
                category: selectedAiEmail.category,
            }),
        });

        if (resp.ok) {
            const data = await resp.json();
            textarea.value = data.reply;
            sourceLabel.textContent = data.source === 'ai' ? '✨ AI Generated via Groq' : '📋 Template-based reply';
            confRow.style.display = 'flex';
            addDecisionLog(`AI draft ready for ${selectedAiEmail.from.match(/^(.+?)\s*</)?.[1] || selectedAiEmail.from}`);
        } else {
            textarea.value = 'Failed to generate reply. Try again.';
        }
    } catch (err) {
        textarea.value = 'Error connecting to server. Is the backend running?';
        console.error('AI reply error:', err);
    }

    textarea.disabled = false;
    sendBtn.disabled = false;
    regenBtn.disabled = false;
}

async function sendAiReply() {
    if (!selectedAiEmail) return;

    const textarea = document.getElementById('ai-reply-text');
    const replyText = textarea.value.trim();
    if (!replyText) return;

    const sendBtn = document.getElementById('ai-send-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    // Extract sender email from "Name <email>" format
    const emailMatch = selectedAiEmail.from.match(/<(.+?)>/) || [, selectedAiEmail.from];
    const toEmail = emailMatch[1].trim();
    const subject = selectedAiEmail.subject?.startsWith('Re:') ? selectedAiEmail.subject : `Re: ${selectedAiEmail.subject || ''}`;

    try {
        const resp = await fetch(`${API_BASE}/gmail/send`, {
            method: 'POST',
            headers: window.Auth.getHeaders(),
            body: JSON.stringify({
                to: toEmail,
                subject: subject,
                body: replyText,
                thread_id: selectedAiEmail.threadId || undefined,
            }),
        });

        if (resp.ok) {
            sendBtn.innerHTML = '✅ Sent!';
            sendBtn.style.background = '#10b981';
            addDecisionLog(`📨 Reply sent to ${toEmail}`);
            setTimeout(() => {
                sendBtn.disabled = false;
                sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Send via Gmail`;
                sendBtn.style.background = '';
            }, 3000);
        } else {
            const err = await resp.json();
            alert(`Send failed: ${err.detail || 'Unknown error'}`);
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send via Gmail';
        }
    } catch (err) {
        alert('Failed to connect to server');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send via Gmail';
    }
}

// ── Decision Log ──
function addDecisionLog(message) {
    const log = document.getElementById('ai-decision-log');
    if (!log) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const li = document.createElement('li');
    li.className = 'log-item';
    li.innerHTML = `<span class="log-time">${time}</span><span class="log-desc">${escapeHtml(message)}</span>`;
    log.prepend(li);
    // Keep max 10 entries
    while (log.children.length > 10) log.removeChild(log.lastChild);
}

function openClassifyWithEmail(gmailId) {
    const email = allGmailEmails.find(e => e.id === gmailId);
    if (email) {
        const text = `Subject: ${email.subject}\nFrom: ${email.from}\nTo: ${email.to}\nDate: ${email.date}\n\n${email.body}`;
        localStorage.setItem('inbex-classify-email', text);
        localStorage.setItem('inbex-classify-gmail-id', gmailId);
        localStorage.setItem('inbex-classify-thread-id', email.threadId || '');
        localStorage.setItem('inbex-classify-from', email.from || '');
        window.location.href = 'classify.html';
    }
}

// ── Helpers ──
function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (diff < 172800000) return 'Yesterday';
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch { return dateStr; }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Expose for inline onclick handlers
async function loadAutomationTasks() {
    const list = document.getElementById('dashboard-tasks-list');
    if (!list) return;

    try {
        const resp = await fetch(`${API_BASE}/automations`, {
            headers: window.Auth.getHeaders()
        });
        if (!resp.ok) throw new Error('Failed to load');

        const automations = await resp.json();
        if (automations.length === 0) {
            list.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);"><p style="font-size:0.85rem;">No active workflows. Click "Create New" to start.</p></div>`;
            return;
        }

        list.innerHTML = automations.slice(0, 5).map(auto => `
            <div class="task-card">
                <div class="task-info">
                    <h4>${escapeHtml(auto.name)}</h4>
                    <p>${auto.send_time ? `Runs daily at ${auto.send_time}` : 'Bulk Broadcast'}</p>
                </div>
                <div class="progress-ring-wrap">
                    <span class="badge ${auto.is_active ? 'badge-info' : ''}">${auto.is_active ? 'Active' : 'Paused'}</span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Load tasks error:', err);
        list.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);"><p style="font-size:0.85rem;">Failed to load automations.</p></div>`;
    }
}

// AI Compose Logic
function openComposeModal() {
    document.getElementById('compose-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeComposeModal() {
    document.getElementById('compose-modal').style.display = 'none';
    document.body.style.overflow = '';
}

async function generateAiCompose() {
    const prompt = document.getElementById('compose-prompt').value.trim();
    if (!prompt) return alert('Please enter what the email should be about.');

    const btn = document.getElementById('compose-generate-btn');
    const resultArea = document.getElementById('compose-result-area');
    
    btn.disabled = true;
    btn.textContent = 'AI is writing...';

    try {
        const resp = await fetch(`${API_BASE}/generate-compose`, {
            method: 'POST',
            headers: window.Auth.getHeaders(),
            body: JSON.stringify({ prompt })
        });

        if (resp.ok) {
            const data = await resp.json();
            document.getElementById('compose-subject').value = data.subject;
            document.getElementById('compose-body').value = data.body;
            resultArea.style.display = 'flex';
        } else {
            alert('Failed to generate content. Please try a different prompt.');
        }
    } catch (err) {
        alert('Server error. Please try again later.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg> Generate with Groq AI`;
    }
}

async function sendAiCompose() {
    const to = document.getElementById('compose-to').value.trim();
    const subject = document.getElementById('compose-subject').value.trim();
    const body = document.getElementById('compose-body').value.trim();

    if (!to || !subject || !body) return alert('All fields are required.');

    const btn = document.getElementById('compose-send-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        const resp = await fetch(`${API_BASE}/gmail/send`, {
            method: 'POST',
            headers: window.Auth.getHeaders(),
            body: JSON.stringify({ to, subject, body })
        });

        if (resp.ok) {
            alert('Email sent successfully!');
            closeComposeModal();
        } else {
            const err = await resp.json();
            alert(`Failed: ${err.detail || 'Unknown error'}`);
        }
    } catch (err) {
        alert('Failed to connect to server.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send via Gmail';
    }
}

// Expose functions
window.openComposeModal = openComposeModal;
window.closeComposeModal = closeComposeModal;
window.generateAiCompose = generateAiCompose;
window.sendAiCompose = sendAiCompose;

window.connectGmail = connectGmail;
window.disconnectGmail = disconnectGmail;
window.openClassifyWithEmail = openClassifyWithEmail;
window.openEmailModal = openEmailModal;
window.closeEmailModal = closeEmailModal;
window.replyFromModal = replyFromModal;
window.onEmailSelected = onEmailSelected;
window.generateAiReply = generateAiReply;
window.sendAiReply = sendAiReply;
window.filterUrgentEmails = filterUrgentEmails;
window.nextEmailPage = nextEmailPage;
window.prevEmailPage = prevEmailPage;
window.toggleProfileMenu = toggleProfileMenu;
window.signOutFromDashboard = signOutFromDashboard;
