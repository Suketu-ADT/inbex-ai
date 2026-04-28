/**
 * INBEX — Dashboard Router
 * GET /dashboard/stats — Aggregated stats for the main dashboard
 */
'use strict';

const { Router } = require('express');
const { get, all } = require('../database');
const requireAuth = require('../middleware/auth');

const router = Router();

// ── GET /dashboard/stats ──
router.get('/dashboard/stats', requireAuth, (req, res) => {
    const userId = req.user.id;

    // Today's start (UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // Total processed (all time)
    const totalRow = get('SELECT COUNT(*) as count FROM email_logs WHERE user_id = ?', [userId]);
    const total = totalRow ? totalRow.count : 0;

    // Automated today
    const autoTodayRow = get(
        'SELECT COUNT(*) as count FROM email_logs WHERE user_id = ? AND workflow_triggered = 1 AND created_at >= ?',
        [userId, todayISO]
    );
    const automatedToday = autoTodayRow ? autoTodayRow.count : 0;

    // Urgent emails (confidence >= 0.90 AND reply_sent = 0)
    const urgentRow = get(
        'SELECT COUNT(*) as count FROM email_logs WHERE user_id = ? AND confidence >= 0.90 AND reply_sent = 0',
        [userId]
    );
    const urgent = urgentRow ? urgentRow.count : 0;

    // Pending decisions
    const pendingRow = get(
        'SELECT COUNT(*) as count FROM email_logs WHERE user_id = ? AND workflow_triggered = 0 AND reply_sent = 0',
        [userId]
    );
    const pending = pendingRow ? pendingRow.count : 0;

    // Active workflows
    const wfRow = get(
        'SELECT COUNT(*) as count FROM workflows WHERE user_id = ? AND is_active = 1',
        [userId]
    );
    const activeWorkflows = wfRow ? wfRow.count : 0;

    // Category distribution
    const catRows = all(
        'SELECT predicted_category, COUNT(*) as count FROM email_logs WHERE user_id = ? GROUP BY predicted_category',
        [userId]
    );
    const categoryDistribution = {};
    for (const row of catRows) {
        categoryDistribution[row.predicted_category] = row.count;
    }

    return res.json({
        user_name: req.user.name,
        total_emails_processed: total,
        automated_today: automatedToday,
        urgent_emails: urgent,
        pending_decisions: pending,
        active_workflows: activeWorkflows,
        category_distribution: categoryDistribution,
    });
});

module.exports = router;
