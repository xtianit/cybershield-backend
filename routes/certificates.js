// routes/certificates.js
'use strict';
const router = require('express').Router();
const { get, all } = require('../db');
const { authenticate } = require('../middleware/auth');

// GET /api/certificates — list user's certificates (or org-wide for admin)
router.get('/', authenticate, (req, res) => {
  try {
    let sql, params;

    if (['super_admin', 'org_admin', 'analyst'].includes(req.user.role)) {
      // Org admins see all org certificates
      sql = `
        SELECT c.*, u.name AS user_name, u.email, u.department, u.avatar,
               tm.title AS module_title, tm.category
        FROM certificates c
        JOIN users u ON u.id = c.user_id
        JOIN training_modules tm ON tm.id = c.module_id
        WHERE 1=1
      `;
      params = [];
      if (req.user.role !== 'super_admin') {
        sql += ' AND u.org_id = ?';
        params.push(req.user.org_id);
      }
      if (req.query.userId) {
        sql += ' AND c.user_id = ?';
        params.push(req.query.userId);
      }
    } else {
      // Employees see their own certs
      sql = `
        SELECT c.*, tm.title AS module_title, tm.category
        FROM certificates c
        JOIN training_modules tm ON tm.id = c.module_id
        WHERE c.user_id = ?
      `;
      params = [req.user.id];
    }

    sql += ' ORDER BY c.issued_at DESC';
    const certs = all(sql, params);
    res.json(certs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch certificates' });
  }
});

// GET /api/certificates/:id — single cert
router.get('/:id', authenticate, (req, res) => {
  try {
    const cert = get(`
      SELECT c.*, u.name AS user_name, u.email, u.org_id,
             o.name AS org_name,
             tm.title AS module_title, tm.category, tm.difficulty
      FROM certificates c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN organizations o ON o.id = u.org_id
      JOIN training_modules tm ON tm.id = c.module_id
      WHERE c.id = ?
    `, [req.params.id]);

    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    // Access control
    if (req.user.id !== cert.user_id &&
        req.user.role !== 'super_admin' &&
        req.user.org_id !== cert.org_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(cert);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch certificate' });
  }
});

module.exports = router;

// ─── Reports routes ───────────────────────────────────────────────────────────
// routes/reports.js
const reportsRouter = require('express').Router();
const { requireRole } = require('../middleware/auth');

// GET /api/reports/platform — super admin platform analytics
reportsRouter.get('/platform', authenticate, requireRole('super_admin'), (req, res) => {
  try {
    const overview = get(`
      SELECT
        COUNT(DISTINCT o.id) AS total_orgs,
        COUNT(DISTINCT u.id) AS total_users,
        COUNT(DISTINCT CASE WHEN u.risk_score < 40 THEN u.id END) AS critical_users,
        ROUND(AVG(u.risk_score), 1) AS platform_avg_score,
        COUNT(DISTINCT ump.id) AS total_completions,
        COUNT(DISTINCT c.id) AS total_certs
      FROM organizations o
      LEFT JOIN users u ON u.org_id = o.id AND u.role != 'super_admin'
      LEFT JOIN user_module_progress ump ON ump.user_id = u.id AND ump.completed = 1
      LEFT JOIN certificates c ON c.user_id = u.id
    `);

    const orgLeaderboard = all(`
      SELECT o.id, o.name, o.plan,
        COUNT(DISTINCT u.id) AS users,
        ROUND(AVG(u.risk_score), 0) AS score,
        COUNT(DISTINCT CASE WHEN ump.completed = 1 THEN ump.id END) AS completions
      FROM organizations o
      LEFT JOIN users u ON u.org_id = o.id AND u.role != 'super_admin'
      LEFT JOIN user_module_progress ump ON ump.user_id = u.id
      GROUP BY o.id
      ORDER BY score DESC
    `);

    const modulePopularity = all(`
      SELECT tm.title, tm.category,
        COUNT(DISTINCT ump.user_id) AS enrolled,
        COUNT(DISTINCT CASE WHEN ump.completed = 1 THEN ump.user_id END) AS completed,
        ROUND(AVG(qr.score), 0) AS avg_quiz_score
      FROM training_modules tm
      LEFT JOIN user_module_progress ump ON ump.module_id = tm.id
      LEFT JOIN quizzes q ON q.module_id = tm.id
      LEFT JOIN quiz_results qr ON qr.quiz_id = q.id
      GROUP BY tm.id
      ORDER BY enrolled DESC
    `);

    const simStats = get(`
      SELECT
        COUNT(DISTINCT s.id) AS campaigns,
        COUNT(DISTINCT CASE WHEN se.event_type = 'clicked' THEN se.id END) AS total_clicks,
        ROUND(
          100.0 * COUNT(DISTINCT CASE WHEN se.event_type = 'clicked' THEN se.user_id END) /
          NULLIF(COUNT(DISTINCT CASE WHEN se.event_type = 'sent' THEN se.user_id END), 0),
          1
        ) AS avg_click_rate
      FROM simulations s
      LEFT JOIN simulation_events se ON se.sim_id = s.id
    `);

    res.json({ overview, orgLeaderboard, modulePopularity, simStats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// GET /api/reports/org — org-level analytics
reportsRouter.get('/org', authenticate, requireRole('super_admin', 'org_admin', 'analyst'), (req, res) => {
  const orgId = req.user.org_id || req.query.orgId;
  if (!orgId) return res.status(400).json({ error: 'orgId required' });

  try {
    const overview = get(`
      SELECT
        COUNT(DISTINCT u.id) AS total_employees,
        ROUND(AVG(u.risk_score), 0) AS avg_score,
        COUNT(DISTINCT CASE WHEN u.risk_score < 40 THEN u.id END) AS critical_count,
        COUNT(DISTINCT CASE WHEN u.risk_score >= 80 THEN u.id END) AS safe_count,
        COUNT(DISTINCT ump.id) AS completions,
        COUNT(DISTINCT c.id) AS certs_issued
      FROM users u
      LEFT JOIN user_module_progress ump ON ump.user_id = u.id AND ump.completed = 1
      LEFT JOIN certificates c ON c.user_id = u.id
      WHERE u.org_id = ? AND u.role != 'super_admin'
    `, [orgId]);

    const deptBreakdown = all(`
      SELECT department,
        COUNT(*) AS count,
        ROUND(AVG(risk_score), 0) AS avg_score,
        COUNT(CASE WHEN risk_score < 40 THEN 1 END) AS critical,
        COUNT(CASE WHEN risk_score >= 80 THEN 1 END) AS safe
      FROM users
      WHERE org_id = ? AND role != 'super_admin' AND department IS NOT NULL
      GROUP BY department ORDER BY avg_score DESC
    `, [orgId]);

    const moduleCompletion = all(`
      SELECT tm.title, tm.category,
        COUNT(DISTINCT u.id) AS assigned,
        COUNT(DISTINCT CASE WHEN ump.completed = 1 THEN ump.user_id END) AS completed,
        ROUND(AVG(qr.score), 0) AS avg_score
      FROM org_module_assignments oma
      JOIN training_modules tm ON tm.id = oma.module_id
      JOIN users u ON u.org_id = oma.org_id AND u.role = 'employee'
      LEFT JOIN user_module_progress ump ON ump.module_id = tm.id AND ump.user_id = u.id
      LEFT JOIN quizzes q ON q.module_id = tm.id
      LEFT JOIN quiz_results qr ON qr.quiz_id = q.id AND qr.user_id = u.id
      WHERE oma.org_id = ?
      GROUP BY tm.id
    `, [orgId]);

    const categoryScores = all(`
      SELECT tm.category,
        ROUND(AVG(qr.score), 0) AS avg_score,
        COUNT(DISTINCT qr.id) AS attempts
      FROM quiz_results qr
      JOIN quizzes q ON q.id = qr.quiz_id
      JOIN training_modules tm ON tm.id = q.module_id
      JOIN users u ON u.id = qr.user_id
      WHERE u.org_id = ?
      GROUP BY tm.category
    `, [orgId]);

    const topRisk = all(`
      SELECT id, name, email, department, risk_score, avatar, last_active
      FROM users WHERE org_id = ? AND role = 'employee'
      ORDER BY risk_score ASC LIMIT 5
    `, [orgId]);

    res.json({ overview, deptBreakdown, moduleCompletion, categoryScores, topRisk });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// GET /api/reports/user/:userId — per-user report
reportsRouter.get('/user/:userId', authenticate, (req, res) => {
  const { userId } = req.params;
  if (req.user.id !== userId && !['super_admin', 'org_admin', 'analyst'].includes(req.user.role))
    return res.status(403).json({ error: 'Access denied' });

  try {
    const user = get(`
      SELECT u.id, u.name, u.email, u.department, u.avatar, u.risk_score, u.last_active,
             o.name AS org_name
      FROM users u LEFT JOIN organizations o ON o.id = u.org_id
      WHERE u.id = ?
    `, [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const quizHistory = all(`
      SELECT qr.score, qr.passed, qr.submitted_at, tm.title, tm.category
      FROM quiz_results qr
      JOIN quizzes q ON q.id = qr.quiz_id
      JOIN training_modules tm ON tm.id = q.module_id
      WHERE qr.user_id = ?
      ORDER BY qr.submitted_at DESC
    `, [userId]);

    const simHistory = all(`
      SELECT s.name, s.type, se.event_type, se.occurred_at
      FROM simulation_events se
      JOIN simulations s ON s.id = se.sim_id
      WHERE se.user_id = ?
      ORDER BY se.occurred_at DESC
    `, [userId]);

    res.json({ user, quizHistory, simHistory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = { certificates: router, reports: reportsRouter };
