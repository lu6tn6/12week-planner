require('dotenv').config();
const express = require('express');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const fs = require('fs');

const app = express();

// ── 中介軟體 ────────────────────────────────────────────
app.use(express.json({ limit: '10mb' })); // 10mb 支援 dream board 圖片
app.use(cookieParser());
app.use(passport.initialize());
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://12week-planner.zeabur.app';
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:3000'],
  credentials: true,
}));

// ── API 路由 ────────────────────────────────────────────
app.use('/auth', require('./routes/auth'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/admin', require('./routes/admin'));

// ── 健康檢查 ────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── 根路由 ────────────────────────────────────────────
app.get('/', (req, res) => res.json({ ok: true, service: '12week-planner-api' }));

// ── 啟動 ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    // 初始化資料庫（執行 schema.sql）
    const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await db.query(schema);
    console.log('✅ 資料庫初始化完成');

    app.listen(PORT, () => {
      console.log(`🚀 伺服器啟動：http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ 啟動失敗:', err);
    process.exit(1);
  }
}

start();
