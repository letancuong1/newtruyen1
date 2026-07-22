/**
 * Routes: Video Reviews (youtube_truyen) - Aggregation & Filtering
 * Groups rows by ten_truyen_sach with pagination, search, and dynamic filters
 * Handles: P1/P2 part labels, numeric ordering of episodes, fuzzy duplicate merging
 */
const express = require('express');
const router = express.Router();
const pool = require('../../db');

// GET /api/video-reviews/list
// Query params: page, keyword, style, category, sub_genre, limit, sort (views|likes|date)
router.get('/video-reviews/list', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
        const offset = (page - 1) * limit;
        const keyword = (req.query.keyword || '').trim();
        const style = (req.query.style || '').trim();
        const category = (req.query.category || '').trim();
        const subGenre = (req.query.sub_genre || '').trim();
        const sort = (req.query.sort || 'date').trim();
        const duration = (req.query.duration || '').trim();
        const minDuration = parseInt(req.query.min_duration) || 0;
        const maxDuration = parseInt(req.query.max_duration) || 0;

        // Build WHERE conditions
        const conditions = [];
        const params = [];
        let paramIdx = 1;

        conditions.push(`y.ten_truyen_sach IS NOT NULL AND y.ten_truyen_sach != ''`);

        if (keyword) {
            conditions.push(`y.ten_truyen_sach ILIKE $${paramIdx}`);
            params.push(`%${keyword}%`);
            paramIdx++;
        }

        if (style) {
            conditions.push(`y.phong_cach_review = $${paramIdx}`);
            params.push(style);
            paramIdx++;
        }

        if (category) {
            conditions.push(`y.the_loai_goc @> ARRAY[$${paramIdx}]`);
            params.push(category);
            paramIdx++;
        }

        if (subGenre) {
            conditions.push(`y.luu_phai_chi_tiet @> ARRAY[$${paramIdx}]`);
            params.push(subGenre);
            paramIdx++;
        }

        // Duration filter preset: các mốc thời gian (giây)
        if (duration) {
            if (duration === 'under1h') {
                conditions.push(`y.thoi_luong_giay IS NOT NULL AND y.thoi_luong_giay < 3600`);
            } else if (duration === '1to3h') {
                conditions.push(`y.thoi_luong_giay IS NOT NULL AND y.thoi_luong_giay >= 3600 AND y.thoi_luong_giay <= 10800`);
            } else if (duration === '3to5h') {
                conditions.push(`y.thoi_luong_giay IS NOT NULL AND y.thoi_luong_giay > 10800 AND y.thoi_luong_giay <= 18000`);
            } else if (duration === '5to10h') {
                conditions.push(`y.thoi_luong_giay IS NOT NULL AND y.thoi_luong_giay > 18000 AND y.thoi_luong_giay <= 36000`);
            } else if (duration === 'over10h') {
                conditions.push(`y.thoi_luong_giay IS NOT NULL AND y.thoi_luong_giay > 36000`);
            }
        }

        // Custom duration range filter (giây)
        if (minDuration > 0) {
            conditions.push(`y.thoi_luong_giay IS NOT NULL AND y.thoi_luong_giay >= $${paramIdx}`);
            params.push(minDuration);
            paramIdx++;
        }
        if (maxDuration > 0) {
            conditions.push(`y.thoi_luong_giay IS NOT NULL AND y.thoi_luong_giay <= $${paramIdx}`);
            params.push(maxDuration);
            paramIdx++;
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // ORDER BY: sort by the best part's value (MAX), 
        // with invalid/empty dates forced to the very end using NULLS LAST
        let orderBy;
        let orderByGroup;
        switch (sort) {
            case 'likes':
                orderBy = 'sub.luot_thich_max DESC NULLS LAST';
                orderByGroup = 'sub.luot_thich_max DESC NULLS LAST';
                break;
            case 'date':
                const dateCase = `
                    CASE
                        WHEN sub.ngay_dang_max IS NULL THEN 2
                        WHEN sub.ngay_dang_max !~ '^\\d{2}/\\d{2}/\\d{4}' THEN 1
                        ELSE 0
                    END ASC,
                    TO_DATE(sub.ngay_dang_max, 'DD/MM/YYYY') DESC NULLS LAST
                `.trim().replace(/\s+/g, ' ');
                orderBy = dateCase;
                orderByGroup = dateCase;
                break;
            default:
                orderBy = 'sub.luot_xem_max DESC NULLS LAST';
                orderByGroup = 'sub.luot_xem_max DESC NULLS LAST';
        }

        // ==========================================
        // 1. TỐI ƯU CÂU LỆNH COUNT (SIÊU NHẸ)
        // ==========================================
        const countSql = `
            WITH story_name_cte AS (
                SELECT 
                    CASE
                        WHEN y.ten_truyen_sach ~ '^P\\d+$' OR y.ten_truyen_sach ~ '^Phần \\d+' THEN
                            COALESCE(
                                NULLIF(REGEXP_REPLACE(y.tiu_de_goc, '^[Pp]\\d+\\s*\\|\\s*', ''), ''),
                                y.ten_truyen_sach
                            )
                        ELSE y.ten_truyen_sach
                    END AS story_name_raw
                FROM youtube_truyen y
                ${whereClause}
            ),
            story_normalized AS (
                SELECT 
                    LEFT(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(story_name_raw, '\\s*\\([Cc]hap.*$', ''),
                            '\\s*\\(\\d+[-].*$', ''
                        ), 45
                    ) AS group_key
                FROM story_name_cte
            )
            SELECT COUNT(DISTINCT group_key)::int AS total FROM story_normalized
        `;

        const countResult = await pool.query(countSql, params);
        const total = countResult.rows[0].total;
        const totalPages = Math.ceil(total / limit);

        // ==========================================
        // 2. TỐI ƯU CÂU LỆNH LẤY DATA (CHỈ XỬ LÝ 12 DÒNG)
        // ==========================================
        const dataSql = `
            WITH story_name_cte AS (
                SELECT *,
                    CASE
                        WHEN y.ten_truyen_sach ~ '^P\\d+$' OR y.ten_truyen_sach ~ '^Phần \\d+' THEN
                            COALESCE(
                                NULLIF(REGEXP_REPLACE(y.tiu_de_goc, '^[Pp]\\d+\\s*\\|\\s*', ''), ''),
                                y.ten_truyen_sach
                            )
                        ELSE y.ten_truyen_sach
                    END AS story_name_raw
                FROM youtube_truyen y
                ${whereClause}
            ),
            story_normalized AS (
                SELECT *,
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(story_name_raw, '\\s*\\([Cc]hap.*$', ''),
                        '\\s*\\(\\d+[-].*$', ''
                    ) AS story_name_clean,
                    LEFT(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(story_name_raw, '\\s*\\([Cc]hap.*$', ''),
                            '\\s*\\(\\d+[-].*$', ''
                        ), 45
                    ) AS group_key
                FROM story_name_cte
            ),
            -- BƯỚC MỚI: Kiểm tra xem mỗi group_key có tồn tại P1/Phần 1 thực sự hay không
            group_p1_check AS (
                SELECT 
                    group_key,
                    BOOL_OR(dinh_danh_tap ILIKE '%P1%' OR dinh_danh_tap ILIKE '%Phần 1%') AS has_real_p1
                FROM story_normalized
                GROUP BY group_key
            ),
            paginated_groups AS (
                SELECT * FROM (
                    SELECT 
                        sn.group_key,
                        MAX(COALESCE(sn.luot_xem, 0))::bigint AS luot_xem_max,
                        MAX(COALESCE(sn.luot_thich, 0))::bigint AS luot_thich_max,
                        MAX(sn.ngay_dang) AS ngay_dang_max
                    FROM story_normalized sn
                    GROUP BY sn.group_key
                ) sub
                ORDER BY ${orderByGroup}
                LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
            )
            SELECT * FROM (
                SELECT
                    MIN(sn.story_name_clean) AS ten_truyen_sach,
                    MAX(sn.anh_thumbnail) AS anh_thumbnail,
                    (SELECT ARRAY_AGG(DISTINCT cat ORDER BY cat) FROM unnest(array_agg(sn.the_loai_goc)) cat WHERE cat IS NOT NULL) AS the_loai_goc,
                    (SELECT ARRAY_AGG(DISTINCT subg ORDER BY subg) FROM unnest(array_agg(sn.luu_phai_chi_tiet)) subg WHERE subg IS NOT NULL) AS luu_phai_chi_tiet,
                    
                    -- Gom nhóm video dựa trên logic cấu hình thứ tự mới
                    jsonb_agg(
                        jsonb_build_object(
                            'id_video', sn.id_video,
                            'dinh_danh_tap', sn.dinh_danh_tap,
                            'thoi_luong_giay', sn.thoi_luong_giay,
                            'luot_xem', sn.luot_xem,
                            'luot_thich', sn.luot_thich,
                            'ngay_dang', sn.ngay_dang,
                            'link_video', sn.link_video
                        ) ORDER BY
                            CASE
                                -- NẾU KHÔNG CÓ P1: Đôn thằng Full Bộ/End/Bộ lên làm vị trí số 1 đầu tiên
                                WHEN p1c.has_real_p1 = FALSE AND (sn.dinh_danh_tap ILIKE '%full%' OR sn.dinh_danh_tap ILIKE '%end%' OR sn.dinh_danh_tap ILIKE '%bo%') THEN 1
                                -- NẾU CÓ CẢ HAI: Giữ nguyên Full Bộ ở cuối cùng (vị trí 999999) như cũ
                                WHEN sn.dinh_danh_tap ILIKE '%full%' OR sn.dinh_danh_tap ILIKE '%end%' OR sn.dinh_danh_tap ILIKE '%bo%' THEN 999999
                                -- Các tập P2, P3... trích xuất số bình thường
                                ELSE COALESCE(NULLIF(REGEXP_REPLACE(sn.dinh_danh_tap, '[^0-9]', '', 'g'), '')::int, 0)
                            END ASC NULLS LAST,
                            sn.dinh_danh_tap ASC
                    ) AS videos,
                    
                    MAX(sn.phong_cach_review) AS phong_cach_review,
                    SUM(COALESCE(sn.luot_xem, 0))::bigint AS tong_luot_xem,
                    SUM(COALESCE(sn.luot_thich, 0))::bigint AS tong_luot_thich,
                    pg.luot_xem_max,
                    pg.luot_thich_max,
                    pg.ngay_dang_max,
                    COUNT(*)::int AS so_phan
                FROM story_normalized sn
                JOIN paginated_groups pg ON sn.group_key = pg.group_key
                JOIN group_p1_check p1c ON sn.group_key = p1c.group_key
                GROUP BY sn.group_key, pg.luot_xem_max, pg.luot_thich_max, pg.ngay_dang_max
            ) sub
            ORDER BY ${orderBy}
        `;

        const dataParams = [...params, limit, offset];
        const dataResult = await pool.query(dataSql, dataParams);

        res.json({
            success: true,
            data: dataResult.rows,
            total,
            totalPages,
            currentPage: page,
            limit
        });
    } catch (error) {
        console.error('[video-reviews] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/video-reviews/filters
router.get('/video-reviews/filters', async (req, res) => {
    try {
        const [styles, categories, subGenres] = await Promise.all([
            pool.query(`SELECT DISTINCT phong_cach_review FROM youtube_truyen WHERE phong_cach_review IS NOT NULL AND phong_cach_review != '' ORDER BY 1`),
            pool.query(`SELECT DISTINCT unnest(the_loai_goc) AS name FROM youtube_truyen ORDER BY 1`),
            pool.query(`SELECT DISTINCT unnest(luu_phai_chi_tiet) AS name FROM youtube_truyen ORDER BY 1`)
        ]);

        res.json({
            success: true,
            filters: {
                styles: styles.rows.map(r => r.phong_cach_review),
                categories: categories.rows.map(r => r.name),
                subGenres: subGenres.rows.map(r => r.name)
            }
        });
    } catch (error) {
        console.error('[video-reviews/filters] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/video-reviews/detail
router.get('/video-reviews/detail', async (req, res) => {
    try {
        const idVideo = req.query.id || '';
        if (!idVideo) return res.status(400).json({ success: false, error: 'Missing video ID' });

        const result = await pool.query(
            `SELECT * FROM youtube_truyen WHERE id_video = $1 LIMIT 1`,
            [idVideo]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        const story = result.rows[0];
        const siblings = await pool.query(
            `SELECT id_video, dinh_danh_tap, thoi_luong_giay, luot_xem, luot_thich, ngay_dang, link_video, anh_thumbnail,
                    CASE
                        WHEN ten_truyen_sach ~ '^P\\d+$' OR ten_truyen_sach ~ '^Phần \\d+' THEN
                            COALESCE(NULLIF(REGEXP_REPLACE(tiu_de_goc, '^[Pp]\\d+\\s*\\|\\s*', ''), ''), ten_truyen_sach)
                        ELSE ten_truyen_sach
                    END AS story_name_clean
             FROM youtube_truyen
             WHERE ten_truyen_sach = $1
                OR (
                    LEFT(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(
                                CASE
                                    WHEN ten_truyen_sach ~ '^P\\d+$' OR ten_truyen_sach ~ '^Phần \\d+' THEN
                                        COALESCE(NULLIF(REGEXP_REPLACE(tiu_de_goc, '^[Pp]\\d+\\s*\\|\\s*', ''), ''), ten_truyen_sach)
                                    ELSE ten_truyen_sach
                                END,
                                '\\s*\\([Cc]hap.*$', ''
                            ),
                            '\\s*\\(\\d+[-].*$', ''
                        ),
                        45
                    ) = LEFT(
                        REGEXP_REPLACE(REGEXP_REPLACE($2, '\\s*\\([Cc]hap.*$', ''), '\\s*\\(\\d+[-].*$', ''),
                        45
                    )
                )
             ORDER BY
                CASE WHEN dinh_danh_tap ILIKE '%full%' OR dinh_danh_tap ILIKE '%end%' OR dinh_danh_tap ILIKE '%bo%' THEN 999999
                ELSE COALESCE(NULLIF(REGEXP_REPLACE(dinh_danh_tap, '[^0-9]', '', 'g'), '')::int, 0) END ASC,
                dinh_danh_tap ASC`,
            [story.ten_truyen_sach, story.ten_truyen_sach]
        );

        // ===================== VIDEO RECOMMENDATIONS (9 Related Videos) =====================
        let videoRecommendations = [];
        try {
            const videoRecSql = `
                WITH current_video AS (
                    SELECT 
                        ten_truyen_sach,
                        COALESCE(thoi_luong_giay, 0) as thoi_luong_giay,
                        LEFT(REGEXP_REPLACE(REGEXP_REPLACE(CASE WHEN ten_truyen_sach ~ '^P\\d+$' OR ten_truyen_sach ~ '^Phần \\d+' THEN COALESCE(NULLIF(REGEXP_REPLACE(tiu_de_goc, '^[Pp]\\d+\\s*\\|\\s*', ''), ''), ten_truyen_sach) ELSE ten_truyen_sach END, '\\s*\\([Cc]hap.*$', ''), '\\s*\\(\\d+[-].*$', ''), 45) AS group_key
                    FROM youtube_truyen 
                    WHERE id_video = $1 
                    LIMIT 1
                ),
                all_stories_normalized AS (
                    SELECT 
                        y.id_video,
                        y.ten_truyen_sach,
                        y.dinh_danh_tap,
                        y.anh_thumbnail,
                        y.luot_xem,
                        y.ngay_dang,
                        y.thoi_luong_giay,
                        REGEXP_REPLACE(REGEXP_REPLACE(CASE WHEN y.ten_truyen_sach ~ '^P\\d+$' OR y.ten_truyen_sach ~ '^Phần \\d+' THEN COALESCE(NULLIF(REGEXP_REPLACE(y.tiu_de_goc, '^[Pp]\\d+\\s*\\|\\s*', ''), ''), y.ten_truyen_sach) ELSE y.ten_truyen_sach END, '\\s*\\([Cc]hap.*$', ''), '\\s*\\(\\d+[-].*$', '') AS story_name_clean,
                        LEFT(REGEXP_REPLACE(REGEXP_REPLACE(CASE WHEN y.ten_truyen_sach ~ '^P\\d+$' OR y.ten_truyen_sach ~ '^Phần \\d+' THEN COALESCE(NULLIF(REGEXP_REPLACE(y.tiu_de_goc, '^[Pp]\\d+\\s*\\|\\s*', ''), ''), y.ten_truyen_sach) ELSE y.ten_truyen_sach END, '\\s*\\([Cc]hap.*$', ''), '\\s*\\(\\d+[-].*$', ''), 45) AS group_key
                    FROM youtube_truyen y
                ),
                distinct_target_stories AS (
                    SELECT 
                        asn.group_key,
                        MIN(asn.id_video) as id_video,
                        MIN(asn.story_name_clean) as ten_truyen_sach,
                        MAX(asn.anh_thumbnail) as anh_thumbnail,
                        MAX(COALESCE(asn.luot_xem, 0)) as luot_xem_max,
                        MAX(asn.ngay_dang) as ngay_dang_max,
                        MAX(asn.thoi_luong_giay) as thoi_luong_giay_max
                    FROM all_stories_normalized asn
                    CROSS JOIN current_video cv
                    WHERE asn.group_key != cv.group_key
                    GROUP BY asn.group_key
                )
                SELECT 
                    dts.id_video,
                    dts.ten_truyen_sach,
                    dts.anh_thumbnail,
                    dts.luot_xem_max as luot_xem,
                    dts.ngay_dang_max as ngay_dang,
                    dts.thoi_luong_giay_max as thoi_luong_giay
                FROM distinct_target_stories dts
                CROSS JOIN current_video cv
                ORDER BY
                    (CASE WHEN dts.ten_truyen_sach ILIKE '%' || SUBSTRING(cv.ten_truyen_sach, 1, 20) || '%' THEN 20 ELSE 0 END)
                    + (LN(COALESCE(dts.luot_xem_max, 0) + 1) * 0.8)
                    + (CASE WHEN dts.ngay_dang_max ~ '^\\d{2}/\\d{2}/\\d{4}' THEN 10.0 / (1.0 + ABS(EXTRACT(DAY FROM (NOW() - TO_DATE(dts.ngay_dang_max, 'DD/MM/YYYY')))) / 90.0) ELSE 0 END)
                    + (15.0 / (1.0 + ABS(COALESCE(dts.thoi_luong_giay_max, 0) - cv.thoi_luong_giay) / 1800.0))
                DESC
                LIMIT 9
            `;
            const videoRecResult = await pool.query(videoRecSql, [idVideo]);
            videoRecommendations = videoRecResult.rows;
        } catch (recErr) {
            console.error('[video-reviews] Video recommendation error:', recErr.message);
        }

        // ===================== TEXT RECOMMENDATIONS (9 Related Text Stories) =====================
        let textRecommendations = [];
        try {
            const storyName = story.ten_truyen_sach || '';
            // Clean story name
            const cleanName = storyName
                .replace(/^P\d+\s*\|\s*/, '')
                .replace(/^Phần\s+\d+\s*\|\s*/, '')
                .replace(/\s*\([Cc]hap.*$/, '')
                .replace(/\s*\(\d+[-].*$/, '')
                .trim();
            
            // Extract the first few words (keywords) for broader matching
            const keywords = cleanName.split(/\s+/).filter(function(w) { return w.length > 2; }).slice(0, 4).join(' ');
            
            // Get video's the_loai_goc (categories) for genre-based matching
            const videoCategories = story.the_loai_goc || [];
            
            if (keywords || videoCategories.length > 0) {
                let textRecSql;
                let textRecParams;
                
                if (keywords && videoCategories.length > 0) {
                    // Match by name OR category overlap
                    textRecSql = `
                        SELECT b.id, b.ten_truyen, b.tac_gia, b.anh_bia, b.so_chuong, b.slug, b.gioi_thieu, b.luot_xem, b.the_loai,
                            COALESCE(c.avg,0)::float AS rating_avg, COALESCE(c.count,0)::int AS rating_count
                        FROM books b
                        LEFT JOIN LATERAL (
                            SELECT AVG(rating_stars) AS avg, COUNT(*) AS count FROM comments WHERE book_id = b.id
                        ) c ON true
                        WHERE (b.trang_thai IS NULL OR b.trang_thai NOT ILIKE '%đã xóa%')
                          AND (b.ten_truyen ILIKE '%' || $1 || '%' OR b.the_loai && $2::text[])
                        ORDER BY 
                            CASE WHEN b.ten_truyen ILIKE '%' || $1 || '%' THEN 20 ELSE 0 END
                            + COALESCE(b.luot_xem, 0) * 0.001
                        DESC
                        LIMIT 9
                    `;
                    textRecParams = [keywords.substring(0, 30), videoCategories];
                } else if (keywords) {
                    textRecSql = `
                        SELECT b.id, b.ten_truyen, b.tac_gia, b.anh_bia, b.so_chuong, b.slug, b.gioi_thieu, b.luot_xem, b.the_loai,
                            COALESCE(c.avg,0)::float AS rating_avg, COALESCE(c.count,0)::int AS rating_count
                        FROM books b
                        LEFT JOIN LATERAL (
                            SELECT AVG(rating_stars) AS avg, COUNT(*) AS count FROM comments WHERE book_id = b.id
                        ) c ON true
                        WHERE (b.trang_thai IS NULL OR b.trang_thai NOT ILIKE '%đã xóa%')
                          AND b.ten_truyen ILIKE '%' || $1 || '%'
                        ORDER BY COALESCE(b.luot_xem, 0) DESC
                        LIMIT 9
                    `;
                    textRecParams = [keywords.substring(0, 30)];
                } else {
                    textRecSql = `
                        SELECT b.id, b.ten_truyen, b.tac_gia, b.anh_bia, b.so_chuong, b.slug, b.gioi_thieu, b.luot_xem, b.the_loai,
                            COALESCE(c.avg,0)::float AS rating_avg, COALESCE(c.count,0)::int AS rating_count
                        FROM books b
                        LEFT JOIN LATERAL (
                            SELECT AVG(rating_stars) AS avg, COUNT(*) AS count FROM comments WHERE book_id = b.id
                        ) c ON true
                        WHERE (b.trang_thai IS NULL OR b.trang_thai NOT ILIKE '%đã xóa%')
                          AND b.the_loai && $1::text[]
                        ORDER BY COALESCE(b.luot_xem, 0) DESC
                        LIMIT 9
                    `;
                    textRecParams = [videoCategories];
                }
                
                const textRecResult = await pool.query(textRecSql, textRecParams);
                textRecommendations = textRecResult.rows;
            }
        } catch (recErr) {
            console.error('[video-reviews] Text recommendation error:', recErr.message);
        }

        res.json({ 
            success: true, 
            video: story, 
            siblings: siblings.rows,
            videoRecommendations,
            textRecommendations
        });
    } catch (error) {
        console.error('[video-reviews/detail] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/video-reviews/trending-7days
// Returns top 10 trending video groups based on the latest video date (30 days window)
router.get('/video-reviews/trending-7days', async (req, res) => {
    try {
        const result = await pool.query(`
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
            ),
            newest_date AS (
                SELECT MAX(TO_DATE(sn.ngay_dang, 'DD/MM/YYYY')) AS max_date
                FROM story_normalized sn
                WHERE sn.ngay_dang ~ '^\\d{2}/\\d{2}/\\d{4}'
            )
            SELECT
                MIN(sn.story_name_clean) AS ten_truyen_sach,
                MIN(sn.id_video) AS id_video,
                MAX(sn.anh_thumbnail) AS anh_thumbnail,
                MAX(COALESCE(sn.luot_xem, 0))::bigint AS luot_xem_max,
                MAX(sn.ngay_dang) AS ngay_dang_max
            FROM story_normalized sn
            CROSS JOIN newest_date nd
            WHERE sn.ngay_dang ~ '^\\d{2}/\\d{2}/\\d{4}'
              AND TO_DATE(sn.ngay_dang, 'DD/MM/YYYY') >= nd.max_date - INTERVAL '30 days'
            GROUP BY sn.group_key
            HAVING MAX(COALESCE(sn.luot_xem, 0)) > 0
            ORDER BY luot_xem_max DESC
            LIMIT 10
        `);
        
        let videos = result.rows;
        
        // Fallback: if fewer than 5, get top all-time to fill
        if (videos.length < 5) {
            const fallbackResult = await pool.query(`
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
                    MIN(sn.story_name_clean) AS ten_truyen_sach,
                    MIN(sn.id_video) AS id_video,
                    MAX(sn.anh_thumbnail) AS anh_thumbnail,
                    MAX(COALESCE(sn.luot_xem, 0))::bigint AS luot_xem_max,
                    MAX(sn.ngay_dang) AS ngay_dang_max
                FROM story_normalized sn
                GROUP BY sn.group_key
                HAVING MAX(COALESCE(sn.luot_xem, 0)) > 0
                ORDER BY luot_xem_max DESC
                LIMIT 10
            `);
            // Merge, avoid duplicates by id_video
            const existingIds = new Set(videos.map(v => v.id_video));
            for (const fb of fallbackResult.rows) {
                if (!existingIds.has(fb.id_video) && videos.length < 10) {
                    videos.push(fb);
                    existingIds.add(fb.id_video);
                }
            }
        }

        res.json({ success: true, videos });
    } catch (error) {
        console.error('[video-reviews/trending-7days] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
