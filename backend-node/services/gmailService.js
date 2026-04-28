/**
 * INBEX — Gmail Service
 * Handles Google OAuth 2.0 flow and Gmail API interactions.
 * Supports: read emails, send emails, token management.
 */
'use strict';

const { google } = require('googleapis');
const config = require('../config');
const { run, get } = require('../database');

// Google API scopes — Gmail read + send + Calendar events
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Create a new OAuth2 client instance.
 */
function createOAuth2Client() {
    return new google.auth.OAuth2(
        config.googleClientId,
        config.googleClientSecret,
        config.googleRedirectUri
    );
}

/**
 * Generate the Google OAuth consent URL.
 * @param {string} userId — INBEX user ID (passed as state for security)
 * @returns {string} The authorization URL
 */
function getAuthUrl(userId) {
    const client = createOAuth2Client();
    return client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: userId,
        prompt: 'select_account consent',
    });
}

/**
 * Exchange the authorization code for tokens and store them.
 * @param {string} code — The auth code from Google callback
 * @param {string} userId — INBEX user ID
 * @returns {Promise<{email: string}>}
 */
async function handleCallback(code, userId) {
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get the user's Gmail email address
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    const gmailEmail = userInfo.data.email;

    // Store tokens in DB
    const existing = get('SELECT refresh_token FROM gmail_tokens WHERE user_id = ?', [userId]);
    if (existing) {
        const refreshToken = tokens.refresh_token || existing.refresh_token || '';
        run(
            'UPDATE gmail_tokens SET access_token = ?, refresh_token = ?, token_expiry = ?, gmail_email = ? WHERE user_id = ?',
            [tokens.access_token, refreshToken, tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : '', gmailEmail, userId]
        );
    } else {
        run(
            'INSERT INTO gmail_tokens (user_id, access_token, refresh_token, token_expiry, gmail_email) VALUES (?, ?, ?, ?, ?)',
            [userId, tokens.access_token, tokens.refresh_token || '', tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : '', gmailEmail]
        );
    }

    return { email: gmailEmail };
}

/**
 * Get an authenticated Gmail client for a user.
 * Auto-refreshes expired tokens.
 * @param {string} userId
 * @returns {Promise<{gmail: object, client: object}|null>}
 */
async function getGmailClient(userId) {
    const tokenRow = get('SELECT * FROM gmail_tokens WHERE user_id = ?', [userId]);
    if (!tokenRow || !tokenRow.refresh_token) return null;

    const client = createOAuth2Client();
    client.setCredentials({
        access_token: tokenRow.access_token,
        refresh_token: tokenRow.refresh_token,
        expiry_date: tokenRow.token_expiry ? new Date(tokenRow.token_expiry).getTime() : 0,
    });

    // Auto-refresh if expired
    client.on('tokens', (tokens) => {
        run(
            'UPDATE gmail_tokens SET access_token = ?, token_expiry = ? WHERE user_id = ?',
            [tokens.access_token, tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : '', userId]
        );
    });

    const gmail = google.gmail({ version: 'v1', auth: client });
    return { gmail, client };
}

/**
 * Fetch emails from the user's Gmail inbox.
 * @param {string} userId
 * @param {number} maxResults — max emails to fetch (default 25)
 * @param {string} query — Gmail search query (default: inbox)
 * @param {string|null} pageToken — token for next page of results
 * @returns {Promise<{emails: Array, nextPageToken: string|null}>}
 */
async function fetchEmails(userId, maxResults = 25, query = 'in:inbox', pageToken = null) {
    const gmailClient = await getGmailClient(userId);
    if (!gmailClient) throw new Error('Gmail not connected');

    const { gmail } = gmailClient;

    // List message IDs
    const listParams = { userId: 'me', maxResults, q: query };
    if (pageToken) listParams.pageToken = pageToken;

    const listResp = await gmail.users.messages.list(listParams);

    const messages = listResp.data.messages || [];
    const nextPageToken = listResp.data.nextPageToken || null;
    if (messages.length === 0) return { emails: [], nextPageToken: null };

    // Fetch full details for each message
    const emails = [];
    for (const msg of messages) {
        try {
            const detail = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'full',
            });
            emails.push(parseEmail(detail.data));
        } catch (err) {
            console.warn(`[Gmail] Failed to fetch message ${msg.id}:`, err.message);
        }
    }

    return { emails, nextPageToken };
}

