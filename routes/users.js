// routes/users.js
'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { v4: uuid } = require('uuid');
const { run, get, all } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// GET /api/users — scoped by org for non-super-admin
router.get('/', authenticate, requireRole('super_admin', 'org_admin', 'analyst'), (req, res) => {
  try {
    const { dept, role, risk, search } = req.query;
    let sql = `
      SELECT u.id, u.org_id, u.name, u.email, u.role, u.department,
             u.avatar, u.risk_score, u.last_active, u.created_at,
             o.name AS org_name,
             COUNT(DISTINCT ump.id) AS completed_modules,
             COUNT(DISTINCT oma.module_id) AS assigned_modules
      FROM users u
      LEFT JOIN organizations o ON o.id = u.org_id
      LEFT JOIN user_module_progress ump ON ump.user_id = u.id AND ump.completed = 1
      LEFT JOIN org_module_assignments oma ON oma.org_id = u.org_id
      WHERE u.role != 'super_admin'
    `;
    const params = [];

    if (req.user.role !== 'super_admin') {
      sql += ' AND u.org_id = ?'; params.push(req.user.org_id);
    }
    if (dept)   { sql += ' AND u.department = ?';              params.push(dept); }
    if (role)   { sql += ' AND u.role = ?';                    params.push(role); }
    if (search) { sql += ' AND (u.name LIKE ? OR u.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (risk === 'critical') sql += ' AND u.risk_score < 40';
    if (risk === 'high')     sql += ' AND u.risk_score BETWEEN 40 AND 59';

    sql += ' GROUP BY u.id ORDER BY u.risk_score ASC';

    const users = all(sql, params);
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users — org admin creates an employee
router.post('/', authenticate, requireRole('super_admin', 'org_admin'), [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('role').optional().isIn(['employee', 'org_admin', 'analyst']),
  body('department').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, password, role = 'employee', department } = req.body;
  const orgId = req.user.role === 'super_admin' ? (req.body.org_id || null) : req.user.org_id;

  try {
    if (get('SELECT id FROM users WHERE email = ?', [email]))
      return res.status(409).json({ error: 'Email already exists' });

    const id = uuid();
    const passwordHash = await bcrypt.hash(password, 12);
    const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    run(
      `INSERT INTO users (id, org_id, name, email, password_hash, role, department, avatar, risk_score, last_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 50, datetime('now'))`,
      [id, orgId, name, email, passwordHash, role, department || null, avatar]
    );

    const user = get(
      'SELECT id, org_id, name, email, role, department, avatar, risk_score, created_at FROM users WHERE id = ?',
      [id]
    );
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// GET /api/users/:id
router.get('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  // Can view own profile or within org (admin/analyst)
  if (req.user.id !== id && req.user.role === 'employee')
    return res.status(403).json({ error: 'Access denied' });

  try {
    const user = get(`
      SELECT u.id, u.org_id, u.name, u.email, u.role, u.department,
             u.avatar, u.risk_score, u.last_active, u.created_at,
             o.name AS org_name
      FROM users u
      LEFT JOIN organizations o ON o.id = u.org_id
      WHERE u.id = ?
    `, [id]);

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.user.role !== 'super_admin' && user.org_id !== req.user.org_id)
      return res.status(403).json({ error: 'Access denied' });

    // Progress on all assigned modules
    const progress = all(`
      SELECT tm.id, tm.title, tm.category, tm.difficulty,
             COALESCE(ump.progress, 0) AS progress,
             COALESCE(ump.completed, 0) AS completed,
             ump.started_at, ump.completed_at
      FROM org_module_assignments oma
      JOIN training_modules tm ON tm.id = oma.module_id
      LEFT JOIN user_module_progress ump ON ump.module_id = tm.id AND ump.user_id = ?
      WHERE oma.org_id = ?
    `, [id, user.org_id]);

    // Certificates
    const certs = all(`
      SELECT c.*, tm.title AS module_title, tm.category
      FROM certificates c
      JOIN training_modules tm ON tm.id = c.module_id
      WHERE c.user_id = ?
      ORDER BY c.issued_at DESC
    `, [id]);

    // Simulation involvement
    const simEvents = all(`
      SELECT s.name, s.type, se.event_type, se.occurred_at
      FROM simulation_events se
      JOIN simulations s ON s.id = se.sim_id
      WHERE se.user_id = ?
      ORDER BY se.occurred_at DESC LIMIT 10
    `, [id]);

    res.json({ user, progress, certs, simEvents });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PUT /api/users/:id
router.put('/:id', authenticate, [
  body('name').optional().trim().notEmpty(),
  body('department').optional().trim(),
  body('role').optional().isIn(['employee', 'org_admin', 'analyst']),
], (req, res) => {
  const { id } = req.params;
  if (req.user.id !== id && !['super_admin', 'org_admin'].includes(req.user.role))
    return res.status(403).json({ error: 'Access denied' });

  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const user = get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && user.org_id !== req.user.org_id)
      return res.status(403).json({ error: 'Access denied' });

    const { name, department, role } = req.body;
    // Only super_admin/org_admin can change role
    const newRole = ['super_admin', 'org_admin'].includes(req.user.role) ? (role || user.role) : user.role;

    run(`UPDATE users SET
      name = COALESCE(?, name),
      department = COALESCE(?, department),
      role = ?
      WHERE id = ?`,
      [name || null, department || null, newRole, id]
    );
    const updated = get(
      'SELECT id, org_id, name, email, role, department, avatar, risk_score, created_at FROM users WHERE id = ?',
      [id]
    );
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', authenticate, requireRole('super_admin', 'org_admin'), (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  try {
    const user = get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && user.org_id !== req.user.org_id)
      return res.status(403).json({ error: 'Access denied' });
    run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// POST /api/users/:id/recalculate-risk — recalculate a user's risk score
router.post('/:id/recalculate-risk', authenticate, requireRole('super_admin', 'org_admin', 'analyst'), (req, res) => {
  const { id } = req.params;
  try {
    const { completed, assigned } = get(`
      SELECT
        COUNT(DISTINCT CASE WHEN ump.completed = 1 THEN ump.module_id END) AS completed,
        COUNT(DISTINCT oma.module_id) AS assigned
      FROM users u
      LEFT JOIN org_module_assignments oma ON oma.org_id = u.org_id
      LEFT JOIN user_module_progress ump ON ump.user_id = u.id
      WHERE u.id = ?
    `, [id]) || { completed: 0, assigned: 0 };

    const clickEvents = get(`
      SELECT COUNT(*) AS count
      FROM simulation_events se WHERE se.user_id = ? AND se.event_type = 'clicked'
    `, [id]);

    const { avgScore } = get(`
      SELECT COALESCE(AVG(qr.score), 50) AS avgScore
      FROM quiz_results qr WHERE qr.user_id = ?
    `, [id]) || { avgScore: 50 };

    const completionRate = assigned > 0 ? (completed / assigned) : 0;
    const clickPenalty   = (clickEvents?.count || 0) * 10;
    const rawScore = Math.round(
      (completionRate * 50) + (avgScore * 0.4) - clickPenalty
    );
    const risk_score = Math.max(0, Math.min(100, rawScore));

    run('UPDATE users SET risk_score = ? WHERE id = ?', [risk_score, id]);
    res.json({ risk_score });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Risk calculation failed' });
  }
});

module.exports = router;
