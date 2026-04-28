/**
 * INBEX — AI Reply Service
 * Calls Groq API directly for AI email reply generation.
 * Falls back to rule-based templates if the API is unavailable.
 */
'use strict';

const config = require('../config');

// ── Groq API endpoint (OpenAI-compatible) ──
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const FALLBACK_TEMPLATES = {
    HR: 'Dear HR Team,\n\nThank you for your message. Your request has been received and will be processed within 2 business days. A formal confirmation will be sent once reviewed.\n\nBest regards,\nINBEX Automated Response',
    Finance: 'Dear Team,\n\nThank you for the communication. The financial details have been logged in our accounts payable system. Payment will be processed as per our standard 30-day payment terms.\n\nBest regards,\nFinance Team',
    Work: 'Hi,\n\nThank you for reaching out. I have received your message and will review the details. I will respond with a full update by end of business today.\n\nBest regards,\nAlex',
    Personal: 'Hey!\n\nThanks for getting in touch! I\'ll get back to you very soon.\n\nBest,\nAlex',
    Spam: '[This email has been classified as SPAM by the INBEX AI system and has been quarantined. No reply is recommended.]\n\nIf you believe this is a mistake, please review the classification in your INBEX dashboard.',
};

const SYSTEM_PROMPTS = {
    HR: 'You are a professional HR email assistant. Write a concise, polite reply to the following HR-related email. Keep it under 120 words. Use formal business language.',
    Finance: 'You are a professional finance team email assistant. Write a concise reply to the following finance-related email. Keep it under 120 words. Be precise and formal.',
    Work: 'You are a professional workplace email assistant. Write a concise reply to the following work email. Keep it under 100 words. Be friendly yet professional.',
    Personal: 'You are helping write a friendly, casual reply to a personal email. Keep it warm, brief, and natural. Under 80 words.',
    Spam: 'This email has been classified as spam. Write a brief message indicating it was quarantined. Under 50 words.',
};

/**
 * Generate an AI reply using the Groq API.
 * @param {string} emailText
 * @param {string} category
 * @returns {Promise<{reply: string, source: string}>}
 */
async function generateReply(emailText, category) {
    // If no API key configured, use fallback immediately
    if (!config.groqApiKey || config.groqApiKey === 'your-groq-api-key-here') {
        console.log(`[AI] Groq API key not set — using fallback template for category=${category}`);
        return { reply: getFallbackReply(category), source: 'template' };
    }

    const systemPrompt = SYSTEM_PROMPTS[category] || SYSTEM_PROMPTS.Work;

    const payload = {
        model: config.groqModel,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Write a professional reply to this email:\n\n${emailText.substring(0, 2000)}` },
        ],
        max_tokens: 300,
        temperature: 0.7,
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const resp = await fetch(GROQ_API_URL, {
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
            const replyText = (data.choices?.[0]?.message?.content || '').trim();
            if (replyText) {
                console.log(`[AI] ✅ AI reply generated via Groq (${config.groqModel}) for category=${category}`);
                return { reply: replyText, source: 'ai' };
            }
            console.warn('[AI] Groq API returned empty reply — using fallback');
        } else {
            const errText = await resp.text().catch(() => '');
            console.warn(`[AI] Groq API error ${resp.status}: ${errText.substring(0, 200)} — using fallback`);
        }
        return { reply: getFallbackReply(category), source: 'template' };
    } catch (err) {
        if (err.name === 'AbortError') {
            console.warn('[AI] Groq API timed out — using fallback template');
        } else {
            console.error(`[AI] Groq API call failed: ${err.message} — using fallback`);
        }
        return { reply: getFallbackReply(category), source: 'template' };
    }
}

/**
 * Return the rule-based fallback template for a category.
 */
function getFallbackReply(category) {
    return FALLBACK_TEMPLATES[category] || FALLBACK_TEMPLATES.Work;
}

module.exports = { generateReply, getFallbackReply };
