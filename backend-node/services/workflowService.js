/**
 * INBEX — Workflow Service (Agentic AI Core)
 * Executes the IF category = X → THEN action logic.
 */
'use strict';

const { get, run } = require('../database');

const DEFAULT_ACTIONS = {
    HR: { action: 'send_hr_response', description: 'Forward to HR team and send standard acknowledgement' },
    Finance: { action: 'tag_and_notify_finance', description: 'Tag as Finance and hold for approval. Notify finance@company.com' },
    Work: { action: 'flag_high_priority', description: 'Flag as high priority and add to Priority Inbox' },
    Personal: { action: 'route_to_personal', description: 'Route to Personal folder with low priority' },
    Spam: { action: 'quarantine_spam', description: 'Quarantine email. No reply sent.' },
};

/**
 * Find matching active workflow for the user + category, execute the action, increment run count.
 * @param {string} category
 * @param {string} userId
 * @returns {{ triggered: boolean, action: string|null, description: string|null }}
 */
function executeWorkflow(category, userId) {
    const workflow = get(
        'SELECT * FROM workflows WHERE user_id = ? AND trigger_category = ? AND is_active = 1 LIMIT 1',
        [userId, category]
    );

    if (workflow) {
        run('UPDATE workflows SET run_count = run_count + 1 WHERE id = ?', [workflow.id]);
        console.log(`[Workflow] ✅ Workflow '${workflow.name}' triggered for category=${category}`);
        return {
            triggered: true,
            action: workflow.action,
            description: workflow.action_detail || (DEFAULT_ACTIONS[category]?.description ?? null),
        };
    }

    // Use default action
    const defaultAction = DEFAULT_ACTIONS[category];
    if (defaultAction) {
        console.log(`[Workflow] ℹ️ Default action applied for category=${category}: ${defaultAction.action}`);
        return { triggered: true, action: defaultAction.action, description: defaultAction.description };
    }

    return { triggered: false, action: null, description: null };
}

module.exports = { executeWorkflow };
