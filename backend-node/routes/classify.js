/**
 * INBEX — Classify Router
 * POST /predict         — Classify email text, trigger workflows, log to DB
 * POST /generate-reply  — On-demand AI reply generation
 * GET  /emails          — Get user's classification history
 */
'use strict';

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { run, all } = require('../database');
const requireAuth = require('../middleware/auth');
const classifier = require('../services/classifierService');
const workflowService = require('../services/workflowService');
const aiService = require('../services/aiService');

const router = Router();

// ── POST /predict ──
router.post('/predict', requireAuth, async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || text.trim().length < 10) {
            return res.status(422).json({ detail: 'Email text must be at least 10 characters.' });
        }

        if (!classifier.isLoaded()) {
            return res.status(503).json({ detail: 'ML model not loaded. Please restart the server.' });
        }

        // Step 1: ML Classification
        const result = classifier.classify(text);
        const { category, confidence, scores } = result;

        // Step 2: Execute Agentic Workflow
        const workflowResult = workflowService.executeWorkflow(category, req.user.id);

        // Step 3: Get suggested reply
        let suggestedReply;
        if (category === 'Spam') {
            suggestedReply = aiService.getFallbackReply('Spam');
        } else {
            const aiResult = await aiService.generateReply(text, category);
            suggestedReply = aiResult.reply;
        }

        // Step 4: Log to database
        const logId = uuidv4();
        run(
            `INSERT INTO email_logs (id, user_id, email_text, predicted_category, confidence, workflow_triggered, suggested_reply, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [logId, req.user.id, text.substring(0, 2000), category, confidence, workflowResult.triggered ? 1 : 0, suggestedReply, new Date().toISOString()]
        );

        return res.json({
            category,
            confidence,
            scores,
            suggested_reply: suggestedReply,
            workflow_triggered: workflowResult.triggered,
            workflow_action: workflowResult.action || null,
            log_id: logId,
        });
    } catch (err) {
        console.error('[Classify] Error:', err);
        return res.status(500).json({ detail: `Classification failed: ${err.message}` });
    }
});

// ── POST /generate-reply ──
router.post('/generate-reply', requireAuth, async (req, res) => {
    try {
        const { email_text, category } = req.body;

        if (!email_text || email_text.trim().length < 10) {
            return res.status(422).json({ detail: 'Email text must be at least 10 characters.' });
        }
        if (!category) {
            return res.status(422).json({ detail: 'Category is required.' });
        }

        const result = await aiService.generateReply(email_text, category);
        return res.json({ reply: result.reply, source: result.source });
    } catch (err) {
        console.error('[GenerateReply] Error:', err);
        return res.status(500).json({ detail: err.message });
    }
});

// ── POST /generate-compose ──
router.post('/generate-compose', requireAuth, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt || prompt.trim().length < 5) {
            return res.status(422).json({ detail: 'Prompt must be at least 5 characters.' });
        }

        const result = await aiService.generateCompose(prompt);
        return res.json(result);
    } catch (err) {
        console.error('[GenerateCompose] Error:', err);
        return res.status(500).json({ detail: err.message });
    }
});

// ── POST /generate-summary ──
router.post('/generate-summary', requireAuth, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || text.trim().length < 10) {
            return res.status(422).json({ detail: 'Email text is too short to summarize.' });
        }

        const summary = await aiService.generateSummary(text);
        return res.json({ summary });
    } catch (err) {
        console.error('[GenerateSummary] Error:', err);
        return res.status(500).json({ detail: err.message });
    }
});

// ── GET /emails ──
router.get('/emails', requireAuth, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    const rows = all(
        'SELECT * FROM email_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [req.user.id, limit, offset]
    );

    const formatted = rows.map((row) => ({
        id: row.id,
        email_text: row.email_text,
        predicted_category: row.predicted_category,
        confidence: row.confidence,
        reply_sent: !!row.reply_sent,
        workflow_triggered: !!row.workflow_triggered,
        suggested_reply: row.suggested_reply,
        created_at: row.created_at,
    }));

    return res.json(formatted);
});

module.exports = router;
