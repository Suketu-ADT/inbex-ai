/**
 * INBEX — Calendar Service
 * Detects meeting-related emails and auto-creates Google Calendar events.
 * Uses Groq AI to both verify it's a real meeting AND extract details.
 */
'use strict';

const { google } = require('googleapis');
const config = require('../config');
const { getGmailClient } = require('./gmailService');

// ── STRONG meeting indicators (must appear in subject line) ──
const SUBJECT_STRONG = [
    'meeting', 'sync', 'standup', 'stand-up', 'catch up', 'catch-up',
    'one-on-one', '1:1', '1-on-1', 'huddle', 'kickoff', 'kick-off',
    'appointment', 'scheduled', 'calendar invite',
];

// ── Supporting indicators (body) ──
const BODY_INDICATORS = [
    'join the meeting', 'join zoom', 'join google meet', 'join teams',
    'meeting link', 'conference room', 'dial-in',
    'agenda:', 'agenda for', 'meeting details',
    'please join', 'you are invited', 'rsvp',
    'meet.google.com', 'zoom.us', 'teams.microsoft.com', 'webex.com',
];

/**
 * Check if an email is actually about a real, schedulable meeting.
 * Much stricter than before — requires strong subject keywords
 * OR a meeting link / explicit invite language.
 */
function isMeetingEmail(subject, body) {
    const subjectLower = (subject || '').toLowerCase();
    const bodyLower = (body || '').toLowerCase();

    // Check 1: Strong keyword in subject
    const hasSubjectMatch = SUBJECT_STRONG.some(kw => subjectLower.includes(kw));

    // Check 2: Meeting link or invite language in body
    const hasBodyMatch = BODY_INDICATORS.some(kw => bodyLower.includes(kw));

    // Must have BOTH a subject keyword AND body indicator, OR subject keyword + explicit time
    if (hasSubjectMatch && hasBodyMatch) return true;

    // Or: subject has meeting keyword + body has a clear time reference
    if (hasSubjectMatch) {
        const hasTimeRef = /\b\d{1,2}[:.]\d{2}\s*(am|pm)\b/i.test(bodyLower) ||
                           /\b(at|from)\s+\d{1,2}\s*(am|pm|:\d{2})/i.test(bodyLower);
        if (hasTimeRef) return true;
    }

    // Or: body has meeting link (very strong signal regardless of subject)
    const hasMeetingLink = /(meet\.google\.com|zoom\.us\/j|teams\.microsoft\.com|webex\.com)/i.test(bodyLower);
    if (hasMeetingLink) return true;

    return false;
}

/**
 * Use Groq AI to verify meeting AND extract details.
 */
async function extractMeetingDetails(emailText) {
    if (!config.groqApiKey || config.groqApiKey === 'your-groq-api-key-here') {
        return extractMeetingDetailsFallback(emailText);
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0];

    const payload = {
        model: config.groqModel,
        messages: [
            {
                role: 'system',
                content: `You extract meeting/event details from emails. Today is ${todayStr}. Tomorrow is ${tomorrowStr}.

IMPORTANT: First determine if this email is about a REAL, SPECIFIC meeting or event with a date and time.
Newsletters, job postings, marketing emails, and general announcements are NOT meetings.

Return ONLY valid JSON:
{
  "is_meeting": true/false,
  "title": "Meeting title",
  "date": "YYYY-MM-DD",
  "start_time": "HH:MM (24h format)",
  "end_time": "HH:MM (24h, default +1hr from start)",
  "location": "Location or video link or null",
  "attendees": ["email@example.com"],
  "description": "Brief description"
}

If is_meeting is false, only return {"is_meeting": false}.
Return ONLY the JSON, no markdown, no explanation.`
            },
            {
                role: 'user',
                content: emailText.substring(0, 3000)
            }
        ],
        max_tokens: 400,
        temperature: 0.1,
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (resp.ok) {
            const data = await resp.json();
            const content = (data.choices?.[0]?.message?.content || '').trim();
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const details = JSON.parse(jsonMatch[0]);

                // AI says it's NOT a meeting → skip
                if (details.is_meeting === false) {
                    console.log(`[Calendar] AI says NOT a meeting, skipping.`);
                    return null;
                }

                // Validate required fields
                if (!details.date || !details.start_time || details.date === 'null') {
                    console.log(`[Calendar] AI returned incomplete details, skipping.`);
                    return null;
                }

                console.log(`[Calendar] ✅ AI confirmed meeting: "${details.title}" on ${details.date}`);
                return details;
            }
        }
        console.warn('[Calendar] AI extraction failed, trying fallback');
        return extractMeetingDetailsFallback(emailText);
    } catch (err) {
        console.warn('[Calendar] AI error:', err.message);
        return extractMeetingDetailsFallback(emailText);
    }
}

/**
 * Basic regex-based meeting detail extraction (fallback).
 */
