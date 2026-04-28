/**
 * INBEX — Auth Router
 * POST /auth/signup   — Register a new user
 * POST /auth/login    — Login and get JWT
 * GET  /auth/me       — Get current user (protected)
 * GET  /auth/google   — Google OAuth Sign-In
 * GET  /auth/google/callback — Google OAuth callback
 */
'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis');
const config = require('../config');
const { run, get } = require('../database');
const requireAuth = require('../middleware/auth');

const router = Router();

// ── POST /auth/signup ──
router.post('/auth/signup', (req, res) => {
    const { name, email, password } = req.body;

    // Validation
    if (!name || name.trim().length < 2) {
        return res.status(422).json({ detail: 'Name must be at least 2 characters.' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(422).json({ detail: 'A valid email is required.' });
    }
    if (!password || password.length < 8) {
        return res.status(422).json({ detail: 'Password must be at least 8 characters.' });
    }

    // Check uniqueness
    const existing = get('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing) {
        return res.status(409).json({ detail: 'An account with this email already exists.' });
    }

    // Create user
    const id = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);
    const now = new Date().toISOString();

    run(
        'INSERT INTO users (id, name, email, hashed_password, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
        [id, name.trim(), email.trim().toLowerCase(), hashedPassword, now]
    );

    // Issue token
    const token = jwt.sign(
        { sub: id, email: email.trim().toLowerCase() },
        config.secretKey,
        { algorithm: config.algorithm, expiresIn: `${config.accessTokenExpireMinutes}m` }
    );

    const user = get('SELECT * FROM users WHERE id = ?', [id]);

    return res.status(201).json({
        access_token: token,
        token_type: 'bearer',
        user: formatUser(user),
    });
});

// ── POST /auth/login ──
router.post('/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(422).json({ detail: 'Email and password are required.' });
    }

    const user = get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);

    if (!user || !bcrypt.compareSync(password, user.hashed_password)) {
        return res.status(401).json({
            detail: 'Incorrect email or password.',
        });
    }

    if (!user.is_active) {
        return res.status(403).json({ detail: 'Account is disabled. Please contact support.' });
    }

    const token = jwt.sign(
        { sub: user.id, email: user.email },
        config.secretKey,
        { algorithm: config.algorithm, expiresIn: `${config.accessTokenExpireMinutes}m` }
    );

    return res.json({
        access_token: token,
        token_type: 'bearer',
        user: formatUser(user),
    });
});

// ── GET /auth/me ──
router.get('/auth/me', requireAuth, (req, res) => {
    return res.json(formatUser(req.user));
});

// ── GET /auth/google — Initiate Google Sign-In ──
router.get('/auth/google', (req, res) => {
    const oauth2Client = new google.auth.OAuth2(
        config.googleClientId,
        config.googleClientSecret,
        config.googleRedirectUri.replace('/auth/google/callback', '') + '/auth/google/callback'
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['openid', 'email', 'profile'],
        prompt: 'select_account',
    });

    return res.redirect(authUrl);
});

// ── GET /auth/google/callback — Handle Google OAuth callback ──
// If `state` is present, this is a Gmail connect callback — pass to gmail router
router.get('/auth/google/callback', async (req, res, next) => {
    const { code, state } = req.query;
    if (!code) {
        return res.status(400).send('Missing authorization code.');
    }
    // Gmail connect flow passes userId as state — let gmail.js handle it
    if (state) {
        return next('router');
    }

    try {
        const oauth2Client = new google.auth.OAuth2(
            config.googleClientId,
            config.googleClientSecret,
            config.googleRedirectUri.replace('/auth/google/callback', '') + '/auth/google/callback'
        );

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Get user profile from Google
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data: profile } = await oauth2.userinfo.get();

        const email = profile.email.toLowerCase();
        const name = profile.name || email.split('@')[0];

        // Find or create user
        let user = get('SELECT * FROM users WHERE email = ?', [email]);

        if (!user) {
            const id = uuidv4();
            const now = new Date().toISOString();
            // Create user with random password (Google users don't need one)
            const randomPw = bcrypt.hashSync(uuidv4(), 10);
            run(
                'INSERT INTO users (id, name, email, hashed_password, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
                [id, name, email, randomPw, now]
            );
            user = get('SELECT * FROM users WHERE id = ?', [id]);
            console.log(`[Auth] ✅ New Google user created: ${email}`);
        } else {
            console.log(`[Auth] ✅ Google user signed in: ${email}`);
        }

        // Issue JWT
        const token = jwt.sign(
            { sub: user.id, email: user.email },
            config.secretKey,
            { algorithm: config.algorithm, expiresIn: `${config.accessTokenExpireMinutes}m` }
        );

        const userData = formatUser(user);

        // Return a page that stores the token in localStorage and redirects
        return res.send(`
<!DOCTYPE html>
<html><head><title>Signing in...</title></head>
<body style="background:#040714;color:white;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
<div style="text-align:center;">
    <h2>✅ Signed in as ${name}</h2>
    <p style="opacity:0.6;">Redirecting to dashboard...</p>
</div>
<script>
    localStorage.setItem('inbex-token', ${JSON.stringify(token)});
    localStorage.setItem('inbex-user', ${JSON.stringify(JSON.stringify(userData))});
    localStorage.setItem('inbexAuth', 'true');
    setTimeout(function() { window.location.href = '/dashboard.html'; }, 1000);
</script>
</body></html>
        `);
    } catch (err) {
        console.error('[Auth] Google callback error:', err);
        return res.redirect(`/index.html?error=${encodeURIComponent('Google sign-in failed: ' + err.message)}`);
    }
});

// ── Helper ──
function formatUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        is_active: !!user.is_active,
        created_at: user.created_at,
    };
}

module.exports = router;
