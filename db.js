// db.js — Database layer using Node 22 built-in SQLite
'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'cybershield.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys
db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA foreign_keys=ON');

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS organizations (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    plan        TEXT NOT NULL DEFAULT 'Starter',
    status      TEXT NOT NULL DEFAULT 'active',
    industry    TEXT,
    size        INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    org_id       TEXT REFERENCES organizations(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'employee',
    department   TEXT,
    avatar       TEXT,
    risk_score   INTEGER DEFAULT 50,
    last_active  TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS training_modules (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT,
    category    TEXT NOT NULL,
    duration    TEXT,
    difficulty  TEXT DEFAULT 'Beginner',
    lessons     INTEGER DEFAULT 0,
    rating      REAL DEFAULT 0,
    status      TEXT DEFAULT 'published',
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id          TEXT PRIMARY KEY,
    module_id   TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    content     TEXT,
    video_url   TEXT,
    order_index INTEGER DEFAULT 0,
    duration    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quizzes (
    id          TEXT PRIMARY KEY,
    module_id   TEXT NOT NULL UNIQUE REFERENCES training_modules(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    pass_score  INTEGER DEFAULT 70,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quiz_questions (
    id           TEXT PRIMARY KEY,
    quiz_id      TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question     TEXT NOT NULL,
    options      TEXT NOT NULL,
    answer_index INTEGER NOT NULL,
    order_index  INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_module_progress (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_id    TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
    progress     INTEGER DEFAULT 0,
    completed    INTEGER DEFAULT 0,
    started_at   TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    UNIQUE(user_id, module_id)
  );

  CREATE TABLE IF NOT EXISTS quiz_results (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quiz_id      TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    score        INTEGER NOT NULL,
    passed       INTEGER NOT NULL,
    answers      TEXT,
    submitted_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS simulations (
    id          TEXT PRIMARY KEY,
    org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'Phishing',
    status      TEXT DEFAULT 'draft',
    template    TEXT,
    target_dept TEXT,
    created_by  TEXT REFERENCES users(id),
    launched_at TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS simulation_events (
    id          TEXT PRIMARY KEY,
    sim_id      TEXT NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    user_id     TEXT REFERENCES users(id),
    event_type  TEXT NOT NULL,
    metadata    TEXT,
    occurred_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS certificates (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_id   TEXT NOT NULL REFERENCES training_modules(id),
    quiz_result_id TEXT REFERENCES quiz_results(id),
    score       INTEGER,
    issued_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, module_id)
  );

  CREATE TABLE IF NOT EXISTS org_module_assignments (
    id          TEXT PRIMARY KEY,
    org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    module_id   TEXT NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
    assigned_by TEXT REFERENCES users(id),
    due_date    TEXT,
    assigned_at TEXT DEFAULT (datetime('now')),
    UNIQUE(org_id, module_id)
  );
`);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const run  = (sql, params = []) => db.prepare(sql).run(...params);
const get  = (sql, params = []) => db.prepare(sql).get(...params);
const all  = (sql, params = []) => db.prepare(sql).all(...params);
const exec = (sql)              => db.exec(sql);

module.exports = { db, run, get, all, exec };
