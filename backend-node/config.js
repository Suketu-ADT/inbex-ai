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

    // Groq API (legacy / fallback)
    groqApiKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

    // ── OpenRouter (Unified AI Gateway) ──
    // One key → access to NVIDIA, OpenAI, Google, Qwen, and 300+ models
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    openRouterSiteUrl: process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
    openRouterSiteName: process.env.OPENROUTER_SITE_NAME || 'INBEX',

    // AI Model assignments per task (all free tier on OpenRouter)
    models: {
        // Google Gemma 3 27B — fast summarization
        summarize:     process.env.MODEL_SUMMARIZE      || 'google/gemma-3-27b-it:free',
        // NVIDIA Nemotron Super — natural conversational replies
        smartReply:    process.env.MODEL_SMART_REPLY    || 'nvidia/nemotron-super-49b-v1:free',
        // OpenAI GPT-4o — highest quality email drafting
        compose:       process.env.MODEL_COMPOSE        || 'openai/gpt-4o:free',
        // Qwen3 Coder 480B — strong reasoning for classification fallback
        classify:      process.env.MODEL_CLASSIFY       || 'qwen/qwen3-coder-480b-a35b:free',
        // Qwen3 Coder 480B — complex natural language inbox queries
        chat:          process.env.MODEL_CHAT           || 'qwen/qwen3-coder-480b-a35b:free',
        // NVIDIA Nemotron — urgency analysis
        priorityScore: process.env.MODEL_PRIORITY_SCORE || 'nvidia/nemotron-super-49b-v1:free',
        // Gemma — weekly pattern insights
        insights:      process.env.MODEL_INSIGHTS       || 'google/gemma-3-27b-it:free',
    },

    // Google OAuth (Gmail API)
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',

    // Resend (OTP email)
    resendApiKey: process.env.RESEND_API_KEY || '',
    resendFrom: process.env.RESEND_FROM_EMAIL || 'INBEX <onboarding@resend.dev>',
};

module.exports = config;
