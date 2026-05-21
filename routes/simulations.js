// routes/simulations.js
'use strict';
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { v4: uuid } = require('uuid');
const { run, get, all } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// GET /api/simulations — list campaigns for org
router.get('/', authenticate, requireRole('super_admin', 'org_admin', 'analyst'), (req, res) => {
  try {
    const orgId = req.user.role === 'super_admin' ? (req.query.orgId || null) : req.user.org_id;

    let sql = `
      SELECT s.*,
        u.name AS created_by_name,
        COUNT(DISTINCT CASE WHEN se.event_type = 'sent' THEN se.user_id END) AS sent,
        COUNT(DISTINCT CASE WHEN se.event_type = 'opened' THEN se.user_id END) AS opened,
        COUNT(DISTINCT CASE WHEN se.event_type = 'clicked' THEN se.user_id END) AS clicked,
        COUNT(DISTINCT CASE WHEN se.event_type = 'submitted' THEN se.user_id END) AS submitted
      FROM simulations s
      LEFT JOIN users u ON u.id = s.created_by
      LEFT JOIN simulation_events se ON se.sim_id = s.id
      WHERE 1=1
    `;
    const params = [];
    if (orgId) { sql += ' AND s.org_id = ?'; params.push(orgId); }
    sql += ' GROUP BY s.id ORDER BY s.created_at DESC';

    const sims = all(sql, params);
    res.json(sims);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch simulations' });
  }
});

