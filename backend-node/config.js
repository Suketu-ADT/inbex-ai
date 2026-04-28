/**
 * INBEX — Application Configuration
 * Loads all settings from environment variables / .env file
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    // App
    appName: process.env.APP_NAME || 'INBEX',
    debug: process.env.DEBUG === 'true',
    port: parseInt(process.env.PORT, 10) || 3000,

    // JWT
    secretKey: process.env.SECRET_KEY || 'change-this-secret-key-in-production',
    algorithm: process.env.ALGORITHM || 'HS256',
    accessTokenExpireMinutes: parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES, 10) || 60,

    // Groq API (direct)
    groqApiKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

    // Google OAuth (Gmail API)
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
};

module.exports = config;
