/**
 * INBEX — Gmail Router
 * GET  /gmail/connect      — Redirect to Google OAuth consent
 * GET  /auth/google/callback — OAuth callback
 * GET  /gmail/emails       — Fetch + auto-classify + auto-calendar
 * GET  /gmail/status       — Check connection status
 * POST /gmail/send         — Send an email via Gmail
 * POST /gmail/calendar     — Manually create a calendar event from email
 * POST /gmail/disconnect   — Disconnect Gmail
 */
'use strict';

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const requireAuth = require('../middleware/auth');
const gmailService = require('../services/gmailService');
const classifier = require('../services/classifierService');
const workflowService = require('../services/workflowService');
const { run } = require('../database');
const calendarService = require('../services/calendarService');

const router = Router();

// ── GET /gmail/connect — Start OAuth flow ──
router.get('/gmail/connect', requireAuth, (req, res) => {
    try {
        const authUrl = gmailService.getAuthUrl(req.user.id);
        return res.json({ auth_url: authUrl });
    } catch (err) {
        console.error('[Gmail] Connect error:', err);
        return res.status(500).json({ detail: err.message });
    }
});

// ── GET /auth/google/callback — OAuth callback ──
router.get('/auth/google/callback', async (req, res) => {
    const { code, state: userId } = req.query;

    if (!code || !userId) {
        return res.status(400).send('Missing authorization code or state.');
    }

    try {
        const result = await gmailService.handleCallback(code, userId);
        // Redirect back to dashboard with success
        return res.redirect(`/gmail-callback.html?status=connected&email=${encodeURIComponent(result.email)}`);
    } catch (err) {
        console.error('[Gmail] Callback error:', err);
        return res.redirect(`/gmail-callback.html?status=error&message=${encodeURIComponent(err.message)}`);
    }
});

// ── GET /gmail/emails — Fetch + auto-classify ──
router.get('/gmail/emails', requireAuth, async (req, res) => {
    try {
        const max = Math.min(parseInt(req.query.max, 10) || 25, 50);
        const query = req.query.q || 'in:inbox';
        const pageToken = req.query.pageToken || null;

        const result = await gmailService.fetchEmails(req.user.id, max, query, pageToken);
        const emails = result.emails;

        // Auto-classify each email
        const classified = emails.map((email) => {
            const textForClassification = `Subject: ${email.subject}\nFrom: ${email.from}\n\n${email.body}`;
            const result = classifier.classify(textForClassification, email.from || '');

            return {
                ...email,
                category: result.category,
                confidence: result.confidence,
                scores: result.scores,
            };
        });

        // Log classifications to DB + detect meetings for calendar
        for (const email of classified) {
            const logId = uuidv4();
            const textSnippet = `Subject: ${email.subject}\nFrom: ${email.from}\n\n${email.body}`.substring(0, 2000);
            const wfResult = workflowService.executeWorkflow(email.category, req.user.id);

            try {
                run(
                    `INSERT OR IGNORE INTO email_logs (id, user_id, email_text, predicted_category, confidence, workflow_triggered, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [logId, req.user.id, textSnippet, email.category, email.confidence, wfResult.triggered ? 1 : 0, new Date().toISOString()]
                );
            } catch (e) {
                // Ignore duplicate inserts
            }

            // Auto-detect meetings and add to Google Calendar
            try {
                const calEvent = await calendarService.processEmailForMeeting(
                    req.user.id, email.subject, email.body, email.from
                );
                if (calEvent) {
                    email.calendar_event = calEvent;
                }
            } catch (calErr) {
                console.warn(`[Calendar] Auto-detect failed for "${email.subject}":`, calErr.message);
            }
        }

        return res.json({ emails: classified, nextPageToken: result.nextPageToken || null });
    } catch (err) {
        console.error('[Gmail] Fetch error:', err);
        if (err.message === 'Gmail not connected') {
            return res.status(403).json({ detail: 'Gmail not connected. Please connect your account.' });
        }
        return res.status(500).json({ detail: err.message });
    }
});

// ── GET /gmail/status — Check if Gmail is connected ──
router.get('/gmail/status', requireAuth, (req, res) => {
    const status = gmailService.getStatus(req.user.id);
    return res.json(status);
});

// ── POST /gmail/send — Send an email via Gmail ──
router.post('/gmail/send', requireAuth, async (req, res) => {
    try {
        const { to, subject, body, thread_id, in_reply_to } = req.body;

        if (!to || !subject || !body) {
            return res.status(422).json({ detail: 'to, subject, and body are required.' });
        }

        const result = await gmailService.sendEmail(
            req.user.id, to, subject, body, thread_id, in_reply_to
        );

        return res.json({
            success: true,
            message_id: result.messageId,
            thread_id: result.threadId,
        });
    } catch (err) {
        console.error('[Gmail] Send error:', err);
        if (err.message === 'Gmail not connected') {
            return res.status(403).json({ detail: 'Gmail not connected.' });
        }
        return res.status(500).json({ detail: err.message });
    }
});

// ── POST /gmail/calendar — Manually create a calendar event from email text ──
router.post('/gmail/calendar', requireAuth, async (req, res) => {
    try {
        const { subject, body, from } = req.body;
        if (!subject && !body) {
            return res.status(422).json({ detail: 'subject or body is required.' });
        }

        const fullText = `Subject: ${subject || ''}\nFrom: ${from || ''}\n\n${body || ''}`;
        const details = await calendarService.extractMeetingDetails(fullText);
        if (!details) {
            return res.status(422).json({ detail: 'Could not extract meeting details from email.' });
        }

        const event = await calendarService.createCalendarEvent(req.user.id, details);
        if (!event) {
            return res.status(500).json({ detail: 'Failed to create calendar event. Is Google connected?' });
        }

        return res.json({ success: true, event });
    } catch (err) {
        console.error('[Calendar] Manual create error:', err);
        return res.status(500).json({ detail: err.message });
    }
});

// ── POST /gmail/disconnect — Remove Gmail connection ──
router.post('/gmail/disconnect', requireAuth, (req, res) => {
    gmailService.disconnect(req.user.id);
    return res.json({ success: true, message: 'Gmail disconnected.' });
});

module.exports = router;
