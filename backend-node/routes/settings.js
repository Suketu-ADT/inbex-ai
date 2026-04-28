/**
 * INBEX — Settings Router
 * PUT /settings/profile  — Update user profile
 * PUT /settings/password — Change password
 */
'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { run, get } = require('../database');
const requireAuth = require('../middleware/auth');

const router = Router();

router.put('/settings/profile', requireAuth, (req, res) => {
    const { name } = req.body;
    if (!name || name.trim().length < 2) return res.status(422).json({ detail: 'Name must be at least 2 characters.' });
    run('UPDATE users SET name = ? WHERE id = ?', [name.trim(), req.user.id]);
    const updated = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    return res.json({ id: updated.id, name: updated.name, email: updated.email, is_active: !!updated.is_active, created_at: updated.created_at });
});

router.put('/settings/password', requireAuth, (req, res) => {
    const { current_password, new_password } = req.body;
    if (!current_password || current_password.length < 8) return res.status(422).json({ detail: 'Current password is required (min 8 chars).' });
    if (!new_password || new_password.length < 8) return res.status(422).json({ detail: 'New password must be at least 8 characters.' });
    if (!bcrypt.compareSync(current_password, req.user.hashed_password)) return res.status(400).json({ detail: 'Current password is incorrect.' });
    run('UPDATE users SET hashed_password = ? WHERE id = ?', [bcrypt.hashSync(new_password, 10), req.user.id]);
    return res.status(204).send();
});

module.exports = router;