// POST /api/simulations — create a campaign
router.post('/', authenticate, requireRole('super_admin', 'org_admin'), [
  body('name').trim().notEmpty(),
  body('type').isIn(['Phishing', 'Spear Phishing', 'Whaling', 'Smishing', 'Vishing']),
  body('template').optional().trim(),
  body('target_dept').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const orgId = req.user.org_id || req.body.org_id;
  if (!orgId) return res.status(400).json({ error: 'org_id required' });

  const { name, type, template, target_dept } = req.body;
  try {
    const id = uuid();
    run(
      'INSERT INTO simulations (id, org_id, name, type, status, template, target_dept, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, orgId, name, type, 'draft', template || null, target_dept || null, req.user.id]
    );
    res.status(201).json(get('SELECT * FROM simulations WHERE id = ?', [id]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create simulation' });
  }
});

// GET /api/simulations/:id
router.get('/:id', authenticate, (req, res) => {
  try {
    const sim = get('SELECT * FROM simulations WHERE id = ?', [req.params.id]);
    if (!sim) return res.status(404).json({ error: 'Simulation not found' });

    if (req.user.role !== 'super_admin' && sim.org_id !== req.user.org_id)
      return res.status(403).json({ error: 'Access denied' });

    // Per-user breakdown
    const userBreakdown = all(`
      SELECT u.name, u.email, u.department, u.avatar,
        MAX(CASE WHEN se.event_type = 'sent' THEN 1 ELSE 0 END) AS sent,
        MAX(CASE WHEN se.event_type = 'opened' THEN 1 ELSE 0 END) AS opened,
        MAX(CASE WHEN se.event_type = 'clicked' THEN 1 ELSE 0 END) AS clicked,
        MAX(CASE WHEN se.event_type = 'submitted' THEN 1 ELSE 0 END) AS submitted
      FROM users u
      JOIN simulation_events se ON se.user_id = u.id AND se.sim_id = ?
      GROUP BY u.id
      ORDER BY u.department, u.name
    `, [req.params.id]);

    // Timeline of events
    const timeline = all(`
      SELECT event_type, COUNT(*) AS count,
        strftime('%H', occurred_at) AS hour
      FROM simulation_events WHERE sim_id = ?
      GROUP BY event_type, hour ORDER BY hour ASC
    `, [req.params.id]);

    // Summary counts
    const summary = get(`
      SELECT
        COUNT(DISTINCT CASE WHEN event_type = 'sent' THEN user_id END) AS sent,
        COUNT(DISTINCT CASE WHEN event_type = 'opened' THEN user_id END) AS opened,
        COUNT(DISTINCT CASE WHEN event_type = 'clicked' THEN user_id END) AS clicked,
        COUNT(DISTINCT CASE WHEN event_type = 'submitted' THEN user_id END) AS submitted
      FROM simulation_events WHERE sim_id = ?
    `, [req.params.id]);

    res.json({ ...sim, summary, userBreakdown, timeline });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch simulation' });
  }
});

// POST /api/simulations/:id/launch — launch campaign (creates sent events for all org users)
router.post('/:id/launch', authenticate, requireRole('super_admin', 'org_admin'), (req, res) => {
  try {
    const sim = get('SELECT * FROM simulations WHERE id = ?', [req.params.id]);
    if (!sim) return res.status(404).json({ error: 'Not found' });
    if (sim.status === 'active') return res.status(400).json({ error: 'Already launched' });

    if (req.user.role !== 'super_admin' && sim.org_id !== req.user.org_id)
      return res.status(403).json({ error: 'Access denied' });

    // Get target users
    let targetSql = 'SELECT id FROM users WHERE org_id = ? AND role = ?';
    const targetParams = [sim.org_id, 'employee'];
    if (sim.target_dept) { targetSql += ' AND department = ?'; targetParams.push(sim.target_dept); }

    const targets = all(targetSql, targetParams);
    if (targets.length === 0) return res.status(400).json({ error: 'No target users found' });

    // Create "sent" events for all targets
    for (const user of targets) {
      run(
        "INSERT INTO simulation_events (id, sim_id, user_id, event_type) VALUES (?, ?, ?, 'sent')",
        [uuid(), req.params.id, user.id]
      );
    }

    run(
      "UPDATE simulations SET status = 'active', launched_at = datetime('now') WHERE id = ?",
      [req.params.id]
    );

    res.json({ message: 'Campaign launched', targets: targets.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Launch failed' });
  }
});

// POST /api/simulations/:id/complete — complete campaign
router.post('/:id/complete', authenticate, requireRole('super_admin', 'org_admin'), (req, res) => {
  try {
    run("UPDATE simulations SET status = 'completed' WHERE id = ?", [req.params.id]);
    res.json({ message: 'Campaign completed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// POST /api/simulations/track/:simId/:event — tracking pixel / link click (no auth needed)
// Called when users interact with phishing simulation emails
router.post('/track/:simId/:event', (req, res) => {
  const { simId, event } = req.params;
  const validEvents = ['opened', 'clicked', 'submitted'];
  if (!validEvents.includes(event)) return res.status(400).json({ error: 'Invalid event' });

  const { user_id } = req.body;
  try {
    const sim = get('SELECT id, status FROM simulations WHERE id = ?', [simId]);
    if (!sim || sim.status !== 'active') return res.status(404).json({ error: 'Campaign not found' });

    // Check sent event exists for this user
    const sentEvent = get(
      "SELECT id FROM simulation_events WHERE sim_id = ? AND user_id = ? AND event_type = 'sent'",
      [simId, user_id]
    );
    if (!sentEvent) return res.status(403).json({ error: 'User not in campaign' });

    // Idempotent: don't duplicate events
    const existing = get(
      'SELECT id FROM simulation_events WHERE sim_id = ? AND user_id = ? AND event_type = ?',
      [simId, user_id, event]
    );
    if (!existing) {
      run(
        'INSERT INTO simulation_events (id, sim_id, user_id, event_type, metadata) VALUES (?, ?, ?, ?, ?)',
        [uuid(), simId, user_id, event, req.body.metadata ? JSON.stringify(req.body.metadata) : null]
      );

      // Apply risk score penalty for clicking
      if (event === 'clicked' || event === 'submitted') {
        const penalty = event === 'submitted' ? 15 : 8;
        run('UPDATE users SET risk_score = MAX(0, risk_score - ?) WHERE id = ?', [penalty, user_id]);
      }
    }

    res.json({ tracked: true, event });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Tracking failed' });
  }
});

// DELETE /api/simulations/:id
router.delete('/:id', authenticate, requireRole('super_admin', 'org_admin'), (req, res) => {
  try {
    const sim = get('SELECT * FROM simulations WHERE id = ?', [req.params.id]);
    if (!sim) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'super_admin' && sim.org_id !== req.user.org_id)
      return res.status(403).json({ error: 'Access denied' });
    run('DELETE FROM simulations WHERE id = ?', [req.params.id]);
    res.json({ message: 'Simulation deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
