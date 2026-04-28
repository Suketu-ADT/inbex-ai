/**
 * INBEX - Daily email automations CRUD + run-now endpoint
 */
'use strict';

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../database');
const requireAuth = require('../middleware/auth');
const scheduler = require('../services/automationSchedulerService');

const router = Router();

router.get('/automations', requireAuth, (req, res) => {
    const rows = all(
        `SELECT * FROM email_automations
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [req.user.id]
    );

    return res.json(rows.map((row) => scheduler.getAutomationPresentation(row)));
});

router.post('/automations', requireAuth, (req, res) => {
    const payload = validatePayload(req.body);
    if (payload.error) return res.status(422).json({ detail: payload.error });

    const id = uuidv4();
    const now = new Date().toISOString();

    run(
        `INSERT INTO email_automations
         (id, user_id, name, recipient_email, subject, body, send_time, timezone, is_active, run_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
            id,
            req.user.id,
            payload.value.name,
            payload.value.recipient_email,
            payload.value.subject,
            payload.value.body,
            payload.value.send_time,
            payload.value.timezone,
            payload.value.is_active ? 1 : 0,
            now,
            now,
        ]
    );

    const automation = getUserAutomation(id, req.user.id);
    return res.status(201).json(scheduler.getAutomationPresentation(automation));
});

router.put('/automations/:id', requireAuth, (req, res) => {
    const existing = getUserAutomation(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ detail: 'Automation not found.' });

    const payload = validatePayload(req.body, { partial: true });
    if (payload.error) return res.status(422).json({ detail: payload.error });

    const fields = [];
    const values = [];

    for (const [apiField, dbField] of Object.entries({
        name: 'name',
        recipient_email: 'recipient_email',
        subject: 'subject',
        body: 'body',
        send_time: 'send_time',
        timezone: 'timezone',
    })) {
        if (payload.value[apiField] !== undefined) {
            fields.push(`${dbField} = ?`);
            values.push(payload.value[apiField]);
        }
    }

    if (payload.value.is_active !== undefined) {
        fields.push('is_active = ?');
        values.push(payload.value.is_active ? 1 : 0);
    }

    if (fields.length > 0) {
        fields.push('updated_at = ?');
        values.push(new Date().toISOString());
        values.push(existing.id);
        run(`UPDATE email_automations SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const updated = getUserAutomation(existing.id, req.user.id);
    return res.json(scheduler.getAutomationPresentation(updated));
});

router.post('/automations/:id/toggle', requireAuth, (req, res) => {
    const existing = getUserAutomation(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ detail: 'Automation not found.' });

    const nextActive = existing.is_active ? 0 : 1;
    run(
        `UPDATE email_automations
         SET is_active = ?, updated_at = ?
         WHERE id = ?`,
        [nextActive, new Date().toISOString(), existing.id]
    );

    const updated = getUserAutomation(existing.id, req.user.id);
    return res.json(scheduler.getAutomationPresentation(updated));
});

router.post('/automations/:id/run', requireAuth, async (req, res) => {
    const existing = getUserAutomation(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ detail: 'Automation not found.' });

    try {
        const result = await scheduler.runAutomationNow(existing);
        const updated = getUserAutomation(existing.id, req.user.id);
        return res.json({
            success: true,
            message_id: result.messageId,
            thread_id: result.threadId,
            automation: scheduler.getAutomationPresentation(updated),
        });
    } catch (err) {
        if (err.message === 'Gmail not connected') {
            return res.status(403).json({ detail: 'Gmail not connected. Connect Gmail before running automations.' });
        }
        return res.status(500).json({ detail: err.message });
    }
});

router.delete('/automations/:id', requireAuth, (req, res) => {
    const existing = getUserAutomation(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ detail: 'Automation not found.' });

    run('DELETE FROM email_automations WHERE id = ?', [existing.id]);
    return res.status(204).send();
});

function getUserAutomation(id, userId) {
    return get(
        `SELECT * FROM email_automations
         WHERE id = ? AND user_id = ?`,
        [id, userId]
    );
}

function validatePayload(body, { partial = false } = {}) {
    const value = {};

    if (!partial || body.name !== undefined) {
        if (!body.name || body.name.trim().length < 3) {
            return { error: 'Name must be at least 3 characters.' };
        }
        value.name = body.name.trim();
    }

    if (!partial || body.recipient_email !== undefined) {
        if (!body.recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.recipient_email.trim())) {
            return { error: 'A valid recipient email is required.' };
        }
        value.recipient_email = body.recipient_email.trim().toLowerCase();
    }

    if (!partial || body.subject !== undefined) {
        if (!body.subject || !body.subject.trim()) {
            return { error: 'Subject is required.' };
        }
        value.subject = body.subject.trim();
    }

    if (!partial || body.body !== undefined) {
        if (!body.body || body.body.trim().length < 3) {
            return { error: 'Email content must be at least 3 characters.' };
        }
        value.body = body.body.trim();
    }

    if (!partial || body.send_time !== undefined) {
        if (!body.send_time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.send_time)) {
            return { error: 'send_time must be in HH:MM 24-hour format.' };
        }
        value.send_time = body.send_time;
    }

    if (!partial || body.timezone !== undefined) {
        if (!body.timezone || typeof body.timezone !== 'string' || body.timezone.trim().length < 3) {
            return { error: 'A valid timezone is required.' };
        }
        value.timezone = body.timezone.trim();
    }

    if (body.is_active !== undefined) {
        value.is_active = !!body.is_active;
    }

    return { value };
}

module.exports = router;
