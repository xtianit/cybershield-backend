// routes/auth.js
'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { v4: uuid } = require('uuid');
const { run, get } = require('../db');
const { authenticate, signToken } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('org_name').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, password, org_name, role = 'employee' } = req.body;

  try {
    const existing = get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    let orgId = req.body.org_id || null;

    // If registering a new org
    if (org_name && !orgId) {
      const existingOrg = get('SELECT id FROM organizations WHERE name = ?', [org_name]);
      if (existingOrg) {
        orgId = existingOrg.id;
      } else {
        orgId = uuid();
        run(
          'INSERT INTO organizations (id, name, plan, status) VALUES (?, ?, ?, ?)',
          [orgId, org_name, 'Starter', 'trial']
        );
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuid();
    const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const assignedRole = orgId ? role : 'super_admin';

    run(
      `INSERT INTO users (id, org_id, name, email, password_hash, role, avatar, risk_score, last_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [userId, orgId, name, email, passwordHash, assignedRole, avatar, 50]
    );

    const user  = get('SELECT id, org_id, name, email, role, avatar, risk_score, created_at FROM users WHERE id = ?', [userId]);
    const token = signToken(userId);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;

  try {
    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Update last_active
    run("UPDATE users SET last_active = datetime('now') WHERE id = ?", [user.id]);

    const { password_hash, ...safeUser } = user;

    // Get org details
    let org = null;
    if (user.org_id) {
      org = get('SELECT id, name, plan, status FROM organizations WHERE id = ?', [user.org_id]);
    }

    const token = signToken(user.id);
    res.json({ token, user: safeUser, org });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const { password_hash, ...safeUser } = req.user;
  let org = null;
  if (req.user.org_id) {
    org = get('SELECT id, name, plan, status, industry FROM organizations WHERE id = ?', [req.user.org_id]);
  }
  res.json({ user: safeUser, org });
});

// PUT /api/auth/password  — change own password
router.put('/password', authenticate, [
  body('current').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const valid = await bcrypt.compare(req.body.current, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

  const newHash = await bcrypt.hash(req.body.newPassword, 12);
  run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);
  res.json({ message: 'Password updated' });
});

module.exports = router;