/**
 * Parse a Gmail API message into a clean object.
 */
function parseEmail(message) {
    const headers = message.payload?.headers || [];
    const getHeader = (name) => {
        const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
        return h ? h.value : '';
    };

    // Extract body text
    let body = '';
    const payload = message.payload;

    if (payload.body?.data) {
        body = decodeBase64(payload.body.data);
    } else if (payload.parts) {
        // Multipart — find text/plain first, then text/html
        const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
        const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');

        if (textPart?.body?.data) {
            body = decodeBase64(textPart.body.data);
        } else if (htmlPart?.body?.data) {
            body = decodeBase64(htmlPart.body.data);
        }

        // Check nested parts (multipart/alternative inside multipart/mixed)
        if (!body) {
            for (const part of payload.parts) {
                if (part.parts) {
                    const nestedText = part.parts.find((p) => p.mimeType === 'text/plain');
                    if (nestedText?.body?.data) {
                        body = decodeBase64(nestedText.body.data);
                        break;
                    }
                    const nestedHtml = part.parts.find((p) => p.mimeType === 'text/html');
                    if (nestedHtml?.body?.data) {
                        body = decodeBase64(nestedHtml.body.data);
                        break;
                    }
                }
            }
        }
    }

    // Always strip HTML just in case
    body = stripHtml(body);

    return {
        id: message.id,
        threadId: message.threadId,
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        snippet: message.snippet || '',
        body: body.substring(0, 5000), // Cap at 5000 chars
        labels: message.labelIds || [],
        isUnread: (message.labelIds || []).includes('UNREAD'),
    };
}

/**
 * Send an email via Gmail.
 * @param {string} userId
 * @param {string} to — Recipient email
 * @param {string} subject — Email subject
 * @param {string} body — Email body (plain text)
 * @param {string} [threadId] — Optional thread ID for replies
 * @param {string} [inReplyTo] — Optional Message-ID for threading
 */
async function sendEmail(userId, to, subject, body, threadId, inReplyTo) {
    const gmailClient = await getGmailClient(userId);
    if (!gmailClient) throw new Error('Gmail not connected');

    const { gmail } = gmailClient;
    const tokenRow = get('SELECT gmail_email FROM gmail_tokens WHERE user_id = ?', [userId]);
    const fromEmail = tokenRow?.gmail_email || 'me';

    // Build RFC 2822 email
    let rawEmail = `From: ${fromEmail}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n`;
    if (inReplyTo) {
        rawEmail += `In-Reply-To: ${inReplyTo}\r\nReferences: ${inReplyTo}\r\n`;
    }
    rawEmail += `\r\n${body}`;

    // Base64url encode
    const encoded = Buffer.from(rawEmail).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const sendParams = { userId: 'me', requestBody: { raw: encoded } };
    if (threadId) sendParams.requestBody.threadId = threadId;

    const result = await gmail.users.messages.send(sendParams);
    return { messageId: result.data.id, threadId: result.data.threadId };
}

/**
 * Check if Gmail is connected for a user.
 */
function getStatus(userId) {
    const row = get('SELECT gmail_email FROM gmail_tokens WHERE user_id = ?', [userId]);
    return {
        connected: !!row && !!row.gmail_email,
        email: row?.gmail_email || null,
    };
}

/**
 * Disconnect Gmail — remove stored tokens.
 */
function disconnect(userId) {
    run('DELETE FROM gmail_tokens WHERE user_id = ?', [userId]);
}

// ── Helpers ──
function decodeBase64(data) {
    if (!data) return '';
    // Handle URL-safe base64 and standard base64
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
}

function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

module.exports = { getAuthUrl, handleCallback, fetchEmails, sendEmail, getStatus, disconnect, getGmailClient };
