/**
 * INBEX — Express Application Entry Point
 * Intelligent Email Automation API (Node.js)
 */
'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initDatabase, createAllTables } = require('./database');
const classifier = require('./services/classifierService');
const automationScheduler = require('./services/automationSchedulerService');

const app = express();

// ── Middleware ──
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '5mb' }));

// Serve frontend static files (HTML, CSS, JS) from parent directory
app.use(express.static(path.join(__dirname, '..'), {
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));

if (config.debug) {
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            console.log(`${new Date().toISOString()} | ${req.method.padEnd(7)} | ${res.statusCode} | ${req.originalUrl} | ${Date.now() - start}ms`);
        });
        next();
    });
}

// ── Health Check (no auth) ──
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', app: config.appName, version: '1.0.0', ml_model_loaded: classifier.isLoaded() });
});

// Root redirects to frontend
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// ── Register Routes (lazy — loaded after DB init) ──
let routesLoaded = false;
function loadRoutes() {
    if (routesLoaded) return;
    app.use(require('./routes/auth'));
    app.use(require('./routes/classify'));
    app.use(require('./routes/workflows'));
    app.use(require('./routes/dashboard'));
    app.use(require('./routes/reports'));
    app.use(require('./routes/settings'));
    app.use(require('./routes/gmail'));
    app.use(require('./routes/automations'));

    // 404
    app.use((req, res) => {
        res.status(404).json({ detail: `Route ${req.method} ${req.originalUrl} not found.` });
    });

    // Error handler
    app.use((err, req, res, _next) => {
        console.error('[Error]', err.stack || err.message);
        res.status(500).json({ detail: 'Internal server error.' });
    });

    routesLoaded = true;
}

// ── Startup ──
async function start() {
    console.log('🚀 INBEX Backend starting up...');

    await initDatabase();
    createAllTables();
    console.log('✅ Database tables ready');
    console.log('✅ Email classifier ready');
    automationScheduler.startScheduler();

    loadRoutes();

    app.listen(config.port, () => {
        console.log(`✅ INBEX is ready at http://127.0.0.1:${config.port}`);
        console.log(`📖 Health Check: http://127.0.0.1:${config.port}/health`);
    });
}

start().catch(err => {
    console.error('❌ Failed to start:', err);
    process.exit(1);
});

module.exports = app;
