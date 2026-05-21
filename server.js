// server.js — CyberShield API Server
'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
const { certificates: certsRouter, reports: reportsRouter } = require('./routes/certificates');

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/modules',       require('./routes/modules'));
app.use('/api/simulations',   require('./routes/simulations'));
app.use('/api/certificates',  certsRouter);
app.use('/api/reports',       reportsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🛡️  CyberShield API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
