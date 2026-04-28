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
 * Generate a new email from scratch based on a user prompt.
 * @param {string} prompt
 * @returns {Promise<{subject: string, body: string, source: string}>}
 */
async function generateCompose(prompt) {
    if (!config.groqApiKey || config.groqApiKey === 'your-groq-api-key-here') {
        return { 
            subject: 'Draft from INBEX', 
            body: 'AI key not set. Please configure your Groq API key.', 
            source: 'template' 
        };
    }

    const payload = {
        model: config.groqModel,
        messages: [
            { 
                role: 'system', 
                content: 'You are an expert email assistant. Generate a professional email based on the user request. Output your response as a JSON object with "subject" and "body" keys only. Do not include any other text.' 
            },
            { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0.7,
    };

    try {
        const resp = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (resp.ok) {
            const data = await resp.json();
            const contentText = data.choices?.[0]?.message?.content || '{}';
            const content = JSON.parse(contentText);
            return {
                subject: content.subject || 'Draft from INBEX',
                body: content.body || '',
                source: 'ai'
            };
        }
    } catch (err) {
        console.error('[AI Compose] Error:', err);
    }

    return { 
        subject: 'Draft from INBEX', 
        body: 'Failed to generate content. Please try again.', 
        source: 'template' 
    };
}

/**
 * Generate a concise, flashcard-style summary of an email.
 * @param {string} emailText
 * @returns {Promise<string>}
 */
async function generateSummary(emailText) {
    if (!config.groqApiKey || config.groqApiKey === 'your-groq-api-key-here') {
        return 'AI key not set. Summary unavailable.';
    }

    // Strip any remaining HTML to clean up the input for Groq
    const cleanText = emailText.replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    console.log("[AI Summary] Extracted Email Content:", cleanText);

    if (cleanText.length < 50) {
        console.warn("[AI Summary] Content too short for summary:", cleanText.length);
        return 'Email content too short to provide a meaningful summary.';
    }

    console.log("Sending to Groq:", cleanText.slice(0, 200));

    const payload = {
        model: config.groqModel,
        messages: [
            { 
                role: 'system', 
                content: 'You are an email summarizer. Provide a concise, human-friendly summary of the email in flashcard format. DO NOT include any raw code, HTML tags, or technical snippets. Use 3-5 plain text bullet points for key actions. Keep it under 60 words. Focus on the core message.' 
            },
            { role: 'user', content: `Summarize the following email into 3-5 key bullet points in flashcard format:\n\n${cleanText.substring(0, 3000)}` },
        ],
        max_tokens: 150,
        temperature: 0.5,
    };

    try {
        const resp = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (resp.ok) {
            const data = await resp.json();
            let content = (data.choices?.[0]?.message?.content || '').trim();
            // Post-process: strip markdown code blocks and backticks
            content = content.replace(/```[\s\S]*?```/g, ''); // Remove code blocks
            content = content.replace(/`([^`]+)`/g, '$1');    // Remove inline backticks but keep text
            return content || 'Summary unavailable.';
        }
    } catch (err) {
        console.error('[AI Summary] Error:', err);
    }

    return 'Failed to generate summary.';
}

/**
 * Return the rule-based fallback template for a category.
 */
function getFallbackReply(category) {
    return FALLBACK_TEMPLATES[category] || FALLBACK_TEMPLATES.Work;
}

module.exports = { generateReply, getFallbackReply, generateCompose, generateSummary };
