const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// 設定 Google OAuth 策略
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value;
    const googleId = profile.id;
    const name = profile.displayName;
    const avatarUrl = profile.photos?.[0]?.value || null;

    // 查看是否已存在
    let result = await db.query('SELECT * FROM users WHERE google_id = $1', [googleId]);

    if (result.rows.length === 0) {
      // 第一次登入：新增用戶
      // 如果是 ADMIN_EMAIL，直接設為管理員 + approved
      const isAdmin = email === process.env.ADMIN_EMAIL;
      const status = isAdmin ? 'approved' : 'pending';

      result = await db.query(
        `INSERT INTO users (google_id, email, name, avatar_url, status, is_admin, login_count, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, 1, NOW())
         RETURNING *`,
        [googleId, email, name, avatarUrl, status, isAdmin]
      );
    } else {
      // 已存在：更新登入資訊，同時確保 ADMIN_EMAIL 帳號永遠有 is_admin = true
      const isAdmin = email === process.env.ADMIN_EMAIL;
      result = await db.query(
        `UPDATE users SET login_count = login_count + 1, last_login_at = NOW(),
         name = $2, avatar_url = $3,
         is_admin = CASE WHEN $4 THEN true ELSE is_admin END,
         status = CASE WHEN $4 AND status = 'pending' THEN 'approved' ELSE status END
         WHERE google_id = $1 RETURNING *`,
        [googleId, name, avatarUrl, isAdmin]
      );
    }

    return done(null, result.rows[0]);
  } catch (err) {
    return done(err, null);
  }
}));

// 發起 Google 登入
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
}));

// Google 回調
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login-failed' }),
  (req, res) => {
    const user = req.user;
    const token = jwt.sign(
      { userId: user.id, email: user.email, isAdmin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    const frontendUrl = process.env.FRONTEND_URL || 'https://12week-planner.zeabur.app';

    // 把 token 設為 cookie，同時帶上狀態跳轉
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',  // 跨域 cookie 必須用 none
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 天
    });

    if (user.status === 'pending') {
      return res.redirect(`${frontendUrl}/?status=pending`);
    }
    if (user.status === 'suspended') {
      return res.redirect(`${frontendUrl}/?status=suspended`);
    }
    return res.redirect(frontendUrl);
  }
);

// 取得目前登入者資訊
router.get('/me', requireAuth, (req, res) => {
  const { id, email, name, avatar_url, status, is_admin, created_at, last_login_at } = req.user;
  res.json({ id, email, name, avatar_url, status, is_admin, created_at, last_login_at });
});

// 登出
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

module.exports = router;