function extractMeetingDetailsFallback(emailText) {
    const lines = emailText.split('\n');
    const subjectLine = lines.find(l => l.toLowerCase().startsWith('subject:'));
    const title = subjectLine ? subjectLine.replace(/^subject:\s*/i, '').trim() : 'Meeting';

    // Must find an explicit time, otherwise don't create event
    const timeMatch = emailText.match(/\b(\d{1,2})[:\.](\d{2})\s*(am|pm|AM|PM)\b/) ||
                      emailText.match(/\bat\s+(\d{1,2})\s*(am|pm|AM|PM)\b/);

    if (!timeMatch) {
        // No explicit time found — can't create a useful calendar event
        return null;
    }

    let startHour = parseInt(timeMatch[1]);
    let startMin = timeMatch[2] && !isNaN(parseInt(timeMatch[2])) ? parseInt(timeMatch[2]) : 0;
    const period = (timeMatch[3] || timeMatch[2] || '').toLowerCase();
    if (period === 'pm' && startHour < 12) startHour += 12;
    if (period === 'am' && startHour === 12) startHour = 0;

    const now = new Date();
    let meetingDate = new Date(now);
    if (/tomorrow/i.test(emailText)) {
        meetingDate.setDate(meetingDate.getDate() + 1);
    } else if (/next\s+week/i.test(emailText)) {
        meetingDate.setDate(meetingDate.getDate() + 7);
    }

    // Try to find explicit date like "5th May", "May 5", "2025-05-05"
    const dateMatch = emailText.match(/\b(\d{1,2})\s*(st|nd|rd|th)?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s*(\d{4})?\b/i) ||
                      emailText.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2})\s*,?\s*(\d{4})?\b/i);
    if (dateMatch) {
        try {
            const parsed = new Date(dateMatch[0]);
            if (!isNaN(parsed.getTime())) meetingDate = parsed;
        } catch (e) { /* use default */ }
    }

    const dateStr = meetingDate.toISOString().split('T')[0];
    const startTime = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
    const endHour = startHour + 1;
    const endTime = `${String(endHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;

    const emailRegex = /[\w.+-]+@[\w.-]+\.\w{2,}/g;
    const attendees = [...new Set((emailText.match(emailRegex) || []))].slice(0, 10);

    return {
        is_meeting: true,
        title,
        date: dateStr,
        start_time: startTime,
        end_time: endTime,
        location: null,
        attendees,
        description: `Auto-created by INBEX from email: ${title}`,
    };
}

/**
 * Create a Google Calendar event for a user.
 */
async function createCalendarEvent(userId, details) {
    const gmailClient = await getGmailClient(userId);
    if (!gmailClient) {
        console.warn('[Calendar] Cannot create event — Google not connected');
        return null;
    }

    const calendar = google.calendar({ version: 'v3', auth: gmailClient.client });

    const startDateTime = `${details.date}T${details.start_time}:00`;
    const endDateTime = `${details.date}T${details.end_time}:00`;

    const event = {
        summary: details.title || 'Meeting',
        description: details.description || 'Auto-created by INBEX AI',
        start: {
            dateTime: startDateTime,
            timeZone: 'Asia/Kolkata',
        },
        end: {
            dateTime: endDateTime,
            timeZone: 'Asia/Kolkata',
        },
        reminders: {
            useDefault: false,
            overrides: [{ method: 'popup', minutes: 10 }],
        },
    };

    if (details.location) event.location = details.location;

    if (details.attendees && details.attendees.length > 0) {
        event.attendees = details.attendees
            .filter(e => e && e.includes('@'))
            .map(email => ({ email }));
    }

    try {
        const result = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
            sendUpdates: 'none',
        });

        console.log(`[Calendar] ✅ Event created: "${details.title}" on ${details.date} at ${details.start_time}`);
        return {
            eventId: result.data.id,
            htmlLink: result.data.htmlLink,
            title: details.title,
            date: details.date,
            start_time: details.start_time,
            end_time: details.end_time,
        };
    } catch (err) {
        console.error('[Calendar] ❌ Failed to create event:', err.message);
        return null;
    }
}

/**
 * Full pipeline: detect meeting → verify with AI → create event.
 */
async function processEmailForMeeting(userId, subject, body, from) {
    const fullText = `Subject: ${subject}\nFrom: ${from}\n\n${body}`;

    if (!isMeetingEmail(subject, body)) {
        return null;
    }

    console.log(`[Calendar] 📅 Potential meeting: "${subject}" — verifying with AI...`);

    const details = await extractMeetingDetails(fullText);
    if (!details) {
        return null;
    }

    if (!details.date || !details.start_time) {
        console.warn('[Calendar] Missing date/time, skipping');
        return null;
    }

    const event = await createCalendarEvent(userId, details);
    return event;
}

module.exports = { isMeetingEmail, extractMeetingDetails, createCalendarEvent, processEmailForMeeting };
