/**
 * Routes: Public Missions (my-quests, claim, reset-daily)
 */
const express = require('express');
const router = express.Router();
const pool = require('../../db');

// GET /api/missions/all - Lấy tất cả nhiệm vụ phân theo cycle
router.get('/missions/all', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) return res.status(400).json({ success: false, error: 'Thiếu user_id!' });
        const result = await pool.query(`
            SELECT mc.id, mc.name, mc.mission_type, mc.action_type, mc.target_value, 
                   mc.cycle, mc.reward_lt, mc.reward_exp, mc.is_active,
                   COALESCE(um.current_progress, 0) AS current_progress,
                   COALESCE(um.status, 'IN_PROGRESS') AS user_status
            FROM missions_config mc
            LEFT JOIN user_missions um ON um.mission_config_id = mc.id AND um.user_id = $1
            WHERE mc.is_active = true
            ORDER BY mc.cycle, mc.id ASC`, [userId]);
        
        // Phân nhóm theo cycle
        const grouped = {
            daily: result.rows.filter(m => m.cycle === 'DAILY'),
            weekly: result.rows.filter(m => m.cycle === 'WEEKLY'),
            tutorial: result.rows.filter(m => m.cycle === 'ONCE')
        };
        res.json({ success: true, missions: grouped });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/missions/daily - Nhiệm vụ hàng ngày
router.get('/missions/daily', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) return res.status(400).json({ success: false, error: 'Thiếu user_id!' });
        const cycle = req.query.cycle || 'DAILY';
        const result = await pool.query(`
            SELECT mc.id, mc.name, mc.mission_type, mc.action_type, mc.target_value, 
                   mc.cycle, mc.reward_lt, mc.reward_exp, mc.is_active,
                   COALESCE(um.current_progress, 0) AS current_progress,
                   COALESCE(um.status, 'IN_PROGRESS') AS user_status
            FROM missions_config mc
            LEFT JOIN user_missions um ON um.mission_config_id = mc.id AND um.user_id = $1
            WHERE mc.is_active = true AND mc.cycle = $2
            ORDER BY mc.id ASC`, [userId, cycle]);
        res.json({ success: true, missions: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/missions/my-quests
router.get('/missions/my-quests', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) return res.status(400).json({ success: false, error: 'Thiếu user_id!' });
        const result = await pool.query(`
            SELECT mc.id, mc.name, mc.mission_type, mc.action_type, mc.target_value, 
                   mc.cycle, mc.reward_lt, mc.reward_exp, mc.is_active,
                   COALESCE(um.current_progress, 0) AS current_progress,
                   COALESCE(um.status, 'IN_PROGRESS') AS user_status
            FROM missions_config mc
            LEFT JOIN user_missions um ON um.mission_config_id = mc.id AND um.user_id = $1
            WHERE mc.is_active = true ORDER BY mc.id ASC`, [userId]);
        res.json({ success: true, missions: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/missions
router.get('/missions', async (req, res) => {
    try {
        const userId = req.query.user_id;
        const missionsResult = await pool.query('SELECT * FROM missions_config WHERE is_active = true ORDER BY id ASC');
        const missions = missionsResult.rows;
        let userProgressMap = {};
        if (userId) {
            const pr = await pool.query('SELECT mission_config_id, current_progress, status FROM user_missions WHERE user_id = $1', [userId]);
            pr.rows.forEach(p => { userProgressMap[p.mission_config_id] = { current_progress: p.current_progress, status: p.status }; });
        }
        const result = missions.map(m => {
            const p = userProgressMap[m.id] || { current_progress: 0, status: 'IN_PROGRESS' };
            return { ...m, current_progress: p.current_progress, user_status: p.status };
        });
        res.json({ success: true, missions: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/missions/:mission_id/claim
router.post('/missions/:mission_id/claim', async (req, res) => {
    try {
        const { mission_id } = req.params;
        const { user_id } = req.body;
        if (!user_id || !mission_id) return res.status(400).json({ success: false, error: 'Thiếu thông tin!' });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const umR = await client.query(`SELECT um.id, um.current_progress, um.status, mc.reward_lt, mc.reward_exp, mc.target_value, mc.name FROM user_missions um JOIN missions_config mc ON um.mission_config_id = mc.id WHERE um.user_id = $1 AND um.mission_config_id = $2 FOR UPDATE OF um`, [user_id, mission_id]);
            if (umR.rows.length === 0) { await client.query('ROLLBACK'); return res.json({ success: false, error: 'Chưa bắt đầu!' }); }
            const um = umR.rows[0];
            if (um.status !== 'COMPLETED') { await client.query('ROLLBACK'); return res.json({ success: false, error: `Chưa hoàn thành! (${um.current_progress}/${um.target_value})` }); }
            if (um.status === 'CLAIMED') { await client.query('ROLLBACK'); return res.json({ success: false, error: 'Đã nhận rồi!' }); }
            await client.query('UPDATE profiles SET linh_thach = COALESCE(linh_thach, 0) + $1, exp = COALESCE(exp, 0) + $2, tu_vi_exp = COALESCE(tu_vi_exp, 0) + $2 WHERE id = $3', [um.reward_lt || 0, um.reward_exp || 0, user_id]);
            await client.query("UPDATE user_missions SET status = 'CLAIMED' WHERE id = $1", [um.id]);
            await client.query('COMMIT');
            res.json({ success: true, message: `✅ Nhận thưởng: +${um.reward_lt}LT, +${um.reward_exp}EXP!` });
        } catch (err) { await client.query('ROLLBACK'); throw err; }
        finally { client.release(); }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/missions/reset-daily
router.post('/missions/reset-daily', async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) return res.status(400).json({ success: false, error: 'Thiếu user_id!' });
        await pool.query(`UPDATE user_missions um SET current_progress = 0, status = 'IN_PROGRESS' FROM missions_config mc WHERE um.mission_config_id = mc.id AND mc.cycle = 'DAILY' AND mc.is_active = true AND um.user_id = $1 AND (um.status = 'CLAIMED' OR um.status = 'COMPLETED')`, [user_id]);
        res.json({ success: true, message: '✅ Đã reset nhiệm vụ hàng ngày!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;