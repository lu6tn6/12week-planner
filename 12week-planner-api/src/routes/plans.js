const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── 計畫 CRUD ──────────────────────────────────────────

// 取得我的所有計畫
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM plans WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 建立計畫
router.post('/', async (req, res) => {
  try {
    const { name, start_date } = req.body;
    const result = await db.query(
      'INSERT INTO plans (user_id, name, start_date) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, name || '我的計畫', start_date || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新計畫
router.put('/:id', async (req, res) => {
  try {
    const { name, start_date, current_week } = req.body;
    const result = await db.query(
      `UPDATE plans SET name = COALESCE($1, name),
       start_date = COALESCE($2, start_date),
       current_week = COALESCE($3, current_week),
       updated_at = NOW()
       WHERE id = $4 AND user_id = $5 RETURNING *`,
      [name, start_date, current_week, req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: '計畫不存在' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 刪除計畫
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM plans WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 完整資料同步 ────────────────────────────────────────

// 拉取指定計畫的完整資料
router.get('/:id/sync', async (req, res) => {
  try {
    const planId = req.params.id;

    // 確認計畫屬於此用戶
    const planResult = await db.query(
      'SELECT * FROM plans WHERE id = $1 AND user_id = $2',
      [planId, req.user.id]
    );
    if (!planResult.rows.length) return res.status(404).json({ error: '計畫不存在' });

    const [goals, actions, weekActions, weekDays, reviews, lifeAreas] = await Promise.all([
      db.query('SELECT * FROM goals WHERE plan_id = $1 ORDER BY sort_order', [planId]),
      db.query('SELECT * FROM actions WHERE plan_id = $1 ORDER BY sort_order', [planId]),
      db.query('SELECT * FROM week_actions WHERE plan_id = $1', [planId]),
      db.query('SELECT * FROM week_days WHERE plan_id = $1', [planId]),
      db.query('SELECT * FROM reviews WHERE plan_id = $1', [planId]),
      db.query('SELECT * FROM life_areas WHERE plan_id = $1 ORDER BY sort_order', [planId]),
    ]);

    // 取願景
    const visionResult = await db.query('SELECT * FROM visions WHERE user_id = $1', [req.user.id]);

    // 整理 weekDays 成前端格式 { "w1_a0": [false,true,...] }
    const weekDaysMap = {};
    weekDays.rows.forEach(r => {
      const key = `w${r.week}_a${r.action_idx}`;
      if (!weekDaysMap[key]) weekDaysMap[key] = [false,false,false,false,false,false,false];
      weekDaysMap[key][r.day_index] = r.checked;
    });

    // 整理 weekActions 成前端格式 { 1: [...], 2: [...] }
    const weekActionsMap = {};
    weekActions.rows.forEach(r => { weekActionsMap[r.week] = r.actions_json; });

    // 整理 reviews 成前端格式 { 1: {...}, 2: {...} }
    const reviewsMap = {};
    reviews.rows.forEach(r => {
      reviewsMap[r.week] = {
        highlight: r.highlight,
        improve: r.improve,
        nextWeek: r.next_week,
        reviewDate: r.review_date,
      };
    });

    res.json({
      plan: planResult.rows[0],
      goals: goals.rows,
      actions: actions.rows,
      weekActions: weekActionsMap,
      weekDays: weekDaysMap,
      reviews: reviewsMap,
      lifeAreas: lifeAreas.rows,
      vision: visionResult.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 推送完整計畫資料（全量覆蓋）
router.post('/:id/sync', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const planId = req.params.id;
    const userId = req.user.id;

    // 確認計畫屬於此用戶
    const planCheck = await client.query(
      'SELECT id FROM plans WHERE id = $1 AND user_id = $2', [planId, userId]
    );
    if (!planCheck.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '計畫不存在' });
    }

    const { plan, goals, actions, weekActions, weekDays, reviews, lifeAreas, vision } = req.body;

    // 更新計畫基本資料
    if (plan) {
      await client.query(
        'UPDATE plans SET name=$1, start_date=$2, current_week=$3, updated_at=NOW() WHERE id=$4',
        [plan.name, plan.startDate || null, plan.currentWeek || 1, planId]
      );
    }

    // 同步目標（全量替換）
    if (goals) {
      await client.query('DELETE FROM goals WHERE plan_id = $1', [planId]);
      for (let i = 0; i < goals.length; i++) {
        const g = goals[i];
        await client.query(
          'INSERT INTO goals (plan_id, name, why, category, sort_order) VALUES ($1,$2,$3,$4,$5)',
          [planId, g.name, g.why || '', g.category || '志業', i]
        );
      }
    }

    // 同步行動（全量替換）
    if (actions) {
      await client.query('DELETE FROM actions WHERE plan_id = $1', [planId]);
      for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        await client.query(
          `INSERT INTO actions (plan_id, goal_idx, text, freq_type, min_count, max_count, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [planId, a.goalIdx ?? 0, a.text, a.freqType || 'week', a.min || 1, a.max || 7, i]
        );
      }
    }

    // 同步每週自訂行動
    if (weekActions) {
      await client.query('DELETE FROM week_actions WHERE plan_id = $1', [planId]);
      for (const [week, acts] of Object.entries(weekActions)) {
        await client.query(
          'INSERT INTO week_actions (plan_id, week, actions_json) VALUES ($1,$2,$3)',
          [planId, parseInt(week), JSON.stringify(acts)]
        );
      }
    }

    // 同步打卡紀錄
    if (weekDays) {
      await client.query('DELETE FROM week_days WHERE plan_id = $1', [planId]);
      for (const [key, days] of Object.entries(weekDays)) {
        const m = key.match(/^w(\d+)_a(\d+)$/);
        if (!m) continue;
        const week = parseInt(m[1]);
        const actionIdx = parseInt(m[2]);
        for (let di = 0; di < 7; di++) {
          if (days[di]) {
            await client.query(
              `INSERT INTO week_days (plan_id, week, action_idx, day_index, checked)
               VALUES ($1,$2,$3,$4,$5) ON CONFLICT (plan_id,week,action_idx,day_index)
               DO UPDATE SET checked=$5, updated_at=NOW()`,
              [planId, week, actionIdx, di, days[di]]
            );
          }
        }
      }
    }

    // 同步復盤
    if (reviews) {
      for (const [week, rv] of Object.entries(reviews)) {
        await client.query(
          `INSERT INTO reviews (plan_id, week, highlight, improve, next_week, review_date)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (plan_id, week) DO UPDATE
           SET highlight=$3, improve=$4, next_week=$5, review_date=$6, updated_at=NOW()`,
          [planId, parseInt(week), rv.highlight||'', rv.improve||'', rv.nextWeek||'', rv.reviewDate||'']
        );
      }
    }

    // 同步生命領域
    if (lifeAreas) {
      await client.query('DELETE FROM life_areas WHERE plan_id = $1', [planId]);
      for (let i = 0; i < lifeAreas.length; i++) {
        const a = lifeAreas[i];
        await client.query(
          'INSERT INTO life_areas (plan_id, key, label, icon, sort_order) VALUES ($1,$2,$3,$4,$5)',
          [planId, a.key, a.label, a.icon || '⭐', i]
        );
      }
    }

    // 同步願景
    if (vision) {
      await client.query(
        `INSERT INTO visions (user_id, v10, v3, v1, reward, dream_images, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET v10=$2, v3=$3, v1=$4, reward=$5, dream_images=$6, updated_at=NOW()`,
        [userId, vision.v10||'', vision.v3||'', vision.v1||'', vision.reward||'',
         JSON.stringify(vision.dreamImages||[])]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, synced_at: new Date().toISOString() });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
