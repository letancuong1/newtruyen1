/**
 * Routes: Chapters (get_chapters, get_chapter_detail, unlock)
 */
const express = require('express');
const router = express.Router();
const pool = require('../../db');

// GET /api/get_chapters
router.get('/get_chapters', async (req, res) => {
    try {
        const bookId = req.query.book_id || null;
        if (!bookId) return res.status(400).json({ success: false, error: "Thiếu Linh Phù (book_id) của bí tịch!" });
        const result = await pool.query("SELECT id, title, chapter_number, book_id, COALESCE(price, 0) AS price FROM chapters WHERE book_id = $1 ORDER BY chapter_number ASC", [bookId]);
        res.json({ success: true, chapters: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/get_chapter_detail
router.get('/get_chapter_detail', async (req, res) => {
    try {
        const bookId = req.query.book_id || null;
        const chapterNumber = parseInt(req.query.chapter_number) || null;
        const userId = req.query.user_id || null;
        if (!bookId || !chapterNumber) return res.status(400).json({ success: false, error: "Thiếu ID truyện hoặc số chương!" });

        const result = await pool.query("SELECT id, book_id, chapter_number, title, content, price FROM chapters WHERE book_id = $1 AND chapter_number = $2", [bookId, chapterNumber]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Chương không tồn tại!" });

        const chapter = result.rows[0];
        const price = parseInt(chapter.price) || 0;

        if (price > 0) {
            let isUnlocked = false;
            if (userId) {
                const pCheck = await pool.query("SELECT 1 FROM transactions WHERE transaction_type = 'BUY_CHAPTER' AND user_id = $1 AND reference_id = $2 LIMIT 1", [userId, String(chapter.id)]);
                isUnlocked = pCheck.rows.length > 0;
            }
            if (!isUnlocked) {
                const teaser = (chapter.content || '').substring(0, Math.min(400, Math.floor((chapter.content || '').length * 0.05))) + '...';
                return res.json({ success: true, chapter: { ...chapter, content: teaser, is_locked: true, price }, message: `🔒 Chương này yêu cầu ${price} Kim Cương!` });
            }
        }
        res.json({ success: true, chapter: { ...chapter, is_locked: false } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/chapters/check_unlock
router.get('/chapters/check_unlock', async (req, res) => {
    try {
        const { chapter_id, user_id } = req.query;
        if (!chapter_id || !user_id) return res.json({ success: false, unlocked: false });
        const result = await pool.query("SELECT 1 FROM transactions WHERE transaction_type = 'BUY_CHAPTER' AND user_id = $1 AND reference_id = $2 LIMIT 1", [user_id, String(chapter_id)]);
        res.json({ success: true, unlocked: result.rows.length > 0 });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/chapters/unlock
router.post('/chapters/unlock', async (req, res) => {
    try {
        const { chapter_id, user_id } = req.body;
        if (!chapter_id || !user_id) return res.status(400).json({ success: false, error: 'Thiếu chapter_id hoặc user_id!' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const userRes = await client.query('SELECT id, kim_cuong FROM profiles WHERE id = $1 FOR UPDATE', [user_id]);
            if (userRes.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Không tìm thấy người dùng!' }); }
            const user = userRes.rows[0];

            const chRes = await client.query('SELECT id, book_id, chapter_number, title, price FROM chapters WHERE id = $1', [chapter_id]);
            if (chRes.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Không tìm thấy chương!' }); }
            const chapter = chRes.rows[0];
            const price = parseInt(chapter.price) || 0;
            if (price <= 0) { await client.query('ROLLBACK'); return res.json({ success: true, message: 'Chương này miễn phí!' }); }

            const exist = await client.query("SELECT 1 FROM transactions WHERE transaction_type = 'BUY_CHAPTER' AND user_id = $1 AND reference_id = $2 LIMIT 1", [user_id, String(chapter_id)]);
            if (exist.rows.length > 0) { await client.query('ROLLBACK'); return res.json({ success: true, message: 'Đã mở khóa rồi!' }); }

            const uKC = parseInt(user.kim_cuong) || 0;
            if (uKC < price) { await client.query('ROLLBACK'); return res.json({ success: false, error: `Không đủ Kim Cương! Cần ${price} KC, có ${uKC} KC.` }); }

            await client.query('UPDATE profiles SET kim_cuong = kim_cuong - $1 WHERE id = $2', [price, user_id]);
            await client.query("INSERT INTO transactions (user_id, amount, transaction_type, reference_id, description, created_at) VALUES ($1, $2, 'BUY_CHAPTER', $3, $4, NOW())", [user_id, price, String(chapter_id), `Mở khóa chương ${chapter.chapter_number}`]);
            await client.query('COMMIT');
            res.json({ success: true, message: `✅ Đã mở khóa chương ${chapter.chapter_number}!` });
        } catch (err) { await client.query('ROLLBACK'); throw err; }
        finally { client.release(); }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;