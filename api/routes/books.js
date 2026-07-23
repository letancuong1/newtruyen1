/**
 * Routes: Books (get_books, get_book_detail, get_books_by_category,...)
 */
const express = require('express');
const router = express.Router();
const pool = require('../../db');

// GET /api/get_books
router.get('/get_books', async (req, res) => {
    try {
        const type = req.query.type || 'random';
        let limit = parseInt(req.query.limit);
        if (isNaN(limit) || limit <= 0) limit = 9;
        if (limit > 50) limit = 50;

        let queryStr = `SELECT b.id, b.ten_truyen, b.anh_bia, b.tac_gia, b.luot_xem,
            COALESCE(c.avg,0)::float AS rating_avg, COALESCE(c.count,0)::int AS rating_count,
            b.slug, b.created_at, b.is_vip, b.so_chuong, b.gioi_thieu, b.the_loai
            FROM books b
            LEFT JOIN LATERAL (
                SELECT AVG(rating_stars) AS avg, COUNT(*) AS count FROM comments WHERE book_id = b.id
            ) c ON true`;
        let params = [limit];
        const whereDeleted = " (b.trang_thai IS NULL OR b.trang_thai NOT ILIKE '%đã xóa%') ";

        switch (type) {
            case 'random':    queryStr += ` WHERE${whereDeleted}ORDER BY RANDOM() LIMIT $1`; break;
            case 'top_read':  queryStr += ` WHERE${whereDeleted}ORDER BY COALESCE(luot_xem, 0) DESC LIMIT $1`; break;
            case 'top_rated': queryStr += ` WHERE${whereDeleted}ORDER BY COALESCE(rating_avg, 0) DESC LIMIT $1`; break;
            case 'completed': queryStr += ` WHERE${whereDeleted}AND (LOWER(trang_thai) IN ('full','hoàn thành','completed') OR trang_thai ILIKE '%full%') ORDER BY created_at DESC LIMIT $1`; break;
            case 'newest':    queryStr += ` WHERE${whereDeleted}ORDER BY created_at DESC LIMIT $1`; break;
            case 'vip':       queryStr += ` WHERE${whereDeleted}AND is_vip = true ORDER BY created_at DESC LIMIT $1`; break;
            default:          queryStr += ` WHERE${whereDeleted}ORDER BY RANDOM() LIMIT $1`; break;
        }

        const result = await pool.query(queryStr, params);
        res.set('Cache-Control', 'public, max-age=60');
        res.json({ success: true, books: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/get_book_detail
router.get('/get_book_detail', async (req, res) => {
    try {
        // Support both id and slug parameters
        let bookId = req.query.id || null;
        let bookSlug = req.query.slug || null;
        let queryParam, queryValue;
        
        if (bookSlug) {
            queryParam = 'b.slug';
            queryValue = bookSlug;
        } else if (bookId) {
            queryParam = 'b.id';
            queryValue = bookId;
        } else {
            return res.status(400).json({ success: false, error: "Thiếu ID hoặc Slug truyện!" });
        }
        
        const sql = `SELECT b.*, COALESCE(c.avg,0)::float AS rating_avg, COALESCE(c.count,0)::int AS rating_count
            FROM books b LEFT JOIN LATERAL (
                SELECT AVG(rating_stars) AS avg, COUNT(*) AS count FROM comments WHERE book_id = b.id
            ) c ON true WHERE ${queryParam} = $1 LIMIT 1`;
        const result = await pool.query(sql, [queryValue]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: "Không tìm thấy truyện!" });
        
        const book = result.rows[0];
        const resolvedBookId = book.id;
        const storyTitle = book.ten_truyen || '';
        
        // ===================== RELATED TEXT STORIES (up to 9) =====================
        let relatedTextStories = [];
        try {
            const categories = book.the_loai || [];
            const keywords = storyTitle.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2).slice(0, 3).join(' ') || storyTitle.substring(0, 15);
            
            let textRecSql = `
                (SELECT b.id, b.ten_truyen, b.tac_gia, b.anh_bia, b.so_chuong, b.slug, b.gioi_thieu, b.luot_xem, b.the_loai,
                    COALESCE(c.avg,0)::float AS rating_avg, COALESCE(c.count,0)::int AS rating_count
                FROM books b
                LEFT JOIN LATERAL (SELECT AVG(rating_stars) AS avg, COUNT(*) AS count FROM comments WHERE book_id = b.id) c ON true
                WHERE (b.trang_thai IS NULL OR b.trang_thai NOT ILIKE '%đã xóa%')
                  AND b.id != $1 AND (b.ten_truyen ILIKE '%' || $2 || '%')
                ORDER BY COALESCE(b.luot_xem, 0) DESC LIMIT 10)
                UNION ALL
                (SELECT b.id, b.ten_truyen, b.tac_gia, b.anh_bia, b.so_chuong, b.slug, b.gioi_thieu, b.luot_xem, b.the_loai,
                    COALESCE(c.avg,0)::float AS rating_avg, COALESCE(c.count,0)::int AS rating_count
                FROM books b
                LEFT JOIN LATERAL (SELECT AVG(rating_stars) AS avg, COUNT(*) AS count FROM comments WHERE book_id = b.id) c ON true
                WHERE (b.trang_thai IS NULL OR b.trang_thai NOT ILIKE '%đã xóa%')
                  AND b.id != $1 AND b.the_loai && $3::text[]
                ORDER BY COALESCE(b.luot_xem, 0) DESC LIMIT 10)
                UNION ALL
                (SELECT b.id, b.ten_truyen, b.tac_gia, b.anh_bia, b.so_chuong, b.slug, b.gioi_thieu, b.luot_xem, b.the_loai,
                    COALESCE(c.avg,0)::float AS rating_avg, COALESCE(c.count,0)::int AS rating_count
                FROM books b
                LEFT JOIN LATERAL (SELECT AVG(rating_stars) AS avg, COUNT(*) AS count FROM comments WHERE book_id = b.id) c ON true
                WHERE (b.trang_thai IS NULL OR b.trang_thai NOT ILIKE '%đã xóa%')
                  AND b.id != $1
                ORDER BY COALESCE(b.luot_xem, 0) DESC LIMIT 10)
                LIMIT 10
            `;
            const textResult = await pool.query(textRecSql, [resolvedBookId, keywords || 'truyen', categories.length > 0 ? categories : ['truyen']]);
            // Filter unique by id
            const seen = new Set();
            relatedTextStories = textResult.rows.filter(r => {
                if (seen.has(r.id)) return false;
                seen.add(r.id);
                return true;
            }).slice(0, 10);
        } catch (recErr) {
            console.error('[get_book_detail] Text recommendations error:', recErr.message);
        }
        
        // ===================== RELATED VIDEO REVIEWS (up to 10) =====================
        let relatedVideos = [];
        try {
            const videoRecSql = `
                WITH story_name_cte AS (
                    SELECT *,
                        CASE
                            WHEN y.ten_truyen_sach ~ '^P\\d+$' OR y.ten_truyen_sach ~ '^Phần \\d+' THEN
                                COALESCE(NULLIF(REGEXP_REPLACE(y.tiu_de_goc, '^[Pp]\\d+\\s*\\|\\s*', ''), ''), y.ten_truyen_sach)
                            ELSE y.ten_truyen_sach
                        END AS story_name_raw
                    FROM youtube_truyen y
                ),
                story_normalized AS (
                    SELECT *,
                        REGEXP_REPLACE(REGEXP_REPLACE(story_name_raw, '\\s*\\([Cc]hap.*$', ''), '\\s*\\(\\d+[-].*$', '') AS story_name_clean,
                        LEFT(REGEXP_REPLACE(REGEXP_REPLACE(story_name_raw, '\\s*\\([Cc]hap.*$', ''), '\\s*\\(\\d+[-].*$', ''), 45) AS group_key
                    FROM story_name_cte
                )
                SELECT
                    MIN(sn.id_video) AS id_video,
                    MIN(sn.story_name_clean) AS ten_truyen_sach,
                    MAX(sn.anh_thumbnail) AS anh_thumbnail,
                    MAX(COALESCE(sn.luot_xem, 0))::bigint AS luot_xem,
                    MAX(sn.ngay_dang) AS ngay_dang
                FROM story_normalized sn
                GROUP BY sn.group_key
                HAVING MAX(COALESCE(sn.luot_xem, 0)) > 0
                ORDER BY luot_xem DESC
                LIMIT 10
            `;
            const videoResult = await pool.query(videoRecSql);
            relatedVideos = videoResult.rows;
        } catch (recErr) {
            console.error('[get_book_detail] Video recommendations error:', recErr.message);
        }
        
        res.json({ 
            success: true, 
            book,
            relatedTextStories,
            relatedVideos
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/get_books_by_category
router.get('/get_books_by_category', async (req, res) => {
    try {
        const categoryName = req.query.category || null;
        let sql, params;
        const whereDeleted = " (b.trang_thai IS NULL OR b.trang_thai NOT ILIKE '%đã xóa%') ";
        const select = `SELECT b.id, b.ten_truyen, b.anh_bia, b.tac_gia, b.luot_xem,
            COALESCE(c.avg,0)::float AS rating_avg, COALESCE(c.count,0)::int AS rating_count,
            b.slug, b.created_at, b.is_vip, b.so_chuong, b.gioi_thieu, b.the_loai
            FROM books b LEFT JOIN LATERAL (
                SELECT AVG(rating_stars) AS avg, COUNT(*) AS count FROM comments WHERE book_id = b.id
            ) c ON true`;

        if (categoryName && categoryName !== 'all') {
            sql = `${select} WHERE $1 = ANY(b.the_loai) AND${whereDeleted}ORDER BY b.created_at DESC`;
            params = [categoryName];
        } else {
            sql = `${select} WHERE${whereDeleted}ORDER BY b.created_at DESC`;
            params = [];
        }
        const result = await pool.query(sql, params);
        res.set('Cache-Control', 'public, max-age=60');
        res.json({ success: true, books: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/get_leaderboard_books
router.get('/get_leaderboard_books', async (req, res) => {
    try {
        const result = await pool.query(`SELECT b.id, b.ten_truyen, b.anh_bia, b.tac_gia, b.luot_xem,
            COALESCE(c.avg,0)::float AS rating_avg, COALESCE(c.count,0)::int AS rating_count,
            b.slug, b.gioi_thieu, b.the_loai FROM books b
            LEFT JOIN LATERAL (SELECT AVG(rating_stars) AS avg, COUNT(*) AS count FROM comments WHERE book_id = b.id) c ON true
            WHERE (b.trang_thai IS NULL OR b.trang_thai NOT ILIKE '%đã xóa%')
            ORDER BY b.luot_xem DESC LIMIT 10`);
        res.set('Cache-Control', 'public, max-age=60');
        res.json({ success: true, books: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/get_categories
router.get('/get_categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name FROM categories ORDER BY name ASC');
        res.set('Cache-Control', 'public, max-age=300');
        res.json({ success: true, categories: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/rate_book
router.post('/rate_book', async (req, res) => {
    try {
        const { book_id, user_id, rating_stars } = req.body;
        if (!book_id || !user_id) return res.status(400).json({ success: false, error: "Thiếu thông tin!" });
        const stars = parseInt(rating_stars);
        if (isNaN(stars) || stars < 1 || stars > 5) return res.status(400).json({ success: false, error: "Số sao không hợp lệ (1-5)!" });

        const check = await pool.query('SELECT id, content FROM comments WHERE book_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1', [book_id, user_id]);
        if (check.rows.length > 0) {
            await pool.query('UPDATE comments SET rating_stars = $1, created_at = NOW() WHERE id = $2', [stars, check.rows[0].id]);
        } else {
            await pool.query('INSERT INTO comments (book_id, user_id, rating_stars, content, created_at) VALUES ($1, $2, $3, \'\', NOW())', [book_id, user_id, stars]);
        }
        res.json({ success: true, message: 'Đánh giá thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/get_user_rating
router.get('/get_user_rating', async (req, res) => {
    try {
        const { book_id, user_id } = req.query;
        if (!book_id || !user_id) return res.json({ success: false, rating: null });
        const result = await pool.query('SELECT id, rating_stars FROM comments WHERE book_id = $1 AND user_id = $2 AND rating_stars > 0 LIMIT 1', [book_id, user_id]);
        if (result.rows.length > 0) res.json({ success: true, rating: result.rows[0] });
        else res.json({ success: false, rating: null });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/get_levels_config
router.get('/get_levels_config', async (req, res) => {
    try {
        const tableCheck = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'levels_config')`);
        if (!tableCheck.rows[0].exists) return res.json({ success: true, levels: [] });
        const result = await pool.query('SELECT * FROM levels_config ORDER BY id ASC');
        res.json({ success: true, levels: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/books/list - Danh sách truyện phân trang, hỗ trợ type/sort
router.get('/books/list', async (req, res) => {
    try {
        const type = req.query.type || 'top-view';
        const sort = req.query.sort || 'new';
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 24));
        const offset = (page - 1) * limit;

        const whereDeleted = " (b.trang_thai IS NULL OR b.trang_thai NOT ILIKE '%đã xóa%') ";
        const select = `SELECT b.id, b.ten_truyen, b.anh_bia, b.tac_gia, b.luot_xem,
            COALESCE(c.avg,0)::float AS rating_avg, COALESCE(c.count,0)::int AS rating_count,
            b.slug, b.created_at, b.is_vip, b.so_chuong, b.gioi_thieu, b.the_loai
            FROM books b
            LEFT JOIN LATERAL (
                SELECT AVG(rating_stars) AS avg, COUNT(*) AS count FROM comments WHERE book_id = b.id
            ) c ON true`;
        const countSelect = `SELECT COUNT(*)::int AS total FROM books b`;
        let whereClause = ` WHERE ${whereDeleted}`;
        let orderClause = '';
        let params = [];

        // Xử lý type
        switch (type) {
            case 'top-view':
                orderClause = ` ORDER BY COALESCE(b.luot_xem, 0) DESC`;
                break;
            case 'top-rating':
                orderClause = ` ORDER BY COALESCE(c.avg, 0) DESC`;
                break;
            case 'completed':
                whereClause += ` AND (LOWER(b.trang_thai) IN ('full','hoàn thành','completed') OR b.trang_thai ILIKE '%full%')`;
                orderClause = ` ORDER BY b.created_at DESC`;
                break;
            case 'vip':
                whereClause += ` AND b.is_vip = true`;
                orderClause = ` ORDER BY b.created_at DESC`;
                break;
            default:
                orderClause = ` ORDER BY b.created_at DESC`;
        }

        // Xử lý sort override (nếu sort != new thì override ORDER BY)
        if (sort === 'view') orderClause = ` ORDER BY COALESCE(b.luot_xem, 0) DESC`;
        else if (sort === 'rating') orderClause = ` ORDER BY COALESCE(c.avg, 0) DESC`;
        else if (sort === 'chap') orderClause = ` ORDER BY COALESCE(b.so_chuong, 0) DESC`;
        // 'new' giữ nguyên orderClause từ type

        // Đếm tổng số
        const countResult = await pool.query(countSelect + whereClause, params);
        const total = countResult.rows[0].total;
        const totalPages = Math.ceil(total / limit);

        // Query dữ liệu
        const dataSql = select + whereClause + orderClause + ` LIMIT $1 OFFSET $2`;
        const dataParams = [...params, limit, offset];
        const dataResult = await pool.query(dataSql, dataParams);

        res.json({
            success: true,
            data: dataResult.rows,
            total: total,
            totalPages: totalPages,
            currentPage: page
        });
    } catch (error) {
        console.error('Error in /api/books/list:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
