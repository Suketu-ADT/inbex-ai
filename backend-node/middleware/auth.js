/**
 * INBEX — Auth Middleware
 * Validates Bearer JWT tokens and attaches user to req.user.
 */
'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { get } = require('../database');

/**
 * Express middleware that validates the Authorization: Bearer <token> header.
 * On success, attaches the full user row to req.user.
 * On failure, responds with 401.
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            detail: 'Could not validate credentials. Please log in again.',
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = jwt.verify(token, config.secretKey, {
            algorithms: [config.algorithm],
        });

        const userId = payload.sub;
        if (!userId) {
            return res.status(401).json({
                detail: 'Could not validate credentials. Please log in again.',
            });
        }

        // Fetch user from DB
        const user = get('SELECT * FROM users WHERE id = ?', [userId]);

        if (!user || !user.is_active) {
            return res.status(401).json({
                detail: 'Could not validate credentials. Please log in again.',
            });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({
            detail: 'Could not validate credentials. Please log in again.',
        });
    }
}

module.exports = requireAuth;
