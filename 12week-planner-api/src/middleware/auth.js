const jwt = require('jsonwebtoken');
const db = require('../db');

// 驗證 JWT，確認用戶已登入
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: '請先登入' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await db.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (!result.rows.length) return res.status(401).json({ error: '用戶不存在' });

    const user = result.rows[0];
    if (user.status === 'suspended') return res.status(403).json({ error: '帳號已被停用' });
    if (user.status === 'pending') return res.status(403).json({ error: 'pending', message: '等待管理員審核' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token 無效或已過期' });
  }
}

// 驗證管理員權限
async function requireAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    if (!req.user.is_admin) return res.status(403).json({ error: '需要管理員權限' });
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
