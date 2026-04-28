/**
 * INBEX - Email Automation Scheduler
 * Polls active daily automations and sends Gmail messages once per local day.
 */
'use strict';

const { all, run } = require('../database');
const gmailService = require('./gmailService');

let pollTimer = null;
let isTickRunning = false;

function startScheduler() {
    if (pollTimer) return;

    pollTimer = setInterval(() => {
        tick().catch((err) => {
            console.error('[AutomationScheduler] Tick failed:', err.message);
        });
    }, 30 * 1000);

    tick().catch((err) => {
        console.error('[AutomationScheduler] Initial tick failed:', err.message);
    });

    console.log('[AutomationScheduler] Started polling every 30 seconds');
}

async function tick() {
    if (isTickRunning) return;
    isTickRunning = true;

    try {
        const automations = all(
            `SELECT * FROM email_automations
             WHERE is_active = 1
             ORDER BY created_at ASC`
        );

        for (const automation of automations) {
            if (!isDueToRun(automation, new Date())) continue;

            await attemptAutomationRun(automation, { isManual: false });
        }
    } finally {
        isTickRunning = false;
    }
}

async function runAutomationNow(automation) {
    return attemptAutomationRun(automation, { isManual: true });
}

async function attemptAutomationRun(automation, { isManual }) {
    const attemptedAt = new Date().toISOString();

    run(
        `UPDATE email_automations
         SET last_attempt_at = ?, updated_at = ?
         WHERE id = ?`,
        [attemptedAt, attemptedAt, automation.id]
    );

    try {
        const result = await gmailService.sendEmail(
            automation.user_id,
            automation.recipient_email,
            automation.subject,
            automation.body
        );

        run(
            `UPDATE email_automations
             SET run_count = run_count + 1,
                 last_run_at = ?,
                 last_attempt_at = ?,
                 last_error = NULL,
                 updated_at = ?
             WHERE id = ?`,
            [attemptedAt, attemptedAt, attemptedAt, automation.id]
        );

        console.log(`[AutomationScheduler] Sent automation "${automation.name}" (${isManual ? 'manual' : 'scheduled'})`);
        return { success: true, messageId: result.messageId, threadId: result.threadId };
    } catch (err) {
        run(
            `UPDATE email_automations
             SET last_error = ?,
                 last_attempt_at = ?,
                 updated_at = ?
             WHERE id = ?`,
            [err.message, attemptedAt, attemptedAt, automation.id]
        );

        console.error(`[AutomationScheduler] Failed "${automation.name}":`, err.message);
        throw err;
    }
}

function isDueToRun(automation, now) {
    const timezone = automation.timezone || 'UTC';
    const current = getZonedParts(now, timezone);
    const today = current.dateKey;

    if (current.timeKey < automation.send_time) {
        return false;
    }

    if (automation.last_attempt_at) {
        const lastAttemptDay = getZonedParts(new Date(automation.last_attempt_at), timezone).dateKey;
        if (lastAttemptDay === today) {
            return false;
        }
    }

    return true;
}

function getAutomationPresentation(automation, now = new Date()) {
    const timezone = automation.timezone || 'UTC';
    const current = getZonedParts(now, timezone);
    const lastAttemptDay = automation.last_attempt_at
        ? getZonedParts(new Date(automation.last_attempt_at), timezone).dateKey
        : null;

    const shouldRollToTomorrow = current.timeKey >= automation.send_time || lastAttemptDay === current.dateKey;
    const nextRunDate = buildNextRunDate(timezone, automation.send_time, shouldRollToTomorrow ? 1 : 0);

    return {
        id: automation.id,
        name: automation.name,
        recipient_email: automation.recipient_email,
        subject: automation.subject,
        body: automation.body,
        send_time: automation.send_time,
        timezone,
        is_active: !!automation.is_active,
        run_count: Number(automation.run_count || 0),
        last_run_at: automation.last_run_at || null,
        last_attempt_at: automation.last_attempt_at || null,
        last_error: automation.last_error || null,
        created_at: automation.created_at,
        updated_at: automation.updated_at,
        next_run_at: automation.is_active ? nextRunDate.toISOString() : null,
    };
}

function getZonedParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    });

    const parts = Object.fromEntries(
        formatter.formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        dateKey: `${parts.year}-${parts.month}-${parts.day}`,
        timeKey: `${parts.hour}:${parts.minute}`,
    };
}

function buildNextRunDate(timeZone, hhmm, dayOffset) {
    const [hours, minutes] = hhmm.split(':').map(Number);
    const now = new Date();
    const zoned = getZonedParts(now, timeZone);
    const utcGuess = Date.UTC(zoned.year, zoned.month - 1, zoned.day + dayOffset, hours, minutes, 0, 0);
    const target = new Date(utcGuess);

    const actual = getZonedParts(target, timeZone);
    const actualMinutes = (actual.hour * 60) + actual.minute;
    const desiredMinutes = (hours * 60) + minutes;
    const diffMinutes = desiredMinutes - actualMinutes;

    return new Date(target.getTime() + (diffMinutes * 60 * 1000));
}

module.exports = {
    startScheduler,
    runAutomationNow,
    getAutomationPresentation,
};
