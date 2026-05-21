// routes/organizations.js
'use strict';
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { v4: uuid } = require('uuid');
const { run, get, all } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// GET /api/organizations — super admin: all; org admin: own
router.get('/', authenticate, (req, res) => {
  try {
    if (req.user.role === 'super_admin') {
      const orgs = all(`
        SELECT o.*,
          COUNT(DISTINCT u.id) AS employee_count,
          ROUND(AVG(u.risk_score), 0) AS avg_risk_score
        FROM organizations o
        LEFT JOIN users u ON u.org_id = o.id AND u.role != 'super_admin'
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `);
      return res.json(orgs);
    }
    if (!req.user.org_id) return res.status(403).json({ error: 'No organization' });
    const org = get(`
      SELECT o.*,
        COUNT(DISTINCT u.id) AS employee_count,
        ROUND(AVG(u.risk_score), 0) AS avg_risk_score
      FROM organizations o
      LEFT JOIN users u ON u.org_id = o.id AND u.role != 'super_admin'
      WHERE o.id = ?
      GROUP BY o.id
    `, [req.user.org_id]);
    res.json(org ? [org] : []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// POST /api/organizations — super admin only
router.post('/', authenticate, requireRole('super_admin'), [
  body('name').trim().notEmpty().withMessage('Organization name required'),
  body('plan').optional().isIn(['Starter', 'Professional', 'Enterprise']),
  body('industry').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, plan = 'Starter', industry, status = 'active' } = req.body;
  try {
    const exists = get('SELECT id FROM organizations WHERE name = ?', [name]);
    if (exists) return res.status(409).json({ error: 'Organization name already exists' });

    const id = uuid();
    run(
      'INSERT INTO organizations (id, name, plan, industry, status) VALUES (?, ?, ?, ?, ?)',
      [id, name, plan, industry || null, status]
    );
    const org = get('SELECT * FROM organizations WHERE id = ?', [id]);
    res.status(201).json(org);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// GET /api/organizations/:id
router.get('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'super_admin' && req.user.org_id !== id)
    return res.status(403).json({ error: 'Access denied' });

  try {
    const org = get('SELECT * FROM organizations WHERE id = ?', [id]);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const stats = get(`
      SELECT
        COUNT(DISTINCT u.id) AS total_users,
        COUNT(DISTINCT CASE WHEN u.risk_score < 40 THEN u.id END) AS critical_users,
        COUNT(DISTINCT CASE WHEN u.risk_score >= 80 THEN u.id END) AS safe_users,
        ROUND(AVG(u.risk_score), 0) AS avg_risk_score,
        COUNT(DISTINCT ump.id) AS total_completions,
        COUNT(DISTINCT oma.module_id) AS assigned_modules
      FROM users u
      LEFT JOIN user_module_progress ump ON ump.user_id = u.id AND ump.completed = 1
      LEFT JOIN org_module_assignments oma ON oma.org_id = ?
      WHERE u.org_id = ? AND u.role != 'super_admin'
    `, [id, id]);

    res.json({ ...org, stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

// PUT /api/organizations/:id
router.put('/:id', authenticate, requireRole('super_admin', 'org_admin'), [
  body('name').optional().trim().notEmpty(),
  body('plan').optional().isIn(['Starter', 'Professional', 'Enterprise']),
  body('status').optional().isIn(['active', 'trial', 'suspended']),
], (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'super_admin' && req.user.org_id !== id)
    return res.status(403).json({ error: 'Access denied' });

  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const org = get('SELECT * FROM organizations WHERE id = ?', [id]);
    if (!org) return res.status(404).json({ error: 'Not found' });

    const { name, plan, status, industry } = req.body;
    run(`UPDATE organizations SET
      name = COALESCE(?, name),
      plan = COALESCE(?, plan),
      status = COALESCE(?, status),
      industry = COALESCE(?, industry)
      WHERE id = ?`,
      [name || null, plan || null, status || null, industry || null, id]
    );
    res.json(get('SELECT * FROM organizations WHERE id = ?', [id]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// DELETE /api/organizations/:id — super admin only
router.delete('/:id', authenticate, requireRole('super_admin'), (req, res) => {
  const { id } = req.params;
  try {
    const org = get('SELECT id FROM organizations WHERE id = ?', [id]);
    if (!org) return res.status(404).json({ error: 'Not found' });
    run('DELETE FROM organizations WHERE id = ?', [id]);
    res.json({ message: 'Organization deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// GET /api/organizations/:id/stats — detailed analytics
router.get('/:id/stats', authenticate, (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'super_admin' && req.user.org_id !== id)
    return res.status(403).json({ error: 'Access denied' });

  try {
    const riskTrend = all(`
      SELECT strftime('%Y-%m', created_at) AS month,
             ROUND(AVG(risk_score), 0) AS avg_score
      FROM users WHERE org_id = ? AND role != 'super_admin'
      GROUP BY month ORDER BY month DESC LIMIT 6
    `, [id]);

    const deptBreakdown = all(`
      SELECT department,
             COUNT(*) AS count,
             ROUND(AVG(risk_score), 0) AS avg_score,
             COUNT(CASE WHEN risk_score < 50 THEN 1 END) AS at_risk
      FROM users WHERE org_id = ? AND role != 'super_admin' AND department IS NOT NULL
      GROUP BY department
    `, [id]);

    const completionByModule = all(`
      SELECT tm.title, tm.category,
             COUNT(DISTINCT ump.user_id) AS completed,
             COUNT(DISTINCT u.id) AS enrolled
      FROM training_modules tm
      JOIN org_module_assignments oma ON oma.module_id = tm.id AND oma.org_id = ?
      JOIN users u ON u.org_id = ?
      LEFT JOIN user_module_progress ump ON ump.module_id = tm.id AND ump.user_id = u.id AND ump.completed = 1
      GROUP BY tm.id
    `, [id, id]);

    const simStats = all(`
      SELECT s.name, s.type, s.launched_at,
             COUNT(DISTINCT CASE WHEN se.event_type = 'sent' THEN se.user_id END) AS sent,
             COUNT(DISTINCT CASE WHEN se.event_type = 'opened' THEN se.user_id END) AS opened,
             COUNT(DISTINCT CASE WHEN se.event_type = 'clicked' THEN se.user_id END) AS clicked,
             COUNT(DISTINCT CASE WHEN se.event_type = 'submitted' THEN se.user_id END) AS submitted
      FROM simulations s
      LEFT JOIN simulation_events se ON se.sim_id = s.id
      WHERE s.org_id = ?
      GROUP BY s.id ORDER BY s.created_at DESC
    `, [id]);

    res.json({ riskTrend: riskTrend.reverse(), deptBreakdown, completionByModule, simStats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
