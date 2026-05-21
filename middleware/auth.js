// middleware/auth.js
'use strict';
const jwt = require('jsonwebtoken');
const { get } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'cybershield-dev-secret-change-in-prod';

// Verify JWT and attach user to req
const authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user    = get('SELECT * FROM users WHERE id = ?', [payload.sub]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Role guard factory
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ error: `Access denied — requires role: ${roles.join(' or ')}` });
  next();
};

// Org scope guard — ensures non-super-admin only sees their own org
const requireOrgScope = (req, res, next) => {
  if (req.user.role === 'super_admin') return next();
  const orgId = req.params.orgId || req.query.orgId || req.body.org_id;
  if (orgId && orgId !== req.user.org_id)
    return res.status(403).json({ error: 'Access denied — outside your organization' });
  next();
};

const signToken = (userId) =>
  jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '24h' });

module.exports = { authenticate, requireRole, requireOrgScope, signToken };