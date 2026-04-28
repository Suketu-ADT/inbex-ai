/**
 * INBEX — Email Classifier JS
 * Handles classification (simulated or live API), reply generation,
 * history tracking, and UI interactions.
 */
'use strict';

/* ── Configuration ── */
const API_URL = 'http://127.0.0.1:3000/predict'; // Node.js backend endpoint

/* ── Sample Emails ── */
const SAMPLES = {
    hr: `Subject: Annual Leave Application — Q3 Period
From: employee@company.com
To: hr@company.com

Dear HR Team,

I am writing to formally request 5 days of annual leave from July 14th to July 18th, 2026. I have ensured all my pending tasks are up to date and briefed my colleague Sarah to handle any urgent matters during my absence.

Please let me know if any additional forms or approval steps are required.

Best regards,
Ravi Mehta
Software Engineer, Product Team`,

    finance: `Subject: Invoice #INV-2026-0087 — Payment Confirmation Required
From: accounts@vendor.com
To: finance@company.com

Hi Finance Team,

Please find attached Invoice #INV-2026-0087 for $12,450 due on July 31st, 2026, for cloud infrastructure services rendered in June.

Please confirm receipt and advise on expected payment date. Our bank details remain unchanged from the last transaction.

Regards,
Accounts Receivable
CloudPro Ltd.`,

    work: `Subject: Design Review: Dashboard Redesign v2 — Input Needed
From: priya.sharma@company.com
To: team@company.com

Hi team,

The mockups for the dashboard redesign v2 are ready for review. I've shared them in Figma (link below). Key changes include a new navigation pattern, revised data cards, and a dark mode update.

Please add your feedback by EOD Friday. The dev handoff is scheduled for Monday.

Figma link: https://figma.com/...

Thanks,
Priya`,

    personal: `Subject: Weekend Barbecue — You're Invited! 🎉
From: john.doe@gmail.com
To: alex@company.com

Hey Alex!

Hope you're doing well! We're hosting a small barbecue this Saturday, July 12th, at our place starting around 4 PM. Nothing fancy — just good food, cold drinks, and great company.

Let me know if you can make it so I can plan the food. Feel free to bring your family along!

Cheers,
John`,

    spam: `Subject: URGENT: You Have Won $1,000,000 — Claim NOW!
From: noreply@lucky-draw-2026.biz
To: user@email.com

Congratulations!!! You have been SELECTED as our LUCKY WINNER for this month's International Draw!

CLAIM YOUR $1,000,000 PRIZE TODAY!

Click the link below to verify your identity and receive your funds within 24 hours. This offer expires in 48 hours. Do NOT miss this ONCE-IN-A-LIFETIME opportunity!

CLICK HERE → http://claimprize.biz/winner

Best Regards,
International Lottery Committee`
};

/* ── Rule-Based Reply Templates ── */
const REPLY_TEMPLATES = {
    HR: (text) => `Dear HR Team,

Thank you for your message. I have reviewed the details and would like to acknowledge receipt of this communication.

${text.toLowerCase().includes('leave') || text.toLowerCase().includes('absence')
        ? 'Your leave request has been noted and will be processed within 2 business days. You will receive a formal confirmation via email once approved by your department head.'
        : 'Your request has been forwarded to the relevant HR representative who will follow up with you within 48 hours.'}

Please don't hesitate to reach out if you have any further questions.

Best regards,
INBEX Automated Response System`,

    Work: () => `Hi,

Thank you for reaching out. I have received your message and will review the details as soon as possible.

I will get back to you with a detailed response by end of business today. If this is urgent, please feel free to ping me on our team channel.

Best regards,
Alex`,

    Finance: (text) => `Dear Team,

Thank you for the communication. I have received the financial details you've shared.

${text.toLowerCase().includes('invoice')
        ? 'The invoice has been logged in our accounts payable system. Payment will be processed as per our standard 30-day payment terms. A confirmation email will be sent once the transaction is complete.'
        : 'The financial information has been noted and has been forwarded to our accounts team for review and appropriate action.'}

For any queries, please contact our finance department directly.

Best regards,
Finance Team
INBEX`,

    Personal: () => `Hey!

Thanks for getting in touch! I appreciate you reaching out.

I'll get back to you very soon with a proper reply. Looking forward to catching up!

Best,
Alex`,

    Spam: () => `[This email has been classified as SPAM by the INBEX AI system and has been quarantined. No reply is recommended.]

If you believe this is a mistake, please review the email classification in your INBEX dashboard and re-categorize manually.`
};

