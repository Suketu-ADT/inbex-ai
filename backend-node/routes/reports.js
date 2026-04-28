/**
 * INBEX — Reports Router
 * GET /reports/summary    — Full analytics breakdown
 * GET /reports/categories — Category distribution counts
 */
'use strict';

const { Router } = require('express');
const { get, all } = require('../database');
const requireAuth = require('../middleware/auth');

const router = Router();

router.get('/reports/summary', requireAuth, (req, res) => {
    const userId = req.user.id;
    const totalRow = get('SELECT COUNT(*) as count FROM email_logs WHERE user_id = ?', [userId]);
    const total = totalRow ? totalRow.count : 0;
    const triggeredRow = get('SELECT COUNT(*) as count FROM email_logs WHERE user_id = ? AND workflow_triggered = 1', [userId]);
    const triggered = triggeredRow ? triggeredRow.count : 0;
    const automationRate = total > 0 ? parseFloat(((triggered / total) * 100).toFixed(1)) : 0;
    const avgRow = get('SELECT AVG(confidence) as avg_conf FROM email_logs WHERE user_id = ?', [userId]);
    const avgConfidence = parseFloat((((avgRow && avgRow.avg_conf) || 0) * 100).toFixed(1));
    const catRows = all('SELECT predicted_category, COUNT(*) as count FROM email_logs WHERE user_id = ? GROUP BY predicted_category ORDER BY count DESC', [userId]);
    const categories = {};
    for (const row of catRows) categories[row.predicted_category] = row.count;
    return res.json({ total_emails_processed: total, automation_success_rate: automationRate, avg_confidence_pct: avgConfidence, categories });
});

router.get('/reports/categories', requireAuth, (req, res) => {
    const rows = all('SELECT predicted_category, COUNT(*) as count, AVG(confidence) as avg_confidence FROM email_logs WHERE user_id = ? GROUP BY predicted_category', [req.user.id]);
    return res.json(rows.map(r => ({ category: r.predicted_category, count: r.count, avg_confidence: parseFloat(((r.avg_confidence || 0) * 100).toFixed(1)) })));
});

module.exports = router;
