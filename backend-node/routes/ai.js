/**
 * INBEX — AI Routes
 * All AI-powered endpoints, powered by OpenRouter (multi-model gateway)
 *
 * POST /ai/smart-reply     → 3-tone reply variants (Formal / Friendly / Brief)
 * POST /ai/priority-score  → 0-100 urgency score + reason
 * POST /ai/compose         → AI email drafting (subject + body)
 * POST /ai/chat            → Inbox natural language chat
 * POST /ai/insights        → Weekly email pattern analysis
 * GET  /ai/status          → Check OpenRouter configuration
 */
'use strict';

const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const ai = require('../services/aiRouterService');

const router = Router();

// ── GET /ai/status ──────────────────────────────────────────────────────────
router.get('/ai/status', (req, res) => {
    return res.json({
        openrouter_configured: ai.isConfigured(),
        models: require('../config').models,
    });
});

// ── POST /ai/smart-reply ─────────────────────────────────────────────────────
// Body: { emailText: string, senderName?: string }
// Returns: { formal: string, friendly: string, brief: string }
router.post('/ai/smart-reply', requireAuth, async (req, res) => {
    const { emailText, senderName } = req.body;

    if (!emailText || emailText.trim().length < 10) {
        return res.status(422).json({ detail: 'emailText is required (min 10 chars).' });
    }

    try {
        const replies = await ai.smartReply(emailText, senderName || '');
        return res.json({ success: true, replies });
    } catch (err) {
        console.error('[AI/smart-reply]', err.message);
        return res.status(500).json({ detail: err.message });
    }
});

// ── POST /ai/priority-score ──────────────────────────────────────────────────
// Body: { emailText: string, sender?: string, subject?: string }
// Returns: { score: number, level: string, reason: string }
router.post('/ai/priority-score', requireAuth, async (req, res) => {
    const { emailText, sender, subject } = req.body;

    if (!emailText || emailText.trim().length < 5) {
        return res.status(422).json({ detail: 'emailText is required.' });
    }

    try {
        const result = await ai.priorityScore(emailText, sender || '', subject || '');
        return res.json({ success: true, ...result });
    } catch (err) {
        console.error('[AI/priority-score]', err.message);
        return res.status(500).json({ detail: err.message });
    }
});

// ── POST /ai/compose ─────────────────────────────────────────────────────────
// Body: { prompt: string, recipientName?: string, recipientEmail?: string }
// Returns: { subject: string, body: string }
router.post('/ai/compose', requireAuth, async (req, res) => {
    const { prompt, recipientName, recipientEmail } = req.body;

    if (!prompt || prompt.trim().length < 5) {
        return res.status(422).json({ detail: 'A prompt describing the email is required.' });
    }

    try {
        const result = await ai.compose(prompt, recipientName || '', recipientEmail || '');
        return res.json({ success: true, ...result });
    } catch (err) {
        console.error('[AI/compose]', err.message);
        return res.status(500).json({ detail: err.message });
    }
});

// ── POST /ai/chat ─────────────────────────────────────────────────────────────
// Body: { question: string, emails?: Array<{from, subject, category, date}> }
// Returns: { answer: string }
router.post('/ai/chat', requireAuth, async (req, res) => {
    const { question, emails } = req.body;

    if (!question || question.trim().length < 3) {
        return res.status(422).json({ detail: 'A question is required.' });
    }

    try {
        const answer = await ai.inboxChat(question, emails || []);
        return res.json({ success: true, answer });
    } catch (err) {
        console.error('[AI/chat]', err.message);
        return res.status(500).json({ detail: err.message });
    }
});

// ── POST /ai/summarize ────────────────────────────────────────────────────────
// Body: { emailText: string }
// Returns: { summary: string }
router.post('/ai/summarize', requireAuth, async (req, res) => {
    const { emailText } = req.body;

    if (!emailText || emailText.trim().length < 20) {
        return res.status(422).json({ detail: 'emailText is required (min 20 chars).' });
    }

    try {
        const summary = await ai.summarize(emailText);
        return res.json({ success: true, summary });
    } catch (err) {
        console.error('[AI/summarize]', err.message);
        return res.status(500).json({ detail: err.message });
    }
});

// ── POST /ai/insights ─────────────────────────────────────────────────────────
// Body: { stats: object }  (category counts, total processed, etc.)
// Returns: { insights: Array<{icon, title, body}> }
router.post('/ai/insights', requireAuth, async (req, res) => {
    const { stats } = req.body;

    try {
        const insights = await ai.generateInsights(stats || {});
        return res.json({ success: true, insights });
    } catch (err) {
        console.error('[AI/insights]', err.message);
        return res.status(500).json({ detail: err.message });
    }
});

// ── POST /ai/classify ─────────────────────────────────────────────────────────
// AI-powered classification (for low-confidence keyword classifier cases)
// Body: { emailText: string, sender?: string }
// Returns: { category, confidence, reason }
router.post('/ai/classify', requireAuth, async (req, res) => {
    const { emailText, sender } = req.body;

    if (!emailText || emailText.trim().length < 10) {
        return res.status(422).json({ detail: 'emailText is required.' });
    }

    try {
        const result = await ai.classifyWithAI(emailText, sender || '');
        return res.json({ success: true, ...result });
    } catch (err) {
        console.error('[AI/classify]', err.message);
        return res.status(500).json({ detail: err.message });
    }
});

module.exports = router;