/* ── Category Metadata ── */
const CATEGORY_META = {
    HR: {
        cssClass: 'clf-cat-hr',
        fillClass: 'clf-score-fill-hr',
        color: '#c084fc',
        icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`
    },
    Work: {
        cssClass: 'clf-cat-work',
        fillClass: 'clf-score-fill-work',
        color: '#60a5fa',
        icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`
    },
    Finance: {
        cssClass: 'clf-cat-finance',
        fillClass: 'clf-score-fill-finance',
        color: '#34d399',
        icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`
    },
    Personal: {
        cssClass: 'clf-cat-personal',
        fillClass: 'clf-score-fill-personal',
        color: '#fbbf24',
        icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`
    },
    Spam: {
        cssClass: 'clf-cat-spam',
        fillClass: 'clf-score-fill-spam',
        color: '#f87171',
        icon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`
    }
};

/* ── State ── */
let classifyCount = parseInt(localStorage.getItem('inbex-classified-today') || '0');
let history = JSON.parse(localStorage.getItem('inbex-history') || '[]');
let currentResult = null;

/* ── DOM Elements ── */
const emailInput   = document.getElementById('email-input');
const charCount    = document.getElementById('char-count');
const classifyBtn  = document.getElementById('classify-btn');
const classifyText = document.getElementById('classify-btn-text');
const clfSpinner   = document.getElementById('clf-spinner');
const clearBtn     = document.getElementById('clear-btn');
const idleState    = document.getElementById('idle-state');
const resultBody   = document.getElementById('result-body');
const categoryDisplay = document.getElementById('category-display');
const categoryIcon = document.getElementById('category-icon');
const catValue     = document.getElementById('cat-value');
const confPct      = document.getElementById('conf-pct');
const confBar      = document.getElementById('conf-bar');
const scoresGrid   = document.getElementById('scores-grid');
const regenBtn     = document.getElementById('regen-btn');
const replyIdle    = document.getElementById('reply-idle');
const replyBody    = document.getElementById('reply-body');
const replyTextarea = document.getElementById('reply-textarea');
const sendReplyBtn = document.getElementById('send-reply-btn');
const copyReplyBtn = document.getElementById('copy-reply-btn');
const useReplyBtn  = document.getElementById('use-reply-btn');
const createWorkflowBtn = document.getElementById('create-workflow-btn');
const historyList  = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const statClassified = document.getElementById('stat-classified');
const toast        = document.getElementById('toast');

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
    statClassified.textContent = classifyCount;
    renderHistory();

    // Sample buttons
    document.querySelectorAll('.clf-sample-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.sample;
            emailInput.value = SAMPLES[key] || '';
            updateCharCount();
            emailInput.focus();
        });
    });

    // Char count
    emailInput.addEventListener('input', updateCharCount);

    // Clear
    clearBtn.addEventListener('click', clearInput);

    // Classify
    classifyBtn.addEventListener('click', handleClassify);

    // Use Reply button (scrolls to reply panel)
    useReplyBtn.addEventListener('click', () => {
        document.getElementById('reply-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Create Workflow button
    createWorkflowBtn.addEventListener('click', () => {
        if (currentResult) {
            window.location.href = `automation.html?category=${encodeURIComponent(currentResult.category)}`;
        }
    });

    // Regenerate
    regenBtn.addEventListener('click', () => {
        if (currentResult) generateReply(currentResult.category, emailInput.value);
    });

    // Send Now (simulated)
    sendReplyBtn.addEventListener('click', () => {
        showToast('✅ Reply sent successfully! (simulated)', 'success');
    });

    // Copy reply
    copyReplyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(replyTextarea.value).then(() => {
            showToast('📋 Reply copied to clipboard!', 'info');
        });
    });

    // Clear history
    clearHistoryBtn.addEventListener('click', () => {
        history = [];
        localStorage.removeItem('inbex-history');
        renderHistory();
        showToast('History cleared', 'info');
    });
});

/* ── Helpers ── */
function updateCharCount() {
    const n = emailInput.value.length;
    charCount.textContent = n.toLocaleString() + ' character' + (n !== 1 ? 's' : '');
}

function clearInput() {
    emailInput.value = '';
    updateCharCount();
    emailInput.focus();
}

/* ── Classification Handler ── */
async function handleClassify() {
    const text = emailInput.value.trim();
    if (!text) {
        showToast('⚠️ Please enter email text first.', 'error');
        emailInput.focus();
        return;
    }
    if (text.length < 20) {
        showToast('⚠️ Email text is too short to classify.', 'error');
        return;
    }

    setLoading(true);

    try {
        // Try real API first
        const result = await classifyViaAPI(text);
        displayResult(result, text);
    } catch (err) {
        // Fallback to simulation
        console.warn('API not reachable — using local simulation:', err.message);
        const result = simulateClassification(text);
        displayResult(result, text);
        showToast('ℹ️ Using simulated model (backend offline)', 'info');
    } finally {
        setLoading(false);
    }
}

/* ── API Call ── */
async function classifyViaAPI(text) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout for HF API
    try {
        const headers = window.Auth ? window.Auth.getHeaders() : { 'Content-Type': 'application/json' };
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ text }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        const data = await resp.json();
        
        if (!resp.ok) {
            if (resp.status === 401) {
                // Auth error - redirect to login
                window.Auth && window.Auth.clearSession();
                window.location.href = 'index.html';
            }
            throw new Error(data.detail || `API error: ${resp.status}`);
        }
        
        // Expected API response: { category: "HR", confidence: 0.92, scores: { HR: 0.92, ... }, suggested_reply: "..." }
        return {
            category: data.category,
            confidence: Math.round((data.confidence || 0.88) * 100),
            scores: data.scores || buildFakeScores(data.category, data.confidence || 0.88),
            suggested_reply: data.suggested_reply
        };
    } finally {
        clearTimeout(timeout);
    }
}

/* ── Simulation Fallback ── */
function simulateClassification(text) {
    const lower = text.toLowerCase();

    // Simple keyword-based rule set (mirrors TF-IDF SVM intuition)
    const scores = { HR: 0, Work: 0, Finance: 0, Personal: 0, Spam: 0 };

    // HR signals
    ['leave', 'hr', 'salary', 'employee', 'payroll', 'onboarding', 'resignation', 'recruit', 'interview', 'annual leave'].forEach(w => {
        if (lower.includes(w)) scores.HR += 1.5;
    });
    // Finance signals
    ['invoice', 'payment', 'finance', 'bank', 'transaction', 'tax', 'budget', 'expense', 'revenue', 'invoice', 'due'].forEach(w => {
        if (lower.includes(w)) scores.Finance += 1.5;
    });
    // Work signals
    ['meeting', 'project', 'deadline', 'review', 'report', 'team', 'sprint', 'task', 'design', 'feedback', 'milestone'].forEach(w => {
        if (lower.includes(w)) scores.Work += 1.2;
    });
    // Personal signals
    ['barbecue', 'party', 'weekend', 'family', 'hey', 'friend', 'invite', 'catch up', 'birthday', 'personal'].forEach(w => {
        if (lower.includes(w)) scores.Personal += 1.5;
    });
    // Spam signals
    ['winner', 'won', 'prize', 'click here', 'urgent', 'claim', 'lottery', 'free', 'million', '!!!'].forEach(w => {
        if (lower.includes(w)) scores.Spam += 2;
    });

    // Add small random noise
    Object.keys(scores).forEach(k => { scores[k] += Math.random() * 0.3; });

    // Normalize to percentages
    const total = Object.values(scores).reduce((s, v) => s + v, 0) || 1;
    const pct = {};
    Object.keys(scores).forEach(k => { pct[k] = +(scores[k] / total * 100).toFixed(1); });

    // Pick winner
    const category = Object.keys(pct).reduce((a, b) => pct[a] > pct[b] ? a : b);
    const confidence = Math.round(Math.min(pct[category] + Math.random() * 5, 99));

    return { category, confidence, scores: pct };
}

function buildFakeScores(category, confidence) {
    const cats = ['HR', 'Work', 'Finance', 'Personal', 'Spam'];
    const scores = {};
    let remaining = 100 - (confidence * 100);
    cats.forEach(c => {
        if (c === category) { scores[c] = +(confidence * 100).toFixed(1); }
        else {
            const share = +(remaining / (cats.length - 1) * (0.5 + Math.random())).toFixed(1);
            scores[c] = share;
        }
    });
    return scores;
}

/* ── Display Result ── */
function displayResult(result, text) {
    currentResult = result;
    const meta = CATEGORY_META[result.category] || CATEGORY_META.Work;

    // Show result panel
    idleState.hidden = true;
    resultBody.hidden = false;

    // Category display
    categoryDisplay.className = 'clf-category-display ' + meta.cssClass;
    categoryIcon.innerHTML = meta.icon;
    catValue.textContent = result.category;

    // Confidence
    confPct.textContent = result.confidence + '%';
    confBar.style.width = '0%'; // reset for animation
    setTimeout(() => { confBar.style.width = result.confidence + '%'; }, 50);

    // Score grid
    renderScores(result.scores, result.category);

    // Display AI generated reply from backend
    if (result.suggested_reply) {
        displayReply(result.suggested_reply, result.category);
    } else {
        generateReply(result.category, text); // Fallback
    }

    // Update history
    addToHistory(result, text);

    // Update stat counter
    classifyCount++;
    statClassified.textContent = classifyCount;
    localStorage.setItem('inbex-classified-today', classifyCount);

    // Show regen button
    regenBtn.hidden = false;

    showToast(`✅ Classified as ${result.category} (${result.confidence}% confidence)`, 'success');
}

function renderScores(scores, topCategory) {
    scoresGrid.innerHTML = '';
    const order = ['HR', 'Work', 'Finance', 'Personal', 'Spam'];
    order.forEach(cat => {
        const pct = scores[cat] || 0;
        const meta = CATEGORY_META[cat];
        const row = document.createElement('div');
        row.className = 'clf-score-row';
        row.innerHTML = `
            <span class="clf-score-label" style="color:${cat === topCategory ? meta.color : ''}">${cat}</span>
            <div class="clf-score-bar-bg">
                <div class="clf-score-bar-fill ${meta.fillClass}" style="width:0%"
                     data-width="${pct}" ${cat === topCategory ? 'data-top="true"' : ''}></div>
            </div>
            <span class="clf-score-pct" style="${cat === topCategory ? 'color:' + meta.color : ''}">${pct.toFixed(1)}%</span>
        `;
        scoresGrid.appendChild(row);
    });
    // Animate bars
    setTimeout(() => {
        scoresGrid.querySelectorAll('.clf-score-bar-fill').forEach(el => {
            el.style.width = el.dataset.width + '%';
        });
    }, 100);
}

/* ── Reply Generation ── */
function displayReply(reply, category) {
    replyIdle.hidden = true;
    replyBody.hidden = false;
    replyTextarea.value = '';

    // Typewriter effect
    let i = 0;
    const interval = setInterval(() => {
        replyTextarea.value += reply[i];
        i++;
        if (i >= reply.length) clearInterval(interval);
    }, 8);

    document.getElementById('reply-category-hint').textContent = `AI suggested reply for ${category}`;
}

async function generateReply(category, text) {
    // Show loading state in text area
    replyIdle.hidden = true;
    replyBody.hidden = false;
    replyTextarea.value = 'Generating AI reply...';
    document.getElementById('reply-category-hint').textContent = `Requesting AI reply for ${category}`;
    
    try {
        const headers = window.Auth ? window.Auth.getHeaders() : { 'Content-Type': 'application/json' };
        const resp = await fetch('http://127.0.0.1:3000/generate-reply', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ email_text: text, category: category })
        });
        
        if (resp.ok) {
            const data = await resp.json();
            displayReply(data.reply, category);
            if (data.source === 'template') {
                showToast('API unavailable — using template fallback', 'info');
            }
            return;
        }
    } catch (e) {
        console.warn('Failed to fetch AI reply on demand', e);
    }

    // Local fallback if API fails
    const templateFn = REPLY_TEMPLATES[category] || REPLY_TEMPLATES.Work;
    displayReply(templateFn(text), category);
}

/* ── History ── */
function addToHistory(result, text) {
    const preview = text.replace(/\s+/g, ' ').slice(0, 60);
    const entry = {
        category: result.category,
        confidence: result.confidence,
        preview,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    history.unshift(entry);
    if (history.length > 20) history.pop();
    localStorage.setItem('inbex-history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    historyList.innerHTML = '';
    if (history.length === 0) {
        historyList.appendChild(historyEmpty.cloneNode(true));
        historyEmpty.hidden = false;
        return;
    }
    history.forEach((entry, idx) => {
        const meta = CATEGORY_META[entry.category] || CATEGORY_META.Work;
        const item = document.createElement('div');
        item.className = 'clf-history-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', `Re-load ${entry.category} classification`);
        item.innerHTML = `
            <span class="clf-hist-badge">
                <span class="badge" style="background:rgba(0,0,0,0.1);color:${meta.color};border:1px solid ${meta.color}33;">
                    ${entry.category}
                </span>
            </span>
            <span class="clf-hist-preview">${escapeHtml(entry.preview)}&hellip;</span>
            <span class="clf-hist-time">${entry.time}</span>
        `;
        historyList.appendChild(item);
    });
}

/* ── Loading State ── */
function setLoading(on) {
    classifyBtn.disabled = on;
    classifyBtn.classList.toggle('loading', on);
    classifyText.textContent = on ? 'Classifying…' : 'Classify Email';
}

/* ── Toast ── */
let toastTimer = null;
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `clf-toast show toast-${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

/* ── Utils ── */
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
