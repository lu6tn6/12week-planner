-- 12週計畫 資料庫 Schema
-- 執行順序：依序執行即可

-- 用戶表
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  status VARCHAR(20) DEFAULT 'pending',   -- pending / approved / suspended
  is_admin BOOLEAN DEFAULT false,
  login_count INTEGER DEFAULT 0,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 計畫表
CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL DEFAULT '我的計畫',
  start_date DATE,
  current_week INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 目標表
CREATE TABLE IF NOT EXISTS goals (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER REFERENCES plans(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  why TEXT,
  category VARCHAR(100) DEFAULT '志業',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 行動表
CREATE TABLE IF NOT EXISTS actions (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER REFERENCES plans(id) ON DELETE CASCADE,
  goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
  goal_idx INTEGER DEFAULT 0,
  text VARCHAR(255) NOT NULL,
  freq_type VARCHAR(20) DEFAULT 'week',
  min_count INTEGER DEFAULT 1,
  max_count INTEGER DEFAULT 7,
  sort_order INTEGER DEFAULT 0
);

-- 每週自訂行動（覆蓋共用行動）
CREATE TABLE IF NOT EXISTS week_actions (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER REFERENCES plans(id) ON DELETE CASCADE,
  week INTEGER NOT NULL CHECK (week >= 1 AND week <= 12),
  actions_json JSONB NOT NULL DEFAULT '[]',
  UNIQUE(plan_id, week)
);

-- 每日打卡紀錄
CREATE TABLE IF NOT EXISTS week_days (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER REFERENCES plans(id) ON DELETE CASCADE,
  week INTEGER NOT NULL CHECK (week >= 1 AND week <= 12),
  action_idx INTEGER NOT NULL,  -- 行動在該週的索引
  day_index INTEGER NOT NULL CHECK (day_index >= 0 AND day_index <= 6),
  checked BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(plan_id, week, action_idx, day_index)
);

-- 週復盤
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER REFERENCES plans(id) ON DELETE CASCADE,
  week INTEGER NOT NULL CHECK (week >= 1 AND week <= 12),
  highlight TEXT,
  improve TEXT,
  next_week TEXT,
  review_date VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(plan_id, week)
);

-- 人生願景（每人一筆）
CREATE TABLE IF NOT EXISTS visions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  v10 TEXT,
  v3 TEXT,
  v1 TEXT,
  reward TEXT,
  dream_images JSONB DEFAULT '[]',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 生命領域（每個計畫可自訂）
CREATE TABLE IF NOT EXISTS life_areas (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER REFERENCES plans(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  label VARCHAR(100) NOT NULL,
  icon VARCHAR(20) DEFAULT '⭐',
  sort_order INTEGER DEFAULT 0
);

-- 索引（查詢效能）
CREATE INDEX IF NOT EXISTS idx_plans_user_id ON plans(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_plan_id ON goals(plan_id);
CREATE INDEX IF NOT EXISTS idx_actions_plan_id ON actions(plan_id);
CREATE INDEX IF NOT EXISTS idx_week_days_plan_week ON week_days(plan_id, week);
CREATE INDEX IF NOT EXISTS idx_reviews_plan_week ON reviews(plan_id, week);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
