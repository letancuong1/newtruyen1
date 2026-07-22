/**
 * Routes: Admin (stats, levels, shop, missions, users, books, chapters, notifications, billing)
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../../db');

// ===================== DASHBOARD STATS =====================
router.get('/admin/stats', async (req, res) => {
    try {
        const totalUsers = await pool.query('SELECT COUNT(*)::int AS count FROM profiles');
        const totalViews = await pool.query('SELECT COALESCE(SUM(luot_xem), 0)::bigint AS total FROM books');
        const totalLT = await pool.query('SELECT COALESCE(SUM(linh_thach), 0)::bigint AS total FROM profiles');
        let totalRevenue = { rows: [{ total: 0 }] };
        try { totalRevenue = await pool.query('SELECT COALESCE(SUM(amount_vnd), 0)::bigint AS total FROM transactions'); } catch(e) {}
        let pendingBooks = { rows: [] };
        try { pendingBooks = await pool.query("SELECT id, ten_truyen, tac_gia, created_at FROM books WHERE trang_thai ILIKE '%chờ%' OR trang_thai ILIKE '%pending%' ORDER BY created_at DESC LIMIT 5"); } catch(e) {}
        
        let recentActivities = [];
        try {
            const topups = await pool.query(`SELECT 'topup' AS type, COALESCE(p.display_name, p.dao_hieu, 'Đạo Hữu') AS display_name, t.amount, t.created_at, 'Nạp Kim Cương' AS action FROM transactions t LEFT JOIN profiles p ON t.user_id = p.id WHERE t.transaction_type = 'topup' OR t.transaction_type IS NULL ORDER BY t.created_at DESC LIMIT 3`);
            recentActivities = recentActivities.concat(topups.rows || []);
        } catch(e) {}
        try {
            const b = await pool.query(`SELECT 'breakthrough' AS type, COALESCE(display_name, dao_hieu, 'Đạo Hữu') AS display_name, NULL::bigint AS amount, updated_at AS created_at, 'Đột phá' AS action FROM profiles WHERE canh_gioi_id > 1 AND updated_at IS NOT NULL ORDER BY updated_at DESC LIMIT 2`);
            recentActivities = recentActivities.concat(b.rows || []);
        } catch(e) {}
        try {
            const r = await pool.query(`SELECT 'register' AS type, COALESCE(display_name, dao_hieu, 'Đạo Hữu') AS display_name, NULL::bigint AS amount, created_at, 'Đăng ký' AS action FROM profiles ORDER BY created_at DESC LIMIT 2`);
            recentActivities = recentActivities.concat(r.rows || []);
        } catch(e) {}
        recentActivities.sort((a,b) => (new Date(b.created_at)||0) - (new Date(a.created_at)||0)).slice(0,6);
        
        res.json({ success: true, stats: { total_users: totalUsers.rows[0].count, total_views: parseInt(totalViews.rows[0].total) || 0, total_linh_thach: parseInt(totalLT.rows[0].total) || 0, total_revenue: parseInt(totalRevenue.rows[0].total) || 0 }, pending_books: pendingBooks.rows || [], recent_activities: recentActivities || [] });
    } catch (error) {
        res.json({ success: false, error: error.message, stats: { total_users: 0, total_views: 0, total_linh_thach: 0, total_revenue: 0 }, pending_books: [], recent_activities: [] });
    }
});

// ===================== LEVELS CONFIG =====================
router.get('/admin/levels-config', async (req, res) => {
    try { const r = await pool.query('SELECT * FROM levels_config ORDER BY id ASC'); res.json({ success: true, levels: r.rows }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
router.post('/admin/levels-config', async (req, res) => {
    try {
        const { ten_canh_gioi, exp_yeu_cau, than_luc_yeu_cau, ty_le_thanh_cong, linh_thach_phuc_hoi } = req.body;
        if (!ten_canh_gioi) return res.status(400).json({ success: false, error: 'Thiếu tên!' });
        const tyLe = parseInt(ty_le_thanh_cong);
        if (isNaN(tyLe) || tyLe < 1 || tyLe > 100) return res.status(400).json({ success: false, error: 'Tỷ lệ 1-100%!' });
        const m = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM levels_config');
        const r = await pool.query('INSERT INTO levels_config (id, ten_canh_gioi, exp_yeu_cau, than_luc_yeu_cau, ty_le_thanh_cong, linh_thach_phuc_hoi) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [m.rows[0].next, ten_canh_gioi.trim(), parseInt(exp_yeu_cau)||0, parseInt(than_luc_yeu_cau)||0, tyLe, parseInt(linh_thach_phuc_hoi)||0]);
        res.json({ success: true, message: '✅ Thêm thành công!', level: r.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.put('/admin/levels-config/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { exp_yeu_cau, than_luc_yeu_cau, ty_le_thanh_cong, linh_thach_phuc_hoi } = req.body;
        const tyLe = parseInt(ty_le_thanh_cong);
        if (isNaN(tyLe) || tyLe < 1 || tyLe > 100) return res.status(400).json({ success: false, error: 'Tỷ lệ 1-100%!' });
        if (parseInt(exp_yeu_cau) < 0 || parseInt(than_luc_yeu_cau) < 0 || parseInt(linh_thach_phuc_hoi) < 0) return res.status(400).json({ success: false, error: 'Không âm!' });
        const r = await pool.query('UPDATE levels_config SET exp_yeu_cau=$1, than_luc_yeu_cau=$2, ty_le_thanh_cong=$3, linh_thach_phuc_hoi=$4 WHERE id=$5 RETURNING *', [parseInt(exp_yeu_cau), parseInt(than_luc_yeu_cau), tyLe, parseInt(linh_thach_phuc_hoi)||0, id]);
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' });
        res.json({ success: true, message: '✅ Cập nhật thành công!', level: r.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.delete('/admin/levels-config/:id', async (req, res) => {
    try {
        const r = await pool.query('DELETE FROM levels_config WHERE id=$1 RETURNING id', [req.params.id]);
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' });
        res.json({ success: true, message: '✅ Đã xóa!' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ===================== SHOP ITEMS =====================
router.get('/admin/shop-items', async (req, res) => {
    try { const r = await pool.query('SELECT * FROM shop_items ORDER BY id ASC'); res.json({ success: true, items: r.rows }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
router.post('/admin/shop-items', async (req, res) => {
    try {
        const { name, effect_type, effect_value, price_linh_thach, price_kim_cuong, description, is_active } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Thiếu tên!' });
        if (!['HEAL_INJURY','ADD_EXP'].includes(effect_type)) return res.status(400).json({ success: false, error: 'Loại không hợp lệ!' });
        if (parseInt(price_linh_thach) < 0 || parseInt(price_kim_cuong) < 0) return res.status(400).json({ success: false, error: 'Giá không âm!' });
        if (parseInt(price_linh_thach) === 0 && parseInt(price_kim_cuong) === 0) return res.status(400).json({ success: false, error: 'Phải có giá!' });
        const m = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM shop_items');
        const r = await pool.query('INSERT INTO shop_items (id, name, effect_type, effect_value, price_linh_thach, price_kim_cuong, description, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [m.rows[0].next, name.trim(), effect_type, parseInt(effect_value)||0, parseInt(price_linh_thach)||0, parseInt(price_kim_cuong)||0, description||'', is_active !== false]);
        res.json({ success: true, message: '✅ Thêm thành công!', item: r.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.put('/admin/shop-items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, effect_type, effect_value, price_linh_thach, price_kim_cuong, description, is_active } = req.body;
        const sets = [], params = []; let idx = 1;
        if (name !== undefined) { sets.push(`name = $${idx}`); params.push(name.trim()); idx++; }
        if (effect_type !== undefined) { sets.push(`effect_type = $${idx}`); params.push(effect_type); idx++; }
        if (effect_value !== undefined) { sets.push(`effect_value = $${idx}`); params.push(parseInt(effect_value)||0); idx++; }
        if (price_linh_thach !== undefined) { sets.push(`price_linh_thach = $${idx}`); params.push(parseInt(price_linh_thach)||0); idx++; }
        if (price_kim_cuong !== undefined) { sets.push(`price_kim_cuong = $${idx}`); params.push(parseInt(price_kim_cuong)||0); idx++; }
        if (description !== undefined) { sets.push(`description = $${idx}`); params.push(description); idx++; }
        if (is_active !== undefined) { sets.push(`is_active = $${idx}`); params.push(is_active); idx++; }
        if (sets.length === 0) return res.status(400).json({ success: false, error: 'Không có dữ liệu!' });
        params.push(id);
        const r = await pool.query(`UPDATE shop_items SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' });
        res.json({ success: true, message: '✅ Cập nhật thành công!', item: r.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.delete('/admin/shop-items/:id', async (req, res) => {
    try { const r = await pool.query('DELETE FROM shop_items WHERE id=$1 RETURNING id', [req.params.id]); if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' }); res.json({ success: true, message: '✅ Đã xóa!' }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===================== MISSIONS CONFIG =====================
router.get('/admin/missions-config', async (req, res) => {
    try { const r = await pool.query('SELECT * FROM missions_config ORDER BY id ASC'); res.json({ success: true, missions: r.rows }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
router.post('/admin/missions-config', async (req, res) => {
    try {
        const { name, mission_type, action_type, target_value, cycle, is_active, reward_lt, reward_exp } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Thiếu tên!' });
        if (!mission_type) return res.status(400).json({ success: false, error: 'Thiếu mã!' });
        if (!['READ_CHAPTER','COMMENT','LOGIN','NOMINATE','TOPUP'].includes(action_type)) return res.status(400).json({ success: false, error: 'Action không hợp lệ!' });
        if (parseInt(reward_lt) < 0 || parseInt(reward_exp) < 0) return res.status(400).json({ success: false, error: 'Thưởng không âm!' });
        if (parseInt(target_value) < 1) return res.status(400).json({ success: false, error: 'Số lượng >= 1!' });
        const d = await pool.query('SELECT id FROM missions_config WHERE mission_type = $1', [mission_type.trim()]);
        if (d.rows.length > 0) return res.status(409).json({ success: false, error: `Mã "${mission_type}" đã tồn tại!` });
        const r = await pool.query('INSERT INTO missions_config (name, mission_type, action_type, target_value, cycle, is_active, reward_lt, reward_exp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [name.trim(), mission_type.trim(), action_type, parseInt(target_value)||1, cycle||'DAILY', is_active !== false, parseInt(reward_lt)||0, parseInt(reward_exp)||0]);
        res.json({ success: true, message: '✅ Thêm thành công!', mission: r.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.put('/admin/missions-config/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, mission_type, action_type, target_value, cycle, is_active, reward_lt, reward_exp } = req.body;
        const sets = [], params = []; let idx = 1;
        if (name !== undefined) { sets.push(`name = $${idx}`); params.push(name.trim()); idx++; }
        if (mission_type !== undefined) { sets.push(`mission_type = $${idx}`); params.push(mission_type.trim()); idx++; }
        if (action_type !== undefined) { if (!['READ_CHAPTER','COMMENT','LOGIN','NOMINATE','TOPUP'].includes(action_type)) return res.status(400).json({ success: false, error: 'Action không hợp lệ!' }); sets.push(`action_type = $${idx}`); params.push(action_type); idx++; }
        if (target_value !== undefined) { if (parseInt(target_value) < 1) return res.status(400).json({ success: false, error: 'Số lượng >= 1!' }); sets.push(`target_value = $${idx}`); params.push(parseInt(target_value)||1); idx++; }
        if (cycle !== undefined) { if (!['DAILY','ONCE'].includes(cycle)) return res.status(400).json({ success: false, error: 'Cycle không hợp lệ!' }); sets.push(`cycle = $${idx}`); params.push(cycle); idx++; }
        if (is_active !== undefined) { sets.push(`is_active = $${idx}`); params.push(is_active === true || is_active === 'true'); idx++; }
        if (reward_lt !== undefined) { if (parseInt(reward_lt) < 0) return res.status(400).json({ success: false, error: 'LT không âm!' }); sets.push(`reward_lt = $${idx}`); params.push(parseInt(reward_lt)||0); idx++; }
        if (reward_exp !== undefined) { if (parseInt(reward_exp) < 0) return res.status(400).json({ success: false, error: 'EXP không âm!' }); sets.push(`reward_exp = $${idx}`); params.push(parseInt(reward_exp)||0); idx++; }
        if (sets.length === 0) return res.status(400).json({ success: false, error: 'Không có dữ liệu!' });
        params.push(id);
        const r = await pool.query(`UPDATE missions_config SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' });
        res.json({ success: true, message: '✅ Cập nhật thành công!', mission: r.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.delete('/admin/missions-config/:id', async (req, res) => {
    try { const r = await pool.query('DELETE FROM missions_config WHERE id=$1 RETURNING id', [req.params.id]); if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' }); res.json({ success: true, message: '✅ Đã xóa!' }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===================== ADMIN USERS =====================
router.get('/admin/users', async (req, res) => {
    try {
        const { search, role, is_vip, is_injured, page='1', limit='20' } = req.query;
        const pn = Math.max(1, parseInt(page)||1), lm = Math.min(100, Math.max(1, parseInt(limit)||20)), off = (pn-1)*lm;
        const cond = [], par = []; let idx = 1;
        if (search) { cond.push(`(p.display_name ILIKE $${idx} OR p.dao_hieu ILIKE $${idx} OR p.email ILIKE $${idx})`); par.push(`%${search.trim()}%`); idx++; }
        if (role) { cond.push(`p.role = $${idx}`); par.push(role.trim()); idx++; }
        if (is_vip === 'true' || is_vip === '1') cond.push('p.is_vip = true');
        else if (is_vip === 'false' || is_vip === '0') cond.push('p.is_vip = false');
        if (is_injured === 'true' || is_injured === '1') cond.push('p.is_injured = true');
        else if (is_injured === 'false' || is_injured === '0') cond.push('(p.is_injured = false OR p.is_injured IS NULL)');
        const w = cond.length > 0 ? 'WHERE ' + cond.join(' AND ') : '';
        const ct = await pool.query(`SELECT COUNT(*)::int AS total FROM profiles p ${w}`, par);
        const r = await pool.query(`SELECT p.id, p.display_name, p.dao_hieu, p.email, p.role, p.linh_thach, p.kim_cuong, p.tu_vi_exp, p.canh_gioi_id, p.is_vip, p.is_injured, p.injured_until, COALESCE(lc.ten_canh_gioi, 'Không') AS ten_canh_gioi FROM profiles p LEFT JOIN levels_config lc ON p.canh_gioi_id = lc.id ${w} ORDER BY p.email ASC LIMIT $${idx} OFFSET $${idx+1}`, [...par, lm, off]);
        res.json({ success: true, users: r.rows, pagination: { page: pn, limit: lm, total: ct.rows[0]?.total||0, total_pages: Math.ceil((ct.rows[0]?.total||0)/lm) } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.post('/admin/users/adjust-balance', async (req, res) => {
    try {
        const { user_id, linh_thach, kim_cuong, tu_vi_exp } = req.body;
        if (!user_id || !/^[0-9a-f-]+$/i.test(user_id)) return res.status(400).json({ success: false, error: 'ID không hợp lệ!' });
        const r = await pool.query('UPDATE profiles SET linh_thach = GREATEST(0, COALESCE(linh_thach,0)+$1), kim_cuong = GREATEST(0, COALESCE(kim_cuong,0)+$2), tu_vi_exp = GREATEST(0, COALESCE(tu_vi_exp,0)+$3) WHERE id=$4 RETURNING id,display_name,linh_thach,kim_cuong,tu_vi_exp', [parseInt(linh_thach)||0, parseInt(kim_cuong)||0, parseInt(tu_vi_exp)||0, user_id]);
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' });
        res.json({ success: true, message: '✅ Đã điều chỉnh!', user: r.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.post('/admin/users/injure', async (req, res) => {
    try {
        const { user_id, days } = req.body;
        if (!user_id || !/^[0-9a-f-]+$/i.test(user_id)) return res.status(400).json({ success: false, error: 'ID không hợp lệ!' });
        const d = parseInt(days) || 1; if (d < 1) return res.status(400).json({ success: false, error: 'Số ngày >= 1!' });
        const c = await pool.query('SELECT id, display_name FROM profiles WHERE id=$1', [user_id]);
        if (c.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' });
        await pool.query('UPDATE profiles SET is_injured=true, injured_until=NOW()+($1::int||\' days\')::INTERVAL WHERE id=$2', [d, user_id]);
        res.json({ success: true, message: `✅ Đã "đả thương" ${c.rows[0].display_name} ${d} ngày!` });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.post('/admin/users/heal', async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id || !/^[0-9a-f-]+$/i.test(user_id)) return res.status(400).json({ success: false, error: 'ID không hợp lệ!' });
        const r = await pool.query('UPDATE profiles SET is_injured=false, injured_until=NULL WHERE id=$1 RETURNING id,display_name', [user_id]);
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' });
        res.json({ success: true, message: `✅ Đã hồi phục ${r.rows[0].display_name}!` });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ===================== ADMIN BOOKS =====================
router.get('/admin/books', async (req, res) => {
    try {
        const { search, status, is_vip, trang_thai, page='1', limit='20' } = req.query;
        const pn = Math.max(1, parseInt(page)||1), lm = Math.min(100, Math.max(1, parseInt(limit)||20)), off = (pn-1)*lm;
        const cond = [], par = []; let idx = 1;
        if (search) { cond.push(`(b.ten_truyen ILIKE $${idx} OR b.tac_gia ILIKE $${idx})`); par.push(`%${search.trim()}%`); idx++; }
        const fs = status || trang_thai;
        if (fs) { cond.push(`b.trang_thai ILIKE $${idx}`); par.push(`%${fs.trim()}%`); idx++; }
        if (is_vip === 'true' || is_vip === '1') cond.push('b.is_vip = true');
        else if (is_vip === 'false' || is_vip === '0') cond.push('b.is_vip = false');
        const w = cond.length > 0 ? 'WHERE ' + cond.join(' AND ') : '';
        const ct = await pool.query(`SELECT COUNT(*)::int AS total FROM books b ${w}`, par);
        const r = await pool.query(`SELECT b.id, b.anh_bia, b.ten_truyen, b.tac_gia, b.so_chuong, b.luot_xem, b.is_vip, b.trang_thai, b.created_at, b.slug FROM books b ${w} ORDER BY b.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...par, lm, off]);
        res.json({ success: true, books: r.rows, pagination: { page: pn, limit: lm, total: ct.rows[0]?.total||0, total_pages: Math.ceil((ct.rows[0]?.total||0)/lm) } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.put('/admin/books/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ten_truyen, tac_gia, anh_bia, gioi_thieu, nguon, trang_thai, link_goc, the_loai, slug } = req.body;
        if (!ten_truyen) return res.status(400).json({ success: false, error: 'Thiếu tên!' });
        const sets = ['ten_truyen = $1'], params = [ten_truyen.trim()]; let idx = 2;
        if (tac_gia !== undefined) { sets.push(`tac_gia = $${idx}`); params.push(tac_gia.trim()||'Khuyết Danh'); idx++; }
        if (anh_bia !== undefined) { sets.push(`anh_bia = $${idx}`); params.push(anh_bia.trim()||''); idx++; }
        if (gioi_thieu !== undefined) { sets.push(`gioi_thieu = $${idx}`); params.push(gioi_thieu.trim()||''); idx++; }
        if (nguon !== undefined) { sets.push(`nguon = $${idx}`); params.push(nguon.trim()||''); idx++; }
        if (trang_thai !== undefined) { sets.push(`trang_thai = $${idx}`); params.push(trang_thai.trim()||''); idx++; }
        if (link_goc !== undefined) { sets.push(`link_goc = $${idx}`); params.push(link_goc.trim()||''); idx++; }
        if (the_loai !== undefined) { sets.push(`the_loai = $${idx}`); params.push(the_loai); idx++; }
        if (slug !== undefined) { sets.push(`slug = $${idx}`); params.push(slug.trim()||''); idx++; }
        sets.push('updated_at = NOW()');
        params.push(id);
        const r = await pool.query(`UPDATE books SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, ten_truyen, tac_gia, anh_bia, slug, trang_thai`, params);
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' });
        res.json({ success: true, message: '✅ Cập nhật thành công!', book: r.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.post('/admin/books/update-status', async (req, res) => {
    try { const { book_id, status } = req.body; if (!book_id || !status) return res.status(400).json({ success: false, error: 'Thiếu thông tin!' }); await pool.query('UPDATE books SET trang_thai=$1, updated_at=NOW() WHERE id=$2', [status, book_id]); res.json({ success: true, message: `✅ Cập nhật "${status}"!` }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
router.post('/admin/books/toggle-vip', async (req, res) => {
    try { const { book_id, is_vip } = req.body; if (!book_id || typeof is_vip !== 'boolean') return res.status(400).json({ success: false, error: 'Thiếu thông tin!' }); await pool.query('UPDATE books SET is_vip=$1, updated_at=NOW() WHERE id=$2', [is_vip, book_id]); res.json({ success: true, message: is_vip ? '✅ Bật VIP!' : '✅ Tắt VIP!', is_vip }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
router.post('/admin/books/delete', async (req, res) => {
    try {
        const { book_id, hard_delete } = req.body;
        if (!book_id) return res.status(400).json({ success: false, error: 'Thiếu ID!' });
        if (hard_delete) {
            await pool.query('DELETE FROM comments WHERE book_id=$1', [book_id]);
            await pool.query('DELETE FROM chapters WHERE book_id=$1', [book_id]);
            await pool.query('DELETE FROM reading_history WHERE book_id=$1', [book_id]);
            await pool.query('DELETE FROM bookmarks WHERE book_id=$1', [book_id]);
            await pool.query('DELETE FROM book_categories WHERE book_id=$1', [book_id]);
            await pool.query('DELETE FROM books WHERE id=$1', [book_id]);
            res.json({ success: true, message: '✅ Đã xóa vĩnh viễn!' });
        } else {
            await pool.query("UPDATE books SET trang_thai='Đã xóa', updated_at=NOW() WHERE id=$1", [book_id]);
            res.json({ success: true, message: '✅ Đã đánh dấu xóa!' });
        }
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.post('/admin/approve_book', async (req, res) => {
    try { const { book_id, action } = req.body; if (!book_id) return res.status(400).json({ success: false, error: 'Thiếu ID!' }); const ns = action === 'approve' ? 'Đã duyệt' : 'Đã từ chối'; await pool.query('UPDATE books SET trang_thai=$1 WHERE id=$2', [ns, book_id]); res.json({ success: true, message: `✅ ${ns}!` }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===================== ADMIN CHAPTERS =====================
router.get('/admin/chapters/suggest-number', async (req, res) => {
    try { const { book_id } = req.query; if (!book_id) return res.status(400).json({ success: false, error: 'Thiếu book_id!' }); const r = await pool.query('SELECT COALESCE(MAX(chapter_number), 0) + 1 AS next FROM chapters WHERE book_id=$1', [book_id]); res.json({ success: true, next_chapter_number: r.rows[0]?.next || 1 }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
router.get('/admin/chapters', async (req, res) => {
    try {
        const { book_id, search, page='1', limit='30' } = req.query;
        if (!book_id) return res.status(400).json({ success: false, error: 'Thiếu book_id!' });
        const pn = Math.max(1, parseInt(page)||1), lm = Math.min(200, Math.max(1, parseInt(limit)||30)), off = (pn-1)*lm;
        const par = [book_id]; let idx = 2, w = `WHERE book_id = $1`;
        if (search) { w += ` AND (title ILIKE $${idx} OR chapter_number::text ILIKE $${idx})`; par.push(`%${search.trim()}%`); idx++; }
        const ct = await pool.query(`SELECT COUNT(*)::int AS total FROM chapters ${w}`, par);
        const r = await pool.query(`SELECT id, book_id, chapter_number, title, COALESCE(price,0) AS price, LENGTH(content) AS total_chars FROM chapters ${w} ORDER BY chapter_number DESC LIMIT $${idx} OFFSET $${idx+1}`, [...par, lm, off]);
        res.json({ success: true, chapters: r.rows, pagination: { page: pn, limit: lm, total: ct.rows[0]?.total||0, total_pages: Math.ceil((ct.rows[0]?.total||0)/lm) } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.get('/admin/chapters/:id', async (req, res) => {
    try { const r = await pool.query('SELECT id, book_id, chapter_number, title, content, price FROM chapters WHERE id=$1', [req.params.id]); if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' }); res.json({ success: true, chapter: r.rows[0] }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
router.post('/admin/chapters', async (req, res) => {
    try {
        const { book_id, chapter_number, title, content, price } = req.body;
        if (!book_id || !chapter_number || !title || !content) return res.status(400).json({ success: false, error: 'Thiếu thông tin!' });
        const d = await pool.query('SELECT id FROM chapters WHERE book_id=$1 AND chapter_number=$2', [book_id, chapter_number]);
        if (d.rows.length > 0) return res.status(409).json({ success: false, error: `Số ${chapter_number} đã tồn tại!` });
        const cp = parseInt(price)||0;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const ins = await client.query('INSERT INTO chapters (book_id, chapter_number, title, content, price) VALUES ($1,$2,$3,$4,$5) RETURNING id', [book_id, chapter_number, title.trim(), content, cp]);
            await client.query('UPDATE books SET so_chuong = so_chuong + 1, updated_at = NOW() WHERE id = $1', [book_id]);
            await client.query('COMMIT');
            res.json({ success: true, message: '✅ Thêm chương thành công!', chapter_id: ins.rows[0].id });
        } catch (err) { await client.query('ROLLBACK'); throw err; }
        finally { client.release(); }
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.put('/admin/chapters/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { chapter_number, title, content, price, book_id } = req.body;
        if (!id || !chapter_number || !title || !content) return res.status(400).json({ success: false, error: 'Thiếu thông tin!' });
        let ab = book_id;
        if (!ab) { const c = await pool.query('SELECT book_id FROM chapters WHERE id=$1', [id]); if (c.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' }); ab = c.rows[0].book_id; }
        const d = await pool.query('SELECT id FROM chapters WHERE book_id=$1 AND chapter_number=$2 AND id!=$3', [ab, chapter_number, id]);
        if (d.rows.length > 0) return res.status(409).json({ success: false, error: `Số ${chapter_number} đã tồn tại!` });
        await pool.query('UPDATE chapters SET chapter_number=$1, title=$2, content=$3, price=$4 WHERE id=$5', [chapter_number, title.trim(), content.trim(), parseInt(price)||0, id]);
        await pool.query('UPDATE books SET so_chuong = (SELECT COUNT(id) FROM chapters WHERE book_id=$1), updated_at=NOW() WHERE id=$1', [ab]);
        res.json({ success: true, message: '✅ Cập nhật chương thành công!' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.post('/admin/chapters/delete', async (req, res) => {
    try {
        const { book_id, chapter_ids } = req.body;
        if (!book_id || !chapter_ids || !Array.isArray(chapter_ids) || chapter_ids.length === 0) return res.status(400).json({ success: false, error: 'Thiếu thông tin!' });
        const ids = chapter_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
        if (ids.length === 0) return res.status(400).json({ success: false, error: 'ID không hợp lệ!' });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const del = await client.query('DELETE FROM chapters WHERE id = ANY($1::int[]) AND book_id = $2', [ids, book_id]);
            await client.query('UPDATE books SET so_chuong = (SELECT COUNT(id) FROM chapters WHERE book_id=$1), updated_at=NOW() WHERE id=$1', [book_id]);
            await client.query('COMMIT');
            res.json({ success: true, message: `✅ Đã xóa ${del.rowCount} chương!` });
        } catch (err) { await client.query('ROLLBACK'); throw err; }
        finally { client.release(); }
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ===================== ADMIN BILLING =====================
router.get('/admin/transactions', async (req, res) => {
    try {
        const { search, status, page='1', limit='20' } = req.query;
        const pn = Math.max(1, parseInt(page)||1), lm = Math.min(100, Math.max(1, parseInt(limit)||20)), off = (pn-1)*lm;
        const cond = [], par = []; let idx = 1;
        if (search) { cond.push(`(p.email ILIKE $${idx} OR t.id::text ILIKE $${idx} OR t.reference_id ILIKE $${idx})`); par.push(`%${search.trim()}%`); idx++; }
        if (status) { cond.push(`t.status ILIKE $${idx}`); par.push(status.trim()); idx++; }
        const w = cond.length > 0 ? 'WHERE ' + cond.join(' AND ') : '';
        const ct = await pool.query(`SELECT COUNT(*)::int AS total FROM transactions t LEFT JOIN profiles p ON t.user_id = p.id ${w}`, par);
        const r = await pool.query(`SELECT t.id, t.amount_vnd, t.kim_cuong_added, t.payment_method, t.status, t.reference_id, t.description, t.created_at, COALESCE(p.display_name, p.dao_hieu, 'Đạo Hữu') AS display_name, p.email FROM transactions t LEFT JOIN profiles p ON t.user_id = p.id ${w} ORDER BY t.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...par, lm, off]);
        res.json({ success: true, transactions: r.rows, pagination: { page: pn, limit: lm, total: ct.rows[0]?.total||0, total_pages: Math.ceil((ct.rows[0]?.total||0)/lm) } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.post('/admin/transactions/approve', async (req, res) => {
    try {
        const { transaction_id } = req.body;
        if (!transaction_id) return res.status(400).json({ success: false, error: 'Thiếu ID!' });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const tx = await client.query("SELECT id, user_id, kim_cuong_added, status FROM transactions WHERE id=$1 AND (status IS NULL OR status='PENDING') FOR UPDATE", [transaction_id]);
            if (tx.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Không tìm thấy hoặc đã duyệt!' }); }
            const t = tx.rows[0];
            await client.query("UPDATE transactions SET status='SUCCESS' WHERE id=$1", [transaction_id]);
            if ((parseInt(t.kim_cuong_added)||0) > 0 && t.user_id) await client.query('UPDATE profiles SET kim_cuong = COALESCE(kim_cuong,0) + $1 WHERE id=$2', [t.kim_cuong_added, t.user_id]);
            await client.query('COMMIT');
            res.json({ success: true, message: `✅ Đã duyệt! Cộng ${t.kim_cuong_added||0}KC.` });
        } catch (err) { await client.query('ROLLBACK'); throw err; }
        finally { client.release(); }
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.get('/admin/packages', async (req, res) => {
    try { const r = await pool.query('SELECT * FROM packages ORDER BY id ASC'); res.json({ success: true, packages: r.rows }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
router.post('/admin/packages', async (req, res) => {
    try {
        const { name, type, price, value, description, is_active } = req.body;
        if (!name || price === undefined || value === undefined) return res.status(400).json({ success: false, error: 'Thiếu thông tin!' });
        const r = await pool.query('INSERT INTO packages (name, type, price, value, description, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [name.trim(), type||'kim_cuong', price, value, description||'', is_active !== false]);
        res.json({ success: true, message: '✅ Thêm gói nạp!', package: r.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.put('/admin/packages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, price, value, description, is_active } = req.body;
        const sets = [], params = []; let idx = 1;
        if (name !== undefined) { sets.push(`name = $${idx}`); params.push(name.trim()); idx++; }
        if (type !== undefined) { sets.push(`type = $${idx}`); params.push(type); idx++; }
        if (price !== undefined) { sets.push(`price = $${idx}`); params.push(price); idx++; }
        if (value !== undefined) { sets.push(`value = $${idx}`); params.push(value); idx++; }
        if (description !== undefined) { sets.push(`description = $${idx}`); params.push(description); idx++; }
        if (is_active !== undefined) { sets.push(`is_active = $${idx}`); params.push(is_active); idx++; }
        if (sets.length === 0) return res.status(400).json({ success: false, error: 'Không có dữ liệu!' });
        params.push(id);
        const r = await pool.query(`UPDATE packages SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' });
        res.json({ success: true, message: '✅ Cập nhật gói!', package: r.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.delete('/admin/packages/:id', async (req, res) => {
    try { const r = await pool.query('DELETE FROM packages WHERE id=$1 RETURNING id', [req.params.id]); if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' }); res.json({ success: true, message: '✅ Đã xóa!' }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ===================== NOTIFICATIONS =====================
router.get('/admin/notifications', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page)||1), limit = Math.min(100, Math.max(1, parseInt(req.query.limit)||20)), offset = (page-1)*limit;
        const ct = await pool.query('SELECT COUNT(*)::int AS total FROM notifications');
        const r = await pool.query(`SELECT n.id, n.title, n.message, n.link_url, n.user_id, n.created_at, n.linh_thach, n.kim_cuong, CASE WHEN n.user_id IS NOT NULL THEN COALESCE(p.display_name, p.dao_hieu, 'Đạo Hữu') ELSE NULL END AS target_name FROM notifications n LEFT JOIN profiles p ON n.user_id = p.id ORDER BY n.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
        res.json({ success: true, notifications: r.rows, pagination: { page, limit, total: ct.rows[0]?.total||0, total_pages: Math.ceil((ct.rows[0]?.total||0)/limit) } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.post('/admin/notifications/global', async (req, res) => {
    try {
        const { title, message, link_url, linh_thach, kim_cuong } = req.body;
        if (!title || !message) return res.status(400).json({ success: false, error: 'Thiếu tiêu đề/nội dung!' });
        const lt = parseInt(linh_thach)||0, kc = parseInt(kim_cuong)||0;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const nid = crypto.randomUUID();
            await client.query('INSERT INTO notifications (id, title, message, link_url, user_id, is_read, linh_thach, kim_cuong) VALUES ($1,$2,$3,$4,NULL,false,$5,$6) RETURNING id', [nid, title.trim(), message.trim(), link_url||null, lt, kc]);
            if (lt > 0 || kc > 0) await client.query('UPDATE profiles SET linh_thach = COALESCE(linh_thach,0)+$1, kim_cuong = COALESCE(kim_cuong,0)+$2', [lt, kc]);
            await client.query('COMMIT');
            let msg = '✅ Đã gửi!';
            if (lt > 0 && kc > 0) msg += ` kèm ${lt}LT + ${kc}KC!`;
            else if (lt > 0) msg += ` kèm ${lt}LT!`;
            else if (kc > 0) msg += ` kèm ${kc}KC!`;
            res.json({ success: true, message: msg, id: nid });
        } catch (err) { await client.query('ROLLBACK'); throw err; }
        finally { client.release(); }
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});
router.post('/admin/notifications/personal', async (req, res) => {
    try {
        const { user_id, title, message, link_url, linh_thach, kim_cuong } = req.body;
        if (!user_id || !title || !message) return res.status(400).json({ success: false, error: 'Thiếu thông tin!' });
        if (!/^[0-9a-f-]+$/i.test(user_id)) return res.status(400).json({ success: false, error: 'ID không hợp lệ!' });
        const c = await pool.query('SELECT id, display_name, dao_hieu FROM profiles WHERE id=$1', [user_id]);
        if (c.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy user!' });
        const uname = c.rows[0].display_name || c.rows[0].dao_hieu || 'Đạo Hữu';
        const lt = parseInt(linh_thach)||0, kc = parseInt(kim_cuong)||0;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const nid = crypto.randomUUID();
            await client.query('INSERT INTO notifications (id, title, message, link_url, user_id, is_read, linh_thach, kim_cuong) VALUES ($1,$2,$3,$4,$5,false,$6,$7)', [nid, title.trim(), message.trim(), link_url||null, user_id, lt, kc]);
            if (lt > 0 || kc > 0) await client.query('UPDATE profiles SET linh_thach = COALESCE(linh_thach,0)+$1, kim_cuong = COALESCE(kim_cuong,0)+$2 WHERE id=$3', [lt, kc, user_id]);
            await client.query('COMMIT');
            let msg = `✅ Đã gửi đến ${uname}!`;
            if (lt > 0 && kc > 0) msg += ` kèm ${lt}LT + ${kc}KC!`;
            else if (lt > 0) msg += ` kèm ${lt}LT!`;
            else if (kc > 0) msg += ` kèm ${kc}KC!`;
            res.json({ success: true, message: msg });
        } catch (err) { await client.query('ROLLBACK'); throw err; }
        finally { client.release(); }
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// PUT /api/admin/notifications/:id - Sửa thông báo
router.put('/admin/notifications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, message, link_url } = req.body;
        if (!title || !message) return res.status(400).json({ success: false, error: 'Thiếu tiêu đề/nội dung!' });
        const r = await pool.query('UPDATE notifications SET title=$1, message=$2, link_url=COALESCE($3,link_url) WHERE id=$4 RETURNING id, title, message', [title.trim(), message.trim(), link_url||null, id]);
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' });
        res.json({ success: true, message: '✅ Đã sửa thông báo!', notification: r.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// DELETE /api/admin/notifications/:id - Xóa thông báo
router.delete('/admin/notifications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const r = await pool.query('DELETE FROM notifications WHERE id=$1 RETURNING id', [id]);
        if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy!' });
        res.json({ success: true, message: '✅ Đã xóa thông báo!' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ===================== ADMIN STATS DETAILED =====================
router.get('/admin/stats/detailed', async (req, res) => {
    try {
        const v = await pool.query(`SELECT (SELECT COUNT(*) FROM reading_history WHERE updated_at>=NOW()-INTERVAL'1 day') AS d1, (SELECT COUNT(*) FROM reading_history WHERE updated_at>=NOW()-INTERVAL'3 days') AS d3, (SELECT COUNT(*) FROM reading_history WHERE updated_at>=NOW()-INTERVAL'7 days') AS w1, (SELECT COUNT(*) FROM reading_history WHERE updated_at>=NOW()-INTERVAL'30 days') AS m1`);
        const views = v.rows[0] || { d1:0, d3:0, w1:0, m1:0 };
        
        let catViews = [];
        try { catViews = (await pool.query(`SELECT c.name AS category_name, COUNT(DISTINCT b.id) AS book_count, COALESCE(SUM(b.luot_xem),0)::bigint AS total_views FROM categories c LEFT JOIN books b ON c.name=ANY(b.the_loai) GROUP BY c.id,c.name ORDER BY total_views DESC`)).rows; } catch(e) { try { catViews = (await pool.query(`SELECT c.name AS category_name, COUNT(DISTINCT b.id) AS book_count, COALESCE(SUM(b.luot_xem),0)::bigint AS total_views FROM books b JOIN book_categories bc ON b.id=bc.book_id JOIN categories c ON bc.category_id=c.id GROUP BY c.name ORDER BY total_views DESC`)).rows; } catch(e2) {} }
        
        let rev = { rows: [{ r1:0, r3:0, r7:0, r30:0 }] };
        try { rev = await pool.query(`SELECT COALESCE((SELECT SUM(amount_vnd) FROM transactions WHERE status='SUCCESS' AND created_at>=NOW()-INTERVAL'1 day'),0)::bigint AS r1, COALESCE((SELECT SUM(amount_vnd) FROM transactions WHERE status='SUCCESS' AND created_at>=NOW()-INTERVAL'3 days'),0)::bigint AS r3, COALESCE((SELECT SUM(amount_vnd) FROM transactions WHERE status='SUCCESS' AND created_at>=NOW()-INTERVAL'7 days'),0)::bigint AS r7, COALESCE((SELECT SUM(amount_vnd) FROM transactions WHERE created_at>=NOW()-INTERVAL'30 days'),0)::bigint AS r30`); } catch(e) { try { rev = await pool.query(`SELECT COALESCE((SELECT SUM(amount_vnd) FROM transactions WHERE created_at>=NOW()-INTERVAL'1 day'),0)::bigint AS r1, COALESCE((SELECT SUM(amount_vnd) FROM transactions WHERE created_at>=NOW()-INTERVAL'3 days'),0)::bigint AS r3, COALESCE((SELECT SUM(amount_vnd) FROM transactions WHERE created_at>=NOW()-INTERVAL'7 days'),0)::bigint AS r7, COALESCE((SELECT SUM(amount_vnd) FROM transactions WHERE created_at>=NOW()-INTERVAL'30 days'),0)::bigint AS r30`); } catch(e2) {} }
        const revenue = rev.rows[0] || { r1:0, r3:0, r7:0, r30:0 };
        
        let vips = { rows: [{ v1:0, v3:0, v7:0, v30:0 }] };
        try { vips = await pool.query(`SELECT COALESCE((SELECT COUNT(DISTINCT user_id) FROM orders WHERE status='SUCCESS' AND package_type='VIP' AND created_at>=NOW()-INTERVAL'1 day'),0)::int AS v1, COALESCE((SELECT COUNT(DISTINCT user_id) FROM orders WHERE status='SUCCESS' AND package_type='VIP' AND created_at>=NOW()-INTERVAL'3 days'),0)::int AS v3, COALESCE((SELECT COUNT(DISTINCT user_id) FROM orders WHERE status='SUCCESS' AND package_type='VIP' AND created_at>=NOW()-INTERVAL'7 days'),0)::int AS v7, COALESCE((SELECT COUNT(DISTINCT user_id) FROM orders WHERE status='SUCCESS' AND package_type='VIP' AND created_at>=NOW()-INTERVAL'30 days'),0)::int AS v30`); } catch(e) { try { vips = await pool.query(`SELECT COALESCE((SELECT COUNT(*) FROM profiles WHERE is_vip=true AND updated_at>=NOW()-INTERVAL'1 day'),0)::int AS v1, COALESCE((SELECT COUNT(*) FROM profiles WHERE is_vip=true AND updated_at>=NOW()-INTERVAL'3 days'),0)::int AS v3, COALESCE((SELECT COUNT(*) FROM profiles WHERE is_vip=true AND updated_at>=NOW()-INTERVAL'7 days'),0)::int AS v7, COALESCE((SELECT COUNT(*) FROM profiles WHERE is_vip=true AND updated_at>=NOW()-INTERVAL'30 days'),0)::int AS v30`); } catch(e2) {} }
        const vipSummary = vips.rows[0] || { v1:0, v3:0, v7:0, v30:0 };
        
        let vipsByRealm = [];
        try { vipsByRealm = (await pool.query(`SELECT lc.ten_canh_gioi, COUNT(p.id)::int AS vip_count FROM profiles p JOIN levels_config lc ON p.canh_gioi_id=lc.id WHERE p.is_vip=true GROUP BY lc.id,lc.ten_canh_gioi ORDER BY vip_count DESC`)).rows; } catch(e) {}
        
        let tb = 0, tc = 0;
        try { tb = (await pool.query('SELECT COUNT(*)::int AS c FROM books')).rows[0]?.c || 0; } catch(e) {}
        try { tc = (await pool.query('SELECT COUNT(*)::int AS c FROM chapters')).rows[0]?.c || 0; } catch(e) {}
        
        res.json({ success: true, data: {
            views_by_time: { label: 'Lượt đọc', items: [
                { period: '1_day', label: '24h qua', value: parseInt(views.d1)||0 },
                { period: '3_days', label: '3 ngày', value: parseInt(views.d3)||0 },
                { period: '1_week', label: '7 ngày', value: parseInt(views.w1)||0 },
                { period: '1_month', label: '30 ngày', value: parseInt(views.m1)||0 }
            ]},
            views_by_category: catViews.map(c => ({ category_name: c.category_name, book_count: parseInt(c.book_count)||0, total_views: parseInt(c.total_views)||0 })),
            revenue_by_time: { label: 'Doanh thu', items: [
                { period: '1_day', label: '24h', value: parseInt(revenue.r1)||0 },
                { period: '3_days', label: '3 ngày', value: parseInt(revenue.r3)||0 },
                { period: '1_week', label: '7 ngày', value: parseInt(revenue.r7)||0 },
                { period: '1_month', label: '30 ngày', value: parseInt(revenue.r30)||0 }
            ]},
                new_vips_by_time: { label: 'VIP mới', items: [
                { period: '1_day', label: '24h', value: parseInt(vipSummary.v1)||0 },
                { period: '3_days', label: '3 ngày', value: parseInt(vipSummary.v3)||0 },
                { period: '1_week', label: '7 ngày', value: parseInt(vipSummary.v7)||0 },
                { period: '1_month', label: '30 ngày', value: parseInt(vipSummary.v30)||0 }
            ]},
            vips_by_realm: vipsByRealm.map(r => ({ ten_canh_gioi: r.ten_canh_gioi, vip_count: parseInt(r.vip_count)||0 })),
            totals: { total_books: tb, total_chapters: tc, total_vips: vipsByRealm.reduce((s,r) => s + (parseInt(r.vip_count)||0), 0) }
        }});
    } catch (error) { res.status(500).json({ success: false, error: error.message, data: null }); }
});

module.exports = router;