/**
 * Routes: Gamification (cultivation, breakthrough, shop, items, bookmark, topup,...)
 */
const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { trackMissionProgress } = require('../services/missionEngine');

function isValidUUID(uuid) {
    if (typeof uuid !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

// GET /api/get_cultivation
router.get('/get_cultivation', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) return res.json({ error: 'Thiếu user_id!' });
        const user = await pool.query('SELECT id, kim_cuong, linh_thach, tu_vi_exp, canh_gioi_id, kinh_mach, than_thuc, than_the, ngo_tinh, is_injured, injured_until FROM profiles WHERE id = $1', [userId]);
        if (user.rows.length === 0) return res.json({ error: 'Không tìm thấy user!' });
        const currentLv = user.rows[0].canh_gioi_id;
        const [curLvRes, nextLvRes, itemsRes] = await Promise.all([
            pool.query('SELECT * FROM levels_config WHERE id = $1', [currentLv]),
            pool.query('SELECT * FROM levels_config WHERE id = $1', [currentLv + 1]),
            pool.query('SELECT item_name, so_luong FROM user_items WHERE user_id = $1', [userId])
        ]);
        res.json({ success: true, cultivation: user.rows[0], current_level: curLvRes.rows[0] || null, next_level: nextLvRes.rows[0] || null, items: itemsRes.rows || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/breakthrough
router.post('/breakthrough', async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) return res.status(400).json({ error: 'Thiếu user_id!' });
        const userRes = await pool.query('SELECT id, tu_vi_exp, canh_gioi_id, kinh_mach, than_thuc, than_the, is_injured, injured_until FROM profiles WHERE id = $1', [user_id]);
        if (userRes.rows.length === 0) return res.status(400).json({ error: 'Không tìm thấy user!' });
        const user = userRes.rows[0];
        if (user.is_injured && user.injured_until && new Date() < new Date(user.injured_until)) return res.json({ success: false, error: 'Đang bị thương!' });

        const currentLvId = user.canh_gioi_id;
        const curLvRes = await pool.query('SELECT * FROM levels_config WHERE id = $1', [currentLvId]);
        const nextLvRes = await pool.query('SELECT * FROM levels_config WHERE id = $1', [currentLvId + 1]);
        if (!nextLvRes.rows[0]) return res.json({ success: false, error: 'Đã đạt cảnh giới tối cao!' });
        const nextLv = nextLvRes.rows[0];

        if (user.tu_vi_exp < nextLv.exp_yeu_cau) return res.json({ success: false, error: `Chưa đủ EXP! Cần ${nextLv.exp_yeu_cau}, có ${user.tu_vi_exp}` });
        const avgStat = (user.kinh_mach + user.than_thuc + user.than_the) / 3;
        if (avgStat < nextLv.than_luc_yeu_cau) return res.json({ success: false, error: `Thần lực chưa đủ! (${Math.round(avgStat)}/${nextLv.than_luc_yeu_cau})` });

        const protectItem = await pool.query("SELECT so_luong FROM user_items WHERE user_id = $1 AND item_name = 'Hỗn Nguyên Đan'", [user_id]);
        const hasProtect = protectItem.rows.length > 0 && protectItem.rows[0].so_luong > 0;
        const isSuccess = Math.random() < (nextLv.ty_le_thanh_cong / 100);

        if (isSuccess) {
            await pool.query('UPDATE profiles SET canh_gioi_id = $1, is_injured = false, injured_until = NULL WHERE id = $2', [currentLvId + 1, user_id]);
            res.json({ success: true, message: `Đột phá thành công! ${nextLv.ten_canh_gioi}!` });
        } else if (hasProtect) {
            await pool.query("UPDATE user_items SET so_luong = so_luong - 1 WHERE user_id = $1 AND item_name = 'Hỗn Nguyên Đan'", [user_id]);
            res.json({ success: false, error: 'Thất bại! Hỗn Nguyên Đan đã bảo vệ bạn.', protected: true });
        } else {
            const expPenalty = Math.round(user.tu_vi_exp * (currentLvId <= 3 ? 0 : currentLvId <= 12 ? 0.1 : currentLvId <= 20 ? 0.15 : currentLvId <= 23 ? 0.2 : 0.3));
            let newExp = Math.max(0, user.tu_vi_exp - expPenalty);
            let newLevel = user.canh_gioi_id;
            if (currentLvId >= 21) newLevel = currentLvId - 1;
            const cooldownHours = currentLvId <= 3 ? 0 : currentLvId <= 12 ? 0.5 : currentLvId <= 20 ? 2 : currentLvId <= 23 ? 6 : 12;
            const injuredUntil = cooldownHours > 0 ? new Date(Date.now() + cooldownHours * 3600000) : null;
            await pool.query('UPDATE profiles SET tu_vi_exp = $1, canh_gioi_id = $2, is_injured = $3, injured_until = $4 WHERE id = $5', [newExp, newLevel, cooldownHours > 0, injuredUntil, user_id]);
            res.json({ success: false, error: `Thất bại! Mất ${expPenalty} EXP${newLevel !== currentLvId ? ', rớt 1 tầng!' : ''}${cooldownHours > 0 ? `, hồi phục ${cooldownHours}h.` : ''}` });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/buy_item
router.post('/buy_item', async (req, res) => {
    try {
        const { user_id, item_id } = req.body;
        if (!user_id || !item_id) return res.status(400).json({ error: 'Thiếu thông tin!' });
        const itemRes = await pool.query('SELECT * FROM shop_items WHERE id = $1 AND is_active = true', [item_id]);
        if (itemRes.rows.length === 0) return res.status(400).json({ error: 'Vật phẩm không tồn tại!' });
        const item = itemRes.rows[0];
        const userRes = await pool.query('SELECT kim_cuong, linh_thach FROM profiles WHERE id = $1', [user_id]);
        if (userRes.rows.length === 0) return res.status(400).json({ error: 'Không tìm thấy user!' });
        const user = userRes.rows[0];
        if (item.price_linh_thach > 0 && user.linh_thach < item.price_linh_thach) return res.json({ success: false, error: 'Không đủ Linh Thạch!' });
        if (item.price_kim_cuong > 0 && user.kim_cuong < item.price_kim_cuong) return res.json({ success: false, error: 'Không đủ Kim Cương!' });
        await pool.query('UPDATE profiles SET linh_thach = linh_thach - $1, kim_cuong = kim_cuong - $2 WHERE id = $3', [item.price_linh_thach, item.price_kim_cuong, user_id]);
        await pool.query("INSERT INTO user_items (user_id, item_name, so_luong) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_name) DO UPDATE SET so_luong = user_items.so_luong + 1", [user_id, item.name]);
        res.json({ success: true, message: `Mua ${item.name} thành công!` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/use_item
router.post('/use_item', async (req, res) => {
    try {
        const { user_id, item_name } = req.body;
        if (!user_id || !item_name) return res.status(400).json({ error: 'Thiếu thông tin!' });
        const itemRes = await pool.query('SELECT so_luong FROM user_items WHERE user_id = $1 AND item_name = $2', [user_id, item_name]);
        if (itemRes.rows.length === 0 || itemRes.rows[0].so_luong < 1) return res.json({ success: false, error: 'Không có vật phẩm!' });
        const userRes = await pool.query('SELECT tu_vi_exp, kinh_mach, than_thuc, than_the, ngo_tinh FROM profiles WHERE id = $1', [user_id]);
        if (userRes.rows.length === 0) return res.status(400).json({ error: 'Không tìm thấy user!' });
        const user = userRes.rows[0];
        let effectMessage = '';
        switch (item_name) {
            case 'Tụ Khí Đan':
                await pool.query('UPDATE profiles SET tu_vi_exp = tu_vi_exp + 50 WHERE id = $1', [user_id]);
                effectMessage = 'Nhận +50 EXP!'; break;
            case 'Tẩy Tủy Đan': {
                const base = { kinh_mach: 10, than_thuc: 12, than_the: 15 };
                await pool.query('UPDATE profiles SET kinh_mach = $1, than_thuc = $2, than_the = $3 WHERE id = $4', [base.kinh_mach, base.than_thuc, base.than_the, user_id]);
                const total = (user.kinh_mach || 0) + (user.than_thuc || 0) + (user.than_the || 0);
                const totalBase = base.kinh_mach + base.than_thuc + base.than_the;
                effectMessage = `Đã reset! Có ${Math.max(0, total - totalBase)} điểm tự do.`; break;
            }
            case 'Hỗn Nguyên Đan': effectMessage = 'Hỗn Nguyên Đan sẵn sàng bảo vệ bạn!'; break;
            case 'Phiếu Đề Cử': effectMessage = '📋 Phiếu Đề Cử sẵn sàng!'; break;
            default: return res.json({ success: false, error: 'Vật phẩm không hỗ trợ!' });
        }
        await pool.query('UPDATE user_items SET so_luong = so_luong - 1 WHERE user_id = $1 AND item_name = $2', [user_id, item_name]);
        res.json({ success: true, message: effectMessage });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/assign_stats
router.post('/assign_stats', async (req, res) => {
    try {
        const { user_id, kinh_mach, than_thuc, than_the, linh_thach_cost } = req.body;
        if (!user_id) return res.status(400).json({ error: 'Thiếu user_id!' });
        await pool.query('UPDATE profiles SET kinh_mach = COALESCE($1::int, kinh_mach), than_thuc = COALESCE($2::int, than_thuc), than_the = COALESCE($3::int, than_the), linh_thach = GREATEST(0, COALESCE(linh_thach,0) - $4::int) WHERE id = $5',
            [kinh_mach || null, than_thuc || null, than_the || null, linh_thach_cost || 0, user_id]);
        res.json({ success: true, message: 'Cập nhật chỉ số thành công!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/topup
router.post('/topup', async (req, res) => {
    try {
        const { user_id, amount_vnd, payment_method } = req.body;
        if (!user_id || !amount_vnd || amount_vnd < 10000) return res.status(400).json({ error: 'Tối thiểu 10,000 VND!' });
        const kim_cuong = Math.floor(amount_vnd / 1000);
        await pool.query("INSERT INTO transactions (user_id, amount, transaction_type, description, created_at) VALUES ($1, $2, 'topup', $3, NOW())", [user_id, amount_vnd, `Nạp ${amount_vnd}VND → ${kim_cuong}KC`]);
        await pool.query('UPDATE profiles SET kim_cuong = kim_cuong + $1 WHERE id = $2', [kim_cuong, user_id]);
        res.json({ success: true, message: `Nạp ${amount_vnd.toLocaleString()}VND! Nhận ${kim_cuong}KC.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/exchange_currency
router.post('/exchange_currency', async (req, res) => {
    try {
        const { user_id, kim_cuong } = req.body;
        if (!user_id || !kim_cuong || kim_cuong < 1) return res.status(400).json({ error: 'Số KC không hợp lệ!' });
        const userRes = await pool.query('SELECT kim_cuong FROM profiles WHERE id = $1', [user_id]);
        if (userRes.rows.length === 0) return res.status(400).json({ error: 'Không tìm thấy user!' });
        if (userRes.rows[0].kim_cuong < kim_cuong) return res.json({ success: false, error: 'Không đủ KC!' });
        const lt = kim_cuong * 100;
        await pool.query('UPDATE profiles SET kim_cuong = kim_cuong - $1, linh_thach = linh_thach + $2 WHERE id = $3', [kim_cuong, lt, user_id]);
        res.json({ success: true, message: `Đổi ${kim_cuong}KC → ${lt}LT!` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/complete_chapter_reward
router.post('/complete_chapter_reward', async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) return res.status(400).json({ error: 'Thiếu user_id!' });
        const userRes = await pool.query('SELECT ngo_tinh FROM profiles WHERE id = $1', [user_id]);
        if (userRes.rows.length === 0) return res.status(400).json({ error: 'Không tìm thấy user!' });
        const ngoTinh = parseFloat(userRes.rows[0].ngo_tinh) || 1.0;
        const expGain = Math.round(10 * ngoTinh);
        await pool.query('UPDATE profiles SET tu_vi_exp = tu_vi_exp + $1, linh_thach = linh_thach + 1 WHERE id = $2', [expGain, user_id]);
        const missionsCompleted = await trackMissionProgress(user_id, 'READ_CHAPTER', 1);
        res.json({ success: true, exp_gained: expGain, linh_thach_gained: 1, missions_completed: missionsCompleted.length > 0 ? missionsCompleted : undefined });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/get_shop_items
router.get('/get_shop_items', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM shop_items WHERE is_active = true ORDER BY id');
        res.json({ success: true, items: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/buy_nomination_ticket
router.post('/buy_nomination_ticket', async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) return res.status(400).json({ error: 'Thiếu user_id!' });
        const userRes = await pool.query('SELECT linh_thach FROM profiles WHERE id = $1', [user_id]);
        if (userRes.rows.length === 0) return res.status(400).json({ error: 'Không tìm thấy user!' });
        const lt = parseInt(userRes.rows[0].linh_thach) || 0;
        if (lt < 100) return res.json({ success: false, error: 'Cần 100 LT!' });
        await pool.query('UPDATE profiles SET linh_thach = linh_thach - 100 WHERE id = $1', [user_id]);
        await pool.query("INSERT INTO user_items (user_id, item_name, so_luong) VALUES ($1, 'Phiếu Đề Cử', 1) ON CONFLICT (user_id, item_name) DO UPDATE SET so_luong = user_items.so_luong + 1", [user_id]);
        res.json({ success: true, message: '✅ Mua Phiếu Đề Cử thành công!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/toggle_bookmark
router.post('/toggle_bookmark', async (req, res) => {
    try {
        let { user_id, book_id } = req.body;
        if (!user_id || !book_id) return res.status(400).json({ error: 'Thiếu thông tin!' });
        if (typeof user_id === 'object' && user_id.id) user_id = user_id.id;
        user_id = String(user_id).trim(); book_id = String(book_id).trim();
        if (!isValidUUID(user_id)) return res.json({ success: false, error: 'User ID không hợp lệ!' });
        const check = await pool.query('SELECT 1 FROM bookmarks WHERE user_id = $1 AND book_id = $2', [user_id, book_id]);
        if (check.rows.length > 0) {
            await pool.query('DELETE FROM bookmarks WHERE user_id = $1 AND book_id = $2', [user_id, book_id]);
            res.json({ success: true, message: '✅ Đã xóa bookmark!' });
        } else {
            await pool.query('INSERT INTO bookmarks (user_id, book_id, created_at) VALUES ($1, $2, NOW())', [user_id, book_id]);
            res.json({ success: true, message: '✅ Đã thêm bookmark!' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/get_bookmarks
router.get('/get_bookmarks', async (req, res) => {
    try {
        const { user_id } = req.query;
        if (!user_id) return res.json({ success: true, bookmarks: [] });
        const result = await pool.query("SELECT bm.book_id, bm.created_at, b.ten_truyen, b.anh_bia FROM bookmarks bm LEFT JOIN books b ON bm.book_id = b.id WHERE bm.user_id = $1 ORDER BY bm.created_at DESC LIMIT 20", [user_id]);
        res.json({ success: true, bookmarks: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===================== USER NOTIFICATIONS API =====================

// GET /api/notifications/unread - Lấy thông báo chưa đọc của user
router.get('/notifications/unread', async (req, res) => {
    try {
        const { user_id } = req.query;
        if (!user_id) return res.json({ success: false, error: 'Thiếu user_id!' });
        const r = await pool.query(`
            SELECT id, title, message, link_url, linh_thach, kim_cuong, is_read, created_at
            FROM notifications WHERE (user_id = $1 OR user_id IS NULL) AND is_read = false
            ORDER BY created_at DESC LIMIT 20`, [user_id]);
        res.json({ success: true, count: r.rows.length, notifications: r.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/notifications/claim - Nhận quà đính kèm thông báo
router.post('/notifications/claim', async (req, res) => {
    try {
        const { notification_id, user_id } = req.body;
        if (!notification_id || !user_id) return res.status(400).json({ success: false, error: 'Thiếu thông tin!' });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const nR = await client.query('SELECT id, linh_thach, kim_cuong, is_read FROM notifications WHERE id = $1 AND (user_id = $2 OR user_id IS NULL) FOR UPDATE', [notification_id, user_id]);
            if (nR.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Không tìm thấy!' }); }
            const n = nR.rows[0];
            if (n.is_read) { await client.query('ROLLBACK'); return res.json({ success: false, error: 'Đã nhận rồi!' }); }
            await client.query('UPDATE notifications SET is_read = true WHERE id = $1', [notification_id]);
            const lt = parseInt(n.linh_thach) || 0;
            const kc = parseInt(n.kim_cuong) || 0;
            let msg = '';
            if (lt > 0 || kc > 0) {
                await client.query('UPDATE profiles SET linh_thach = COALESCE(linh_thach,0) + $1, kim_cuong = COALESCE(kim_cuong,0) + $2 WHERE id = $3', [lt, kc, user_id]);
                msg = `+${lt} LT${kc > 0 ? ` +${kc} KC` : ''}`;
            }
            const uR = await client.query('SELECT linh_thach, kim_cuong FROM profiles WHERE id = $1', [user_id]);
            await client.query('COMMIT');
            res.json({ success: true, message: msg || 'Đã nhận!', claimed_reward: msg, user: uR.rows[0] || null });
        } catch (err) { await client.query('ROLLBACK'); throw err; }
        finally { client.release(); }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/rpg/use-item - Sử dụng vật phẩm
router.post('/rpg/use-item', async (req, res) => {
    try {
        const { user_id, item_name } = req.body;
        if (!user_id || !item_name) return res.status(400).json({ success: false, error: 'Thiếu thông tin!' });
        const itemRes = await pool.query('SELECT so_luong FROM user_items WHERE user_id = $1 AND item_name = $2', [user_id, item_name]);
        if (itemRes.rows.length === 0 || itemRes.rows[0].so_luong < 1) return res.json({ success: false, error: 'Không có vật phẩm!' });
        const userRes = await pool.query('SELECT tu_vi_exp, kinh_mach, than_thuc, than_the, ngo_tinh, linh_thach FROM profiles WHERE id = $1', [user_id]);
        if (userRes.rows.length === 0) return res.status(400).json({ error: 'Không tìm thấy user!' });
        const user = userRes.rows[0];
        let effectMessage = '';
        let missionsCompleted = [];
        switch (item_name) {
            case 'Tụ Khí Đan':
                await pool.query('UPDATE profiles SET tu_vi_exp = tu_vi_exp + 50 WHERE id = $1', [user_id]);
                effectMessage = 'Nhận +50 EXP!'; break;
            case 'Tẩy Tủy Đan': {
                const base = { kinh_mach: 10, than_thuc: 12, than_the: 15 };
                await pool.query('UPDATE profiles SET kinh_mach = $1, than_thuc = $2, than_the = $3 WHERE id = $4', [base.kinh_mach, base.than_thuc, base.than_the, user_id]);
                effectMessage = 'Đã reset chỉ số!'; break;
            }
            case 'Hỗn Nguyên Đan': effectMessage = 'Hỗn Nguyên Đan sẵn sàng bảo vệ bạn!'; break;
            case 'Phiếu Đề Cử': effectMessage = '📋 Phiếu Đề Cử sẵn sàng!'; break;
            default: return res.json({ success: false, error: 'Vật phẩm không hỗ trợ!' });
        }
        await pool.query('UPDATE user_items SET so_luong = so_luong - 1 WHERE user_id = $1 AND item_name = $2', [user_id, item_name]);
        const updatedUser = await pool.query('SELECT linh_thach, kim_cuong, tu_vi_exp, kinh_mach, than_thuc, than_the, ngo_tinh, canh_gioi_id FROM profiles WHERE id = $1', [user_id]);
        res.json({ success: true, message: effectMessage, user: updatedUser.rows[0] || null, missions_completed: missionsCompleted });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/users/me/items - Lấy túi đồ của user
router.get('/users/me/items', async (req, res) => {
    try {
        const { user_id } = req.query;
        if (!user_id) return res.json({ success: false, error: 'Thiếu user_id!', items: [] });
        const r = await pool.query('SELECT id, item_name, so_luong FROM user_items WHERE user_id = $1 ORDER BY item_name ASC', [user_id]);
        res.json({ success: true, items: r.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
