const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

// 後台首頁 - 統計數字
router.get('/stats', async (req, res) => {
  try {
    const [pending, approved, suspended, total] = await Promise.all([
      db.query("SELECT COUNT(*) FROM users WHERE status = 'pending'"),
      db.query("SELECT COUNT(*) FROM users WHERE status = 'approved'"),
      db.query("SELECT COUNT(*) FROM users WHERE status = 'suspended'"),
      db.query('SELECT COUNT(*) FROM users'),
    ]);
    res.json({
      pending: parseInt(pending.rows[0].count),
      approved: parseInt(approved.rows[0].count),
      suspended: parseInt(suspended.rows[0].count),
      total: parseInt(total.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 待審核用戶列表
router.get('/users/pending', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, name, avatar_url, created_at, last_login_at, login_count
       FROM users WHERE status = 'pending' ORDER BY created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 全部用戶列表
router.get('/users', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.name, u.avatar_url, u.status, u.is_admin,
              u.created_at, u.last_login_at, u.login_count,
              COUNT(DISTINCT p.id) AS plan_count
       FROM users u
       LEFT JOIN plans p ON p.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 核准用戶
router.post('/users/:id/approve', async (req, res) => {
  try {
    const result = await db.query(
      "UPDATE users SET status = 'approved' WHERE id = $1 RETURNING id, email, status",
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: '用戶不存在' });
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 拒絕（刪除）待審核用戶
router.post('/users/:id/reject', async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = $1 AND status = $2', [req.params.id, 'pending']);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 停用用戶
router.post('/users/:id/suspend', async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: '不能停用自己' });
    }
    const result = await db.query(
      "UPDATE users SET status = 'suspended' WHERE id = $1 RETURNING id, email, status",
      [req.params.id]
    );
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 恢復用戶
router.post('/users/:id/restore', async (req, res) => {
  try {
    const result = await db.query(
      "UPDATE users SET status = 'approved' WHERE id = $1 RETURNING id, email, status",
      [req.params.id]
    );
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 永久刪除用戶（連資料一起）
router.delete('/users/:id', async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: '不能刪除自己' });
    }
    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
