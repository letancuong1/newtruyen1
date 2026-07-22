/**
 * Routes: Comments, Auth (login, register), User stats, Reading history
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../../db');
const { trackMissionProgress } = require('../services/missionEngine');

function isValidUUID(uuid) {
    if (typeof uuid !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

// POST /api/add_comment
router.post('/add_comment', async (req, res) => {
    try {
        const inputData = req.body;
        if (!inputData) throw new Error("Dữ liệu truyền lên không hợp lệ!");
        const content = inputData.content ? inputData.content.trim() : '';
        let book_id = null, user_id = null;

        if (inputData.book_id) {
            let val = inputData.book_id;
            if (typeof val === 'string' || typeof val === 'number') {
                val = String(val).trim();
                if (val.length > 0) book_id = val;
            }
        }
        if (inputData.user_id) {
            let val = inputData.user_id;
            if (val && typeof val === 'object' && val.id) val = val.id;
            if (typeof val === 'string' || typeof val === 'number') {
                val = String(val).trim();
                if (isValidUUID(val)) user_id = val;
            }
        }
        if (!book_id || !content) throw new Error("Thiếu thông tin ID truyện hoặc nội dung bình luận!");

        await pool.query("INSERT INTO comments (book_id, user_id, content, created_at) VALUES ($1, $2, $3, NOW())", [book_id, user_id, content]);
        const missionsCompleted = await trackMissionProgress(user_id, 'COMMENT', 1);
        res.json({ success: true, message: 'Đăng bình luận thành công!', missions_completed: missionsCompleted.length > 0 ? missionsCompleted : undefined });
    } catch (error) {
        res.status(400).json({ success: false, error: "Lỗi: " + error.message });
    }
});

// GET /api/get_comments
router.get('/get_comments', async (req, res) => {
    try {
        const bookId = req.query.book_id || null;
        let whereClause = " WHERE c.content != '' ";
        const params = [];
        if (bookId) { whereClause = " WHERE c.book_id = $1 AND c.content != '' "; params.push(bookId); }
        const result = await pool.query(`SELECT c.*, COALESCE(p.dao_hieu, 'Đạo Hữu Vô Danh') AS display_name, 
            COALESCE(p.display_name, 'Đạo Hữu Vô Danh') AS ten_hien_thi,
            COALESCE(b.ten_truyen, 'Bí tịch đã xóa') AS ten_truyen, COALESCE(b.slug, '#') AS slug 
            FROM comments c LEFT JOIN profiles p ON c.user_id = p.id LEFT JOIN books b ON c.book_id = b.id
            ${whereClause} ORDER BY c.created_at DESC LIMIT 20`, params);
        res.json({ success: true, comments: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/register
router.post('/register', async (req, res) => {
    try {
        const data = req.body;
        const email = data.email || '', name = data.name || '', password = data.password || '';
        if (!email || !name || !password) return res.json({ error: 'Vui lòng điền đầy đủ khẩu quyết!' });
        const checkEmail = await pool.query("SELECT id FROM profiles WHERE email = $1", [email]);
        if (checkEmail.rows.length > 0) return res.json({ error: 'Linh phù (Email) này đã được một đạo hữu khác sử dụng!' });
        const hash = await bcrypt.hash(password, 10);
        const new_uuid = crypto.randomUUID();
        await pool.query("INSERT INTO profiles (id, email, display_name, dao_hieu, password_hash, role, linh_thach, exp, is_vip, coin_balance) VALUES ($1, $2, $3, $4, $5, 'reader', 0, 0, false, 0)", [new_uuid, email, name, name, hash]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Thiên địa bất ổn, lỗi tạo tài khoản: ' + error.message });
    }
});

// POST /api/login
router.post('/login', async (req, res) => {
    try {
        const data = req.body;
        const email = data.email || '', password = data.password || '';
        if (!email || !password) return res.json({ error: 'Vui lòng nhập đầy đủ Linh phù và Khẩu quyết!' });
        const result = await pool.query("SELECT * FROM profiles WHERE email = $1", [email]);
        const user = result.rows[0];
        if (user && await bcrypt.compare(password, user.password_hash)) {
            const token = crypto.randomBytes(16).toString('hex');
            await pool.query("UPDATE profiles SET session_token = $1 WHERE id = $2", [token, user.id]);
            res.json({ success: true, token, user: { id: user.id, email: user.email, display_name: user.display_name, dao_hieu: user.dao_hieu, linh_thach: user.linh_thach, kim_cuong: user.kim_cuong || 0, tu_vi_exp: user.tu_vi_exp || 0, canh_gioi_id: user.canh_gioi_id || 1, exp: user.exp, is_vip: user.is_vip, role: user.role } });
        } else {
            res.json({ error: 'Khẩu quyết hoặc Linh phù không chính xác, thử lại!' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Lỗi kết nối tàng kinh các: ' + error.message });
    }
});

// POST /api/update_user_stats
router.post('/update_user_stats', async (req, res) => {
    try {
        const { user_id, exp_gain, lt_gain } = req.body;
        if (!user_id) return res.json({ error: 'Thiếu user_id!' });
        const result = await pool.query("UPDATE profiles SET exp = exp + $1, linh_thach = linh_thach + $2 WHERE id = $3 RETURNING id, display_name, dao_hieu, exp, linh_thach, is_vip, role", [exp_gain || 0, lt_gain || 0, user_id]);
        if (result.rows.length === 0) return res.json({ error: 'Không tìm thấy đạo hữu!' });
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/update_reading_history
router.post('/update_reading_history', async (req, res) => {
    try {
        const { user_id, book_id, chapter_id } = req.body;
        if (!user_id || !book_id) return res.json({ error: 'Thiếu thông tin!' });
        await pool.query("INSERT INTO reading_history (user_id, book_id, current_chapter_id, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (user_id, book_id) DO UPDATE SET current_chapter_id = $3, updated_at = NOW()", [user_id, book_id, chapter_id || null]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/get_reading_history
router.get('/get_reading_history', async (req, res) => {
    try {
        const userId = req.query.user_id || null;
        if (!userId) return res.json({ error: 'Thiếu user_id!' });
        const result = await pool.query(`SELECT rh.*, b.ten_truyen, b.slug, b.anh_bia FROM reading_history rh LEFT JOIN books b ON rh.book_id = b.id WHERE rh.user_id = $1 ORDER BY rh.updated_at DESC LIMIT 10`, [userId]);
        res.json({ success: true, history: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/get_leaderboard_users
router.get('/get_leaderboard_users', async (req, res) => {
    try {
        const result = await pool.query("SELECT id, display_name, dao_hieu, exp, linh_thach, role FROM profiles WHERE role != 'admin' ORDER BY exp DESC LIMIT 10");
        res.json({ success: true, users: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;