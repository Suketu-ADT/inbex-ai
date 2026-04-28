/**
 * INBEX — Workflows Router (CRUD)
 * GET    /workflows          — List user's workflow rules
 * POST   /workflows          — Create a new rule
 * PUT    /workflows/:id      — Update a rule
 * DELETE /workflows/:id      — Delete a rule
 * POST   /workflows/:id/toggle — Toggle active/inactive
 */
'use strict';

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../database');
const requireAuth = require('../middleware/auth');

const router = Router();

const VALID_CATEGORIES = ['HR', 'Work', 'Finance', 'Personal', 'Spam'];
const VALID_ACTIONS = ['send_hr_response', 'tag_and_notify_finance', 'flag_high_priority', 'route_to_personal', 'quarantine_spam', 'custom'];

// ── GET /workflows ──
router.get('/workflows', requireAuth, (req, res) => {
    const rows = all(
        'SELECT * FROM workflows WHERE user_id = ? ORDER BY created_at',
        [req.user.id]
    );
    return res.json(rows.map(formatWorkflow));
});

// ── POST /workflows ──
router.post('/workflows', requireAuth, (req, res) => {
    const { name, trigger_category, action, action_detail, is_active } = req.body;

    if (!name || name.trim().length < 3) {
        return res.status(422).json({ detail: 'Name must be at least 3 characters.' });
    }
    if (!VALID_CATEGORIES.includes(trigger_category)) {
        return res.status(422).json({ detail: `trigger_category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (!VALID_ACTIONS.includes(action)) {
        return res.status(422).json({ detail: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const active = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    run(
        `INSERT INTO workflows (id, user_id, name, trigger_category, action, action_detail, is_active, run_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [id, req.user.id, name.trim(), trigger_category, action, action_detail || null, active, now]
    );

    const workflow = get('SELECT * FROM workflows WHERE id = ?', [id]);
    return res.status(201).json(formatWorkflow(workflow));
});

// ── PUT /workflows/:id ──
router.put('/workflows/:id', requireAuth, (req, res) => {
    const workflow = getUserWorkflow(req.params.id, req.user.id);
    if (!workflow) return res.status(404).json({ detail: 'Workflow not found.' });

    const { name, trigger_category, action, action_detail, is_active } = req.body;

    if (trigger_category && !VALID_CATEGORIES.includes(trigger_category)) {
        return res.status(422).json({ detail: `trigger_category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (action && !VALID_ACTIONS.includes(action)) {
        return res.status(422).json({ detail: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
    }

    // Build dynamic update
    const fields = [];
    const values = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (trigger_category !== undefined) { fields.push('trigger_category = ?'); values.push(trigger_category); }
    if (action !== undefined) { fields.push('action = ?'); values.push(action); }
    if (action_detail !== undefined) { fields.push('action_detail = ?'); values.push(action_detail); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }

    if (fields.length > 0) {
        values.push(req.params.id);
        run(`UPDATE workflows SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const updated = get('SELECT * FROM workflows WHERE id = ?', [req.params.id]);
    return res.json(formatWorkflow(updated));
});

// ── DELETE /workflows/:id ──
router.delete('/workflows/:id', requireAuth, (req, res) => {
    const workflow = getUserWorkflow(req.params.id, req.user.id);
    if (!workflow) return res.status(404).json({ detail: 'Workflow not found.' });

    run('DELETE FROM workflows WHERE id = ?', [req.params.id]);
    return res.status(204).send();
});

// ── POST /workflows/:id/toggle ──
router.post('/workflows/:id/toggle', requireAuth, (req, res) => {
    const workflow = getUserWorkflow(req.params.id, req.user.id);
    if (!workflow) return res.status(404).json({ detail: 'Workflow not found.' });

    const newActive = workflow.is_active ? 0 : 1;
    run('UPDATE workflows SET is_active = ? WHERE id = ?', [newActive, req.params.id]);

    const updated = get('SELECT * FROM workflows WHERE id = ?', [req.params.id]);
    return res.json(formatWorkflow(updated));
});

// ── Helpers ──
function getUserWorkflow(workflowId, userId) {
    return get('SELECT * FROM workflows WHERE id = ? AND user_id = ?', [workflowId, userId]);
}

function formatWorkflow(wf) {
    return {
        id: wf.id,
        name: wf.name,
        trigger_category: wf.trigger_category,
        action: wf.action,
        action_detail: wf.action_detail,
        is_active: !!wf.is_active,
        run_count: wf.run_count,
        created_at: wf.created_at,
    };
}

module.exports = router;
