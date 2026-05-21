// routes/modules.js
'use strict';
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { v4: uuid } = require('uuid');
const { run, get, all } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// ─── Modules ──────────────────────────────────────────────────────────────────

// GET /api/modules
router.get('/', authenticate, (req, res) => {
  try {
    const { category, status, orgId } = req.query;
    const scopeOrgId = orgId || req.user.org_id;

    let sql = `
      SELECT tm.*,
        COUNT(DISTINCT l.id) AS lesson_count,
        COALESCE(ump.progress, 0) AS user_progress,
        COALESCE(ump.completed, 0) AS user_completed,
        CASE WHEN oma.org_id IS NOT NULL THEN 1 ELSE 0 END AS assigned_to_org,
        completed_count.cnt AS completed_users,
        enrolled_count.cnt AS enrolled_users
      FROM training_modules tm
      LEFT JOIN lessons l ON l.module_id = tm.id
      LEFT JOIN user_module_progress ump ON ump.module_id = tm.id AND ump.user_id = ?
      LEFT JOIN org_module_assignments oma ON oma.module_id = tm.id AND oma.org_id = ?
      LEFT JOIN (
        SELECT module_id, COUNT(*) AS cnt
        FROM user_module_progress WHERE completed = 1 GROUP BY module_id
      ) completed_count ON completed_count.module_id = tm.id
      LEFT JOIN (
        SELECT module_id, COUNT(*) AS cnt
        FROM user_module_progress GROUP BY module_id
      ) enrolled_count ON enrolled_count.module_id = tm.id
      WHERE 1=1
    `;
    const params = [req.user.id, scopeOrgId || ''];

    if (category) { sql += ' AND tm.category = ?'; params.push(category); }
    if (status)   { sql += ' AND tm.status = ?';   params.push(status); }
    else if (req.user.role === 'employee') { sql += " AND tm.status = 'published'"; }

    sql += ' GROUP BY tm.id ORDER BY tm.created_at DESC';

    const modules = all(sql, params);
    res.json(modules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

// POST /api/modules — admin/super_admin
router.post('/', authenticate, requireRole('super_admin', 'org_admin'), [
  body('title').trim().notEmpty(),
  body('category').isIn(['Phishing', 'Password Security', 'Social Engineering', 'Data Protection', 'Incident Response', 'Compliance']),
  body('description').optional().trim(),
  body('difficulty').optional().isIn(['Beginner', 'Intermediate', 'Advanced']),
  body('duration').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, description, category, difficulty = 'Beginner', duration, status = 'draft' } = req.body;
  try {
    const id = uuid();
    run(
      `INSERT INTO training_modules (id, title, description, category, difficulty, duration, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, description || null, category, difficulty, duration || null, status, req.user.id]
    );

    // Auto-assign to org if org_admin creates it
    if (req.user.org_id) {
      run(
        'INSERT OR IGNORE INTO org_module_assignments (id, org_id, module_id, assigned_by) VALUES (?, ?, ?, ?)',
        [uuid(), req.user.org_id, id, req.user.id]
      );
    }

    res.status(201).json(get('SELECT * FROM training_modules WHERE id = ?', [id]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create module' });
  }
});

// GET /api/modules/:id
router.get('/:id', authenticate, (req, res) => {
  try {
    const module = get(`
      SELECT tm.*,
        COALESCE(ump.progress, 0) AS user_progress,
        COALESCE(ump.completed, 0) AS user_completed,
        ump.started_at, ump.completed_at
      FROM training_modules tm
      LEFT JOIN user_module_progress ump ON ump.module_id = tm.id AND ump.user_id = ?
      WHERE tm.id = ?
    `, [req.user.id, req.params.id]);

    if (!module) return res.status(404).json({ error: 'Module not found' });

    const lessons = all(
      'SELECT * FROM lessons WHERE module_id = ? ORDER BY order_index ASC',
      [req.params.id]
    );
    const quiz = get('SELECT id, title, pass_score FROM quizzes WHERE module_id = ?', [req.params.id]);

    res.json({ ...module, lessons, quiz });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch module' });
  }
});

// PUT /api/modules/:id
router.put('/:id', authenticate, requireRole('super_admin', 'org_admin'), [
  body('title').optional().trim().notEmpty(),
  body('status').optional().isIn(['draft', 'published', 'archived']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const mod = get('SELECT * FROM training_modules WHERE id = ?', [req.params.id]);
    if (!mod) return res.status(404).json({ error: 'Not found' });

    const { title, description, category, difficulty, duration, status } = req.body;
    run(`UPDATE training_modules SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      category = COALESCE(?, category),
      difficulty = COALESCE(?, difficulty),
      duration = COALESCE(?, duration),
      status = COALESCE(?, status)
      WHERE id = ?`,
      [title||null, description||null, category||null, difficulty||null, duration||null, status||null, req.params.id]
    );
    res.json(get('SELECT * FROM training_modules WHERE id = ?', [req.params.id]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// DELETE /api/modules/:id
router.delete('/:id', authenticate, requireRole('super_admin'), (req, res) => {
  try {
    const mod = get('SELECT id FROM training_modules WHERE id = ?', [req.params.id]);
    if (!mod) return res.status(404).json({ error: 'Not found' });
    run('DELETE FROM training_modules WHERE id = ?', [req.params.id]);
    res.json({ message: 'Module deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// POST /api/modules/:id/assign — assign module to org
router.post('/:id/assign', authenticate, requireRole('super_admin', 'org_admin'), (req, res) => {
  const orgId = req.body.org_id || req.user.org_id;
  if (!orgId) return res.status(400).json({ error: 'org_id required' });
  try {
    run(
      'INSERT OR IGNORE INTO org_module_assignments (id, org_id, module_id, assigned_by, due_date) VALUES (?, ?, ?, ?, ?)',
      [uuid(), orgId, req.params.id, req.user.id, req.body.due_date || null]
    );
    res.json({ message: 'Module assigned' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Assignment failed' });
  }
});

// ─── Lessons ─────────────────────────────────────────────────────────────────

// GET /api/modules/:id/lessons
router.get('/:id/lessons', authenticate, (req, res) => {
  const lessons = all(
    'SELECT * FROM lessons WHERE module_id = ? ORDER BY order_index ASC',
    [req.params.id]
  );
  res.json(lessons);
});

// POST /api/modules/:id/lessons
router.post('/:id/lessons', authenticate, requireRole('super_admin', 'org_admin'), [
  body('title').trim().notEmpty(),
  body('content').optional().trim(),
  body('order_index').optional().isInt({ min: 0 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, content, video_url, order_index = 0, duration } = req.body;
  try {
    const id = uuid();
    run(
      'INSERT INTO lessons (id, module_id, title, content, video_url, order_index, duration) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, req.params.id, title, content || null, video_url || null, order_index, duration || null]
    );
    // Update lesson count on module
    run(
      'UPDATE training_modules SET lessons = (SELECT COUNT(*) FROM lessons WHERE module_id = ?) WHERE id = ?',
      [req.params.id, req.params.id]
    );
    res.status(201).json(get('SELECT * FROM lessons WHERE id = ?', [id]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add lesson' });
  }
});

// PUT /api/modules/:id/lessons/:lessonId
router.put('/:id/lessons/:lessonId', authenticate, requireRole('super_admin', 'org_admin'), (req, res) => {
  const { lessonId } = req.params;
  const { title, content, video_url, order_index, duration } = req.body;
  try {
    run(`UPDATE lessons SET
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      video_url = COALESCE(?, video_url),
      order_index = COALESCE(?, order_index),
      duration = COALESCE(?, duration)
      WHERE id = ? AND module_id = ?`,
      [title||null, content||null, video_url||null, order_index!=null?order_index:null, duration||null, lessonId, req.params.id]
    );
    res.json(get('SELECT * FROM lessons WHERE id = ?', [lessonId]));
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// ─── Progress tracking ────────────────────────────────────────────────────────

// PUT /api/modules/:id/progress
router.put('/:id/progress', authenticate, [
  body('progress').isInt({ min: 0, max: 100 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { progress } = req.body;
  const completed = progress >= 100 ? 1 : 0;
  try {
    const progressId = uuid();
    run(`
      INSERT INTO user_module_progress (id, user_id, module_id, progress, completed, completed_at)
      VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END)
      ON CONFLICT(user_id, module_id) DO UPDATE SET
        progress = excluded.progress,
        completed = excluded.completed,
        completed_at = CASE WHEN excluded.completed = 1 THEN datetime('now') ELSE completed_at END
    `, [progressId, req.user.id, req.params.id, progress, completed, completed]);

    // Recalculate risk score
    const { cnt: completedCount } = get(
      'SELECT COUNT(*) AS cnt FROM user_module_progress WHERE user_id = ? AND completed = 1',
      [req.user.id]
    );
    const { cnt: assignedCount } = get(`
      SELECT COUNT(*) AS cnt FROM org_module_assignments WHERE org_id = (
        SELECT org_id FROM users WHERE id = ?
      )
    `, [req.user.id]);

    const completionRate = assignedCount > 0 ? completedCount / assignedCount : 0;
    const newRisk = Math.min(100, Math.round(40 + completionRate * 50));
    run('UPDATE users SET risk_score = ? WHERE id = ?', [newRisk, req.user.id]);

    res.json({ progress, completed: !!completed, risk_score: newRisk });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Progress update failed' });
  }
});

// ─── Quiz ─────────────────────────────────────────────────────────────────────

// GET /api/modules/:id/quiz
router.get('/:id/quiz', authenticate, (req, res) => {
  try {
    const quiz = get('SELECT * FROM quizzes WHERE module_id = ?', [req.params.id]);
    if (!quiz) return res.status(404).json({ error: 'No quiz for this module' });

    const questions = all(
      'SELECT id, question, options, order_index FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC',
      [quiz.id]
    ).map(q => ({ ...q, options: JSON.parse(q.options) }));

    // Previous result (if any)
    const lastResult = get(
      'SELECT score, passed, submitted_at FROM quiz_results WHERE user_id = ? AND quiz_id = ? ORDER BY submitted_at DESC LIMIT 1',
      [req.user.id, quiz.id]
    );

    res.json({ quiz: { id: quiz.id, title: quiz.title, pass_score: quiz.pass_score }, questions, lastResult });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch quiz' });
  }
});

// POST /api/modules/:id/quiz — create or update quiz (admin)
router.post('/:id/quiz', authenticate, requireRole('super_admin', 'org_admin'), [
  body('title').trim().notEmpty(),
  body('pass_score').optional().isInt({ min: 1, max: 100 }),
  body('questions').isArray({ min: 1 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, pass_score = 70, questions } = req.body;
  try {
    let quiz = get('SELECT * FROM quizzes WHERE module_id = ?', [req.params.id]);

    if (quiz) {
      run('UPDATE quizzes SET title = ?, pass_score = ? WHERE id = ?', [title, pass_score, quiz.id]);
      run('DELETE FROM quiz_questions WHERE quiz_id = ?', [quiz.id]);
    } else {
      const quizId = uuid();
      run('INSERT INTO quizzes (id, module_id, title, pass_score) VALUES (?, ?, ?, ?)',
        [quizId, req.params.id, title, pass_score]);
      quiz = get('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    }

    questions.forEach((q, i) => {
      run(
        'INSERT INTO quiz_questions (id, quiz_id, question, options, answer_index, order_index) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), quiz.id, q.question, JSON.stringify(q.options), q.answer_index, i]
      );
    });

    res.json({ message: 'Quiz saved', quiz_id: quiz.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save quiz' });
  }
});

// POST /api/modules/:id/quiz/submit
router.post('/:id/quiz/submit', authenticate, [
  body('answers').isObject(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { answers } = req.body; // { questionId: selectedIndex }
  try {
    const quiz = get('SELECT * FROM quizzes WHERE module_id = ?', [req.params.id]);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const questions = all('SELECT * FROM quiz_questions WHERE quiz_id = ?', [quiz.id]);

    let correct = 0;
    const feedback = questions.map(q => {
      const userAnswer = answers[q.id];
      const isCorrect = parseInt(userAnswer) === q.answer_index;
      if (isCorrect) correct++;
      return {
        questionId: q.id,
        question: q.question,
        userAnswer: parseInt(userAnswer),
        correctAnswer: q.answer_index,
        isCorrect,
      };
    });

    const score  = Math.round((correct / questions.length) * 100);
    const passed = score >= quiz.pass_score ? 1 : 0;

    const resultId = uuid();
    run(
      'INSERT INTO quiz_results (id, user_id, quiz_id, score, passed, answers) VALUES (?, ?, ?, ?, ?, ?)',
      [resultId, req.user.id, quiz.id, score, passed, JSON.stringify(answers)]
    );

    // If passed, issue certificate
    let certificate = null;
    if (passed) {
      const existingCert = get('SELECT id FROM certificates WHERE user_id = ? AND module_id = ?',
        [req.user.id, req.params.id]);

      if (!existingCert) {
        const certId = uuid();
        run(
          'INSERT INTO certificates (id, user_id, module_id, quiz_result_id, score) VALUES (?, ?, ?, ?, ?)',
          [certId, req.user.id, req.params.id, resultId, score]
        );
        certificate = get('SELECT * FROM certificates WHERE id = ?', [certId]);
      }

      // Mark module as completed
      run(`
        INSERT INTO user_module_progress (id, user_id, module_id, progress, completed, completed_at)
        VALUES (?, ?, ?, 100, 1, datetime('now'))
        ON CONFLICT(user_id, module_id) DO UPDATE SET progress=100, completed=1, completed_at=datetime('now')
      `, [uuid(), req.user.id, req.params.id]);
    }

    // Recalculate risk score
    const { cnt: completedCount } = get(
      'SELECT COUNT(*) AS cnt FROM user_module_progress WHERE user_id = ? AND completed = 1',
      [req.user.id]
    ) || { cnt: 0 };
    const clickPenalty = (get(`
      SELECT COUNT(*) AS cnt FROM simulation_events WHERE user_id = ? AND event_type = 'clicked'
    `, [req.user.id])?.cnt || 0) * 8;
    const avgQuizScore = get(
      'SELECT COALESCE(AVG(score), 50) AS avg FROM quiz_results WHERE user_id = ?',
      [req.user.id]
    )?.avg || 50;

    const newRisk = Math.max(0, Math.min(100, Math.round(
      (completedCount * 10) + (avgQuizScore * 0.4) - clickPenalty
    )));
    run('UPDATE users SET risk_score = ? WHERE id = ?', [newRisk, req.user.id]);

    res.json({ score, passed: !!passed, feedback, certificate, risk_score: newRisk });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Submission failed' });
  }
});

module.exports = router;
