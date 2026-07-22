/**
 * Routes: Admin Video Reviews Management (youtube_truyen)
 * CRUD + dead link scanning for admin panel
 */
const express = require('express');
const router = express.Router();
const https = require('https');
const pool = require('../../db');

// ===================== LIST/SEARCH VIDEOS =====================
// GET /api/admin/video-reviews?page=1&limit=20&keyword=...
router.get('/admin/video-reviews', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;
        const keyword = (req.query.keyword || '').trim();

        let whereClause = '';
        const params = [];
        let paramIdx = 1;

        if (keyword) {
            whereClause = `WHERE (ten_truyen_sach ILIKE $${paramIdx} OR dinh_danh_tap ILIKE $${paramIdx})`;
            params.push(`%${keyword}%`);
            paramIdx++;
        }

        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total FROM youtube_truyen ${whereClause}`,
            params
        );
        const total = countResult.rows[0].total;
        const totalPages = Math.ceil(total / limit);

        const dataResult = await pool.query(
            `SELECT id_video, ten_truyen_sach, dinh_danh_tap, tiu_de_goc, link_video, 
                    phong_cach_review, the_loai_goc, luu_phai_chi_tiet, 
                    thoi_luong_giay, luot_xem, luot_thich, ngay_dang, 
                    anh_thumbnail, created_at
             FROM youtube_truyen ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
            [...params, limit, offset]
        );

        res.json({
            success: true,
            videos: dataResult.rows,
            pagination: {
                page,
                limit,
                total,
                total_pages: totalPages
            }
        });
    } catch (error) {
        console.error('[admin-videos] List error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===================== ADD VIDEO =====================
// POST /api/admin/video-reviews
router.post('/admin/video-reviews', async (req, res) => {
    try {
        const {
            ten_truyen_sach, dinh_danh_tap, tiu_de_goc, link_video,
            phong_cach_review, the_loai_goc, luu_phai_chi_tiet,
            thoi_luong_giay, luot_xem, luot_thich, ngay_dang,
            anh_thumbnail
        } = req.body;

        if (!ten_truyen_sach || !link_video) {
            return res.status(400).json({ success: false, error: 'Thiếu tên truyện hoặc link video!' });
        }

        // Generate a UUID-like id if not provided
        const id_video = req.body.id_video || require('crypto').randomUUID();

        const result = await pool.query(
            `INSERT INTO youtube_truyen (
                id_video, ten_truyen_sach, dinh_danh_tap, tiu_de_goc, link_video,
                phong_cach_review, the_loai_goc, luu_phai_chi_tiet,
                thoi_luong_giay, luot_xem, luot_thich, ngay_dang,
                anh_thumbnail
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING *`,
            [
                id_video, ten_truyen_sach.trim(), dinh_danh_tap || '', tiu_de_goc || '',
                link_video.trim(), phong_cach_review || '',
                the_loai_goc || [], luu_phai_chi_tiet || [],
                parseInt(thoi_luong_giay) || 0, parseInt(luot_xem) || 0,
                parseInt(luot_thich) || 0, ngay_dang || null,
                anh_thumbnail || ''
            ]
        );

        res.json({ success: true, message: '✅ Thêm video thành công!', video: result.rows[0] });
    } catch (error) {
        console.error('[admin-videos] Add error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===================== UPDATE VIDEO =====================
// PUT /api/admin/video-reviews/:id
router.put('/admin/video-reviews/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const fields = [
            'ten_truyen_sach', 'dinh_danh_tap', 'tiu_de_goc', 'link_video',
            'phong_cach_review', 'the_loai_goc', 'luu_phai_chi_tiet',
            'thoi_luong_giay', 'luot_xem', 'luot_thich', 'ngay_dang',
            'anh_thumbnail'
        ];

        const setClauses = [];
        const params = [];
        let idx = 1;

        for (const field of fields) {
            if (req.body[field] !== undefined) {
                setClauses.push(`${field} = $${idx}`);
                params.push(req.body[field]);
                idx++;
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ success: false, error: 'Không có dữ liệu cập nhật!' });
        }

        params.push(id);
        const result = await pool.query(
            `UPDATE youtube_truyen SET ${setClauses.join(', ')} WHERE id_video = $${idx} RETURNING *`,
            params
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy video!' });
        }

        res.json({ success: true, message: '✅ Cập nhật thành công!', video: result.rows[0] });
    } catch (error) {
        console.error('[admin-videos] Update error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===================== DELETE VIDEO =====================
// DELETE /api/admin/video-reviews/:id
router.delete('/admin/video-reviews/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'DELETE FROM youtube_truyen WHERE id_video = $1 RETURNING id_video, ten_truyen_sach',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy video!' });
        }
        res.json({ success: true, message: `✅ Đã xóa "${result.rows[0].ten_truyen_sach}"!` });
    } catch (error) {
        console.error('[admin-videos] Delete error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===================== SCAN DEAD LINKS =====================
// POST /api/admin/video-reviews/check-links
router.post('/admin/video-reviews/check-links', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id_video, ten_truyen_sach, link_video FROM youtube_truyen 
             WHERE link_video IS NOT NULL AND link_video != ''
             ORDER BY ten_truyen_sach`
        );
        const videos = result.rows;
        const deadLinks = [];
        const CONCURRENCY = 5;

        // Check a single video link via YouTube oEmbed
        function checkLink(video) {
            return new Promise((resolve) => {
                const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(video.link_video)}&format=json`;
                const req = https.get(url, { timeout: 10000 }, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        if (res.statusCode === 404 || res.statusCode === 400 || res.statusCode === 401) {
                            resolve({ ...video, dead: true, status: res.statusCode });
                        } else {
                            resolve({ ...video, dead: false, status: res.statusCode });
                        }
                    });
                });
                req.on('error', () => resolve({ ...video, dead: true, status: 0 }));
                req.on('timeout', () => { req.destroy(); resolve({ ...video, dead: true, status: 0 }); });
            });
        }

        // Process in batches
        for (let i = 0; i < videos.length; i += CONCURRENCY) {
            const batch = videos.slice(i, i + CONCURRENCY);
            const results = await Promise.all(batch.map(checkLink));
            for (const r of results) {
                if (r.dead) deadLinks.push(r);
            }
        }

        res.json({
            success: true,
            total_checked: videos.length,
            dead_count: deadLinks.length,
            dead_links: deadLinks
        });
    } catch (error) {
        console.error('[admin-videos] Check links error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===================== DELETE DEAD LINKS (BATCH) =====================
// POST /api/admin/video-reviews/delete-dead-links
router.post('/admin/video-reviews/delete-dead-links', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'Danh sách ID không hợp lệ!' });
        }

        const result = await pool.query(
            'DELETE FROM youtube_truyen WHERE id_video = ANY($1::text[]) RETURNING id_video, ten_truyen_sach',
            [ids]
        );

        res.json({
            success: true,
            message: `✅ Đã xóa ${result.rowCount} video chết!`,
            deleted: result.rows
        });
    } catch (error) {
        console.error('[admin-videos] Delete dead links error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;