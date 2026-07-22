/**
 * SERVER CRAWL - Cào truyện từ Metruyenchuvn.com và lưu vào Database
 * Standalone server (chạy riêng biệt hoặc tích hợp với api/index.js)
 */
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const crypto = require('crypto');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const BASE_URL = 'https://metruyenchuvn.com';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/javascript, */*; q=0.01'
};

const MAX_CONCURRENT = 5;  // Số request song song tối đa
const CHUNK_SIZE = 50;     // Gộp 50 chương 1 lần insert
const MAX_RETRIES = 3;
const SLEEP_BETWEEN_REQUESTS = 300; // ms

// Cache 15 phút
const setCache = (res) => {
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate');
};

const apiClient = axios.create({ timeout: 15000, headers: HEADERS });

// ===================== UTILITY =====================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
}

// ===================== HÀM CỐT LÕI: LẤY NỘI DUNG CHƯƠNG =====================
async function fetchChapterContent(chapterItem, logFn) {
    const { ten_chuong, link } = chapterItem;
    let contentLines = [];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await apiClient.get(link, { timeout: 15000 });
            const $ = cheerio.load(response.data);
            const contentDiv = $('#chapter-c, .chapter-c, .truyen, .truyen-content, #content').first();

            if (contentDiv.length) {
                contentDiv.find('script, style, iframe, ins').remove();
                contentDiv.find('p, br, div').each((i, el) => $(el).append('\n'));
                const rawText = contentDiv.text();
                rawText.split('\n').forEach(line => {
                    const clean = line.trim();
                    if (clean) contentLines.push(clean);
                });
            }
            break;
        } catch (err) {
            if (attempt < MAX_RETRIES - 1) await sleep(1500);
        }
    }
    return {
        ten_chuong,
        noi_dung: contentLines.length > 0 ? contentLines : ['Nội dung chương này tạm thời trống hoặc lỗi tải.']
    };
}

// ===================== HÀM CỐT LÕI: LẤY DANH SÁCH CHƯƠNG =====================
async function extractChapters(bookId, logFn) {
    const truyenUrl = `${BASE_URL}/${bookId}`;
    const chapters = [];
    const seenLinks = new Set();
    let chiTiet = { ten_truyen: '', tac_gia: 'Đang cập nhật', the_loai: 'Đang cập nhật', luot_xem: 'Đang cập nhật', cover: '', trang_thai: 'Đang cập nhật', nguon: 'Sưu tầm', gioi_thieu: '' };

    try {
        const { data: htmlText } = await apiClient.get(truyenUrl);
        const $ = cheerio.load(htmlText);

        // --- Lấy thông tin truyện ---
        chiTiet.ten_truyen = $('h1').first().text().trim();
        
        let cover = $('.book-info img, .book-img img, .info-img img, img.cover').first().attr('src') || '';
        chiTiet.cover = (cover && !cover.startsWith('http')) ? `${BASE_URL}${cover}` : cover;

        const gioiThieuDiv = $('#gioithieu');
        if (gioiThieuDiv.length) chiTiet.gioi_thieu = gioiThieuDiv.text().trim().replace(/\r/g, '').replace(/\n/g, ' ');

        $('.info div, .info li, .list-info li, .truyen-info li, .book-info li, .meta-info li, ul > li').each((i, el) => {
            const text = $(el).text().replace(/\s+/g, ' ').trim();
            if (/Trạng thái\s*:/i.test(text)) chiTiet.trang_thai = text.replace(/.*?Trạng thái\s*:/i, '').trim();
            else if (/Nguồn\s*:/i.test(text)) chiTiet.nguon = text.replace(/.*?Nguồn\s*:/i, '').trim();
            else if (/Tác giả\s*:/i.test(text)) chiTiet.tac_gia = text.replace(/.*?Tác giả\s*:/i, '').trim();
            else if (/Thể loại\s*:/i.test(text)) chiTiet.the_loai = text.replace(/.*?Thể loại\s*:/i, '').trim();
            else if (/Lượt xem\s*:/i.test(text)) chiTiet.luot_xem = text.replace(/.*?Lượt xem\s*:/i, '').trim();
        });

        // --- Lấy danh sách chương trang 1 ---
        const processChapterLinks = ($, elements) => {
            elements.each((i, el) => {
                let link = $(el).attr('href')?.trim() || '';
                const tenChuong = $(el).text().trim();
                if (!link || link.toLowerCase().startsWith('javascript') || link.startsWith('#')) return;
                if (/^\d+$/.test(tenChuong) || ['>', '<', '>>', '<<', 'Trang sau', 'Trang trước', '...'].includes(tenChuong)) return;
                if (link.startsWith('/')) link = `${BASE_URL}${link}`;
                if (!seenLinks.has(link)) {
                    seenLinks.add(link);
                    chapters.push({ ten_chuong: tenChuong, link });
                }
            });
        };

        // Tìm ID nội bộ
        let internalId = htmlText.match(/page\(['"]?(\d{3,})['"]?/)?.[1] ||
                         htmlText.match(/(?:story_id|truyen_id)\s*[:=]\s*['"]?(\d{3,})['"]?/i)?.[1] ||
                         $('input[id*="story_id" i], input[id*="truyen_id" i]').val();

        // Tính tổng số trang chương
        let totalPages = 1;
        $('.paging a, .pagination a').each((i, el) => {
            const pNum = parseInt($(el).text().trim());
            if (!isNaN(pNum) && pNum > totalPages) totalPages = pNum;
        });

        // Lấy chương trang 1
        processChapterLinks($, $('#chapter-list a'));

        // Lấy chương từ API phân trang
        if (internalId) {
            for (let page = 2; page <= totalPages; page++) {
                try {
                    const apiUrl = `${BASE_URL}/get/listchap/${internalId}?page=${page}`;
                    const apiRes = await apiClient.get(apiUrl, { timeout: 10000 });
                    let htmlContent = (typeof apiRes.data === 'object' && apiRes.data.data) ? apiRes.data.data : apiRes.data;
                    const $api = cheerio.load(htmlContent);
                    const aTags = $api('a');
                    if (aTags.length === 0) break;

                    let newChaps = 0;
                    aTags.each((i, el) => {
                        let link = $api(el).attr('href')?.trim() || '';
                        const tenChuong = $api(el).text().trim();
                        if (!link || link.toLowerCase().startsWith('javascript') || link.startsWith('#')) return;
                        if (/^\d+$/.test(tenChuong) || ['>', '<', '>>', '<<', 'Trang sau', 'Trang trước', '...'].includes(tenChuong)) return;
                        if (link.startsWith('/')) link = `${BASE_URL}${link}`;
                        if (!seenLinks.has(link)) {
                            seenLinks.add(link);
                            chapters.push({ ten_chuong: tenChuong, link });
                            newChaps++;
                        }
                    });

                    if (newChaps === 0) break;
                    await sleep(200);
                } catch (err) {
                    logFn(`  [Lỗi API] Trang ${page}: ${err.message}`);
                    break;
                }
            }
        }

    } catch (err) {
        logFn(`  [Cảnh báo] ${err.message}`);
    }

    return { chiTiet, chapters };
}

// ===================== CÀO VÀ LƯU 1 TRUYỆN =====================
async function crawlAndSaveBook(bookId, logFn) {
    logFn(`📖 Đang xử lý: ${bookId}`);

    // Lấy danh sách chương + thông tin
    const { chiTiet, chapters } = await extractChapters(bookId, logFn);
    const totalChapters = chapters.length;
    logFn(`  -> Tìm thấy ${totalChapters} chương. Đang tải nội dung...`);

    // Lấy nội dung từng chương (có kiểm soát concurrent)
    const allChapterData = [];
    const chapterChunks = chunkArray(chapters, MAX_CONCURRENT);

    for (let i = 0; i < chapterChunks.length; i++) {
        const chunk = chapterChunks[i];
        const results = await Promise.allSettled(
            chunk.map(ch => fetchChapterContent(ch, logFn))
        );
        for (const r of results) {
            if (r.status === 'fulfilled') allChapterData.push(r.value);
            else logFn(`    [Lỗi] ${r.reason?.message || 'Lỗi không xác định'}`);
        }

        if ((i + 1) % 5 === 0 || i === chapterChunks.length - 1) {
            logFn(`    [+] Đã tải ${Math.min((i + 1) * MAX_CONCURRENT, totalChapters)}/${totalChapters} chương...`);
        }
        if (i < chapterChunks.length - 1) await sleep(300);
    }

    // LƯU VÀO DATABASE
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const linkGoc = `${BASE_URL}/${bookId}`;
        const slug = bookId;

        // Kiểm tra truyện đã tồn tại chưa
        const existCheck = await client.query(
            'SELECT id, ten_truyen FROM books WHERE link_goc = $1 OR slug = $2 LIMIT 1',
            [linkGoc, slug]
        );

        let finalBookId;
        if (existCheck.rows.length > 0) {
            // Update truyện cũ
            finalBookId = existCheck.rows[0].id;
            logFn(`  ⏩ Truyện đã tồn tại (ID: ${finalBookId}). Đang cập nhật...`);

            await client.query(`
                UPDATE books SET
                    so_chuong = $1,
                    trang_thai = $2,
                    nguon = $3,
                    gioi_thieu = CASE WHEN $4::text <> '' THEN $4 ELSE gioi_thieu END,
                    updated_at = NOW()
                WHERE id = $5
            `, [totalChapters, chiTiet.trang_thai, chiTiet.nguon, chiTiet.gioi_thieu, finalBookId]);
        } else {
            // Insert truyện mới
            finalBookId = crypto.randomUUID();
            
            // Parse thể loại thành array
            const theLoaiArray = chiTiet.the_loai ? chiTiet.the_loai.split(',').map(s => s.trim()).filter(Boolean) : [];

            await client.query(`
                INSERT INTO books (id, ten_truyen, anh_bia, tac_gia, the_loai, luot_xem, so_chuong, trang_thai, nguon, gioi_thieu, slug, link_goc, created_at, updated_at, is_vip)
                VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, NOW(), NOW(), false)
            `, [
                finalBookId,
                chiTiet.ten_truyen || bookId,
                chiTiet.cover || '',
                chiTiet.tac_gia || 'Đang cập nhật',
                theLoaiArray,
                totalChapters,
                chiTiet.trang_thai || 'Đang cập nhật',
                chiTiet.nguon || 'Sưu tầm',
                chiTiet.gioi_thieu || '',
                slug,
                linkGoc
            ]);

            logFn(`  ✅ Đã tạo truyện mới: "${chiTiet.ten_truyen}" (ID: ${finalBookId})`);
        }

        // Xóa chương cũ nếu re-crawl
        if (existCheck.rows.length > 0 && allChapterData.length > 0) {
            const existingCount = await client.query(
                'SELECT COUNT(*)::int AS cnt FROM chapters WHERE book_id = $1', [finalBookId]
            );
            if (existingCount.rows[0].cnt > 0) {
                await client.query('DELETE FROM chapters WHERE book_id = $1', [finalBookId]);
                logFn(`  🔄 Đã xóa ${existingCount.rows[0].cnt} chương cũ.`);
            }
        }

        // Insert chapters theo chunk
        const chapterChunksForDB = chunkArray(allChapterData, CHUNK_SIZE);
        let chapNumber = 1;
        let totalInserted = 0;

        for (const chunk of chapterChunksForDB) {
            const valuePlaceholders = [];
            const valueParams = [];
            let paramIndex = 1;

            for (const ch of chunk) {
                const title = ch.ten_chuong || `Chương ${chapNumber}`;
                const content = ch.noi_dung.join('\n');
                valuePlaceholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 0)`);
                valueParams.push(finalBookId, chapNumber, title, content);
                paramIndex += 4;
                chapNumber++;
            }

            if (valuePlaceholders.length > 0) {
                await client.query(`
                    INSERT INTO chapters (book_id, chapter_number, title, content, price)
                    VALUES ${valuePlaceholders.join(', ')}
                    ON CONFLICT (book_id, chapter_number) DO UPDATE SET
                        title = EXCLUDED.title,
                        content = EXCLUDED.content
                `, valueParams);
                totalInserted += chunk.length;
            }
        }

        // Cập nhật số chương chính xác
        await client.query(`
            UPDATE books SET so_chuong = (SELECT COUNT(*) FROM chapters WHERE book_id = $1), updated_at = NOW() WHERE id = $1
        `, [finalBookId]);

        await client.query('COMMIT');
        logFn(`  ✅ Đã lưu ${totalInserted} chương vào database.`);
        return { id: finalBookId, totalChapters: totalInserted, tenTruyen: chiTiet.ten_truyen || 'Truyện mới' };

    } catch (err) {
        await client.query('ROLLBACK');
        logFn(`  ❌ Lỗi database: ${err.message}`);
        throw err;
    } finally {
        client.release();
    }
}

// ===================================================================
// API ENDPOINTS
// ===================================================================

// ------------------- 0. API CÀO ADMIN (dùng cho giao diện admin-crawler.html) -------------------
app.post('/api/admin/crawl', async (req, res) => {
    const { link, pages } = req.body;
    if (!link && !pages) {
        return res.status(400).json({ success: false, error: 'Thiếu link hoặc pages!' });
    }

    const logs = [];
    const logFn = (msg) => {
        logs.push(msg);
        console.log(`[CRAWL] ${msg}`);
    };

    try {
        let result;
        if (link) {
            // Nếu là link đầy đủ, lấy bookId
            let bookId = link;
            if (link.startsWith('http')) {
                const parts = link.split('/').filter(s => s);
                bookId = parts[parts.length - 1];
            }
            logFn(`🚀 BẮT ĐẦU CÀO: ${bookId}`);
            result = await crawlAndSaveBook(bookId, logFn);
            logFn(`🎉 HOÀN TẤT! "${result.tenTruyen}" - ${result.totalChapters} chương.`);
        } else {
            const numPages = parseInt(pages) || 1;
            result = { totalCrawled: 0 };
            logFn(`📄 Đang cào ${numPages} trang...`);
            for (let page = 1; page <= numPages; page++) {
                const listUrl = `${BASE_URL}/danh-sach/truyen-hot?page=${page}`;
                logFn(`\n📄 Trang ${page}/${numPages}`);
                try {
                    const { data } = await axios.get(listUrl, { headers: HEADERS });
                    const $ = cheerio.load(data);
                    const items = $('.item');
                    if (items.length === 0) { logFn('🏁 Hết truyện.'); break; }
                    const bookIds = [];
                    items.each((i, el) => {
                        const href = $(el).find('a.cover').attr('href') || '';
                        if (href) bookIds.push(href.replace('/', ''));
                    });
                    logFn(`  -> ${bookIds.length} truyện.`);
                    for (let i = 0; i < bookIds.length; i++) {
                        logFn(`📖 [${page}/${numPages}] ${i+1}/${bookIds.length}: ${bookIds[i]}`);
                        try { await crawlAndSaveBook(bookIds[i], logFn); result.totalCrawled++; }
                        catch (err) { logFn(`  ❌ ${err.message}`); }
                        if (i < bookIds.length - 1) await sleep(1000);
                    }
                } catch (err) { logFn(`❌ Lỗi trang ${page}: ${err.message}`); }
            }
            logFn(`🎉 HOÀN TẤT! ${result.totalCrawled} truyện.`);
        }
        return res.json({ success: true, done: true, result, logs });
    } catch (err) {
        logFn(`❌ LỖI: ${err.message}`);
        return res.json({ success: false, error: err.message, logs });
    }
});

// ------------------- 1. API CÀO 1 TRUYỆN -------------------
app.post('/api/crawl/single', async (req, res) => {
    const { bookId } = req.body; // Ví dụ: "ten-truyen-12345"
    if (!bookId) return res.status(400).json({ success: false, error: 'Thiếu bookId! (VD: ten-truyen-12345)' });

    const logFn = (msg) => console.log(`[CRAWL] ${msg}`);

    try {
        logFn(`🚀 BẮT ĐẦU CÀO: ${bookId}`);
        const result = await crawlAndSaveBook(bookId, logFn);
        logFn(`🎉 HOÀN TẤT! ${result.tenTruyen} - ${result.totalChapters} chương.`);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ------------------- 2. API CÀO NHIỀU TRANG -------------------
app.post('/api/crawl/pages', async (req, res) => {
    const { pages } = req.body; // Số trang cần cào (mỗi trang ~20 truyện)
    const numPages = parseInt(pages) || 1;
    if (numPages < 1 || numPages > 200) return res.status(400).json({ success: false, error: 'Số trang từ 1-200' });

    const logFn = (msg) => console.log(`[CRAWL] ${msg}`);

    let totalCrawled = 0;
    const results = [];

    for (let page = 1; page <= numPages; page++) {
        const listUrl = `${BASE_URL}/danh-sach/truyen-hot?page=${page}`;
        logFn(`\n📄 Trang ${page}/${numPages}: ${listUrl}`);

        try {
            const { data } = await axios.get(listUrl, { headers: HEADERS });
            const $ = cheerio.load(data);
            const items = $('.item');
            if (items.length === 0) { logFn('🏁 Hết truyện.'); break; }

            const bookIds = [];
            items.each((i, el) => {
                const href = $(el).find('a.cover').attr('href') || '';
                if (href) bookIds.push(href.replace('/', ''));
            });

            logFn(`  -> ${bookIds.length} truyện.`);

            for (let i = 0; i < bookIds.length; i++) {
                logFn(`\n📖 [${page}/${numPages}] Truyện ${i + 1}/${bookIds.length}: ${bookIds[i]}`);
                try {
                    const result = await crawlAndSaveBook(bookIds[i], logFn);
                    results.push(result);
                    totalCrawled++;
                } catch (err) {
                    logFn(`  ❌ ${err.message}`);
                }
                if (i < bookIds.length - 1) await sleep(1000);
            }
        } catch (err) {
            logFn(`❌ Lỗi trang ${page}: ${err.message}`);
        }
    }

    logFn(`\n🎉 HOÀN TẤT! Đã cào ${totalCrawled} truyện.`);
    res.json({ success: true, totalCrawled, results });
});

// ------------------- 3. API CÀO DANH SÁCH CỤ THỂ -------------------
app.post('/api/crawl/list', async (req, res) => {
    const { bookIds } = req.body; // Mảng các bookId: ["truyen-1", "truyen-2", ...]
    if (!bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Thiếu mảng bookIds!' });
    }

    const logFn = (msg) => console.log(`[CRAWL] ${msg}`);

    let totalCrawled = 0;
    const results = [];

    for (let i = 0; i < bookIds.length; i++) {
        logFn(`\n📖 [${i + 1}/${bookIds.length}] ${bookIds[i]}`);
        try {
            const result = await crawlAndSaveBook(bookIds[i], logFn);
            results.push(result);
            totalCrawled++;
        } catch (err) {
            logFn(`  ❌ ${err.message}`);
        }
        if (i < bookIds.length - 1) await sleep(800);
    }

    logFn(`\n🎉 HOÀN TẤT! ${totalCrawled}/${bookIds.length} truyện.`);
    res.json({ success: true, totalCrawled, results });
});

// ------------------- 4. API CHỈ LẤY DANH SÁCH (không lưu) -------------------
app.get('/api/truyen-hot', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const url = `${BASE_URL}/danh-sach/truyen-hot?page=${page}`;

    try {
        const { data } = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(data);
        const truyenList = [];
        const items = $('.item');

        if (items.length === 0) {
            return res.json({ success: true, current_page: page, total_stories: 0, message: `Trang ${page} không có truyện nào.`, data: [] });
        }

        items.each((index, element) => {
            const href = $(element).find('a.cover').attr('href') || '';
            const bookId = href.replace('/', '');
            const imgTag = $(element).find('a.cover img');
            let title = $(element).find('h3').text().trim() || (imgTag.attr('alt') ? imgTag.attr('alt').replace(' đọc online', '') : 'Không rõ tên');
            let cover = imgTag.attr('src') || '';
            if (cover && !cover.startsWith('http')) cover = `${BASE_URL}${cover}`;

            const lines = $(element).find('p.line');
            const author = $(lines[0]).text().replace('Tác giả :', '').trim();
            const genre = $(lines[1]).text().replace('Thể loại :', '').trim();
            const chapters = $(lines[2]).text().replace('Số chương :', '').trim();
            const views = $(lines[3]).text().replace('Lượt xem :', '').trim();

            if (bookId) truyenList.push({ title, bookId, cover, author, genre, chapters, views });
        });

        setCache(res);
        res.json({ success: true, current_page: page, next_page: page + 1, prev_page: page > 1 ? page - 1 : null, total_stories_in_page: truyenList.length, data: truyenList });
    } catch (error) {
        res.status(500).json({ success: false, message: `Lỗi trang ${page}: ` + error.message });
    }
});

// ------------------- 5. API LẤY THÔNG TIN + CHƯƠNG (Legacy) -------------------
app.get('/api/truyen/:bookId', async (req, res) => {
    const bookId = req.params.bookId;
    const pageChuong = parseInt(req.query.page) || 1;
    const truyenUrl = `${BASE_URL}/${bookId}`;

    try {
        const { data: htmlText } = await axios.get(truyenUrl, { headers: HEADERS });
        const $ = cheerio.load(htmlText);

        const chiTiet = {
            ten_truyen: $('h1').first().text().trim(),
            tac_gia: 'Đang cập nhật', the_loai: 'Đang cập nhật', luot_xem: 'Đang cập nhật',
            cover: '', trang_thai: 'Đang cập nhật', nguon: 'Sưu tầm', gioi_thieu: ''
        };
        const danhSachChuong = [];
        const linksDaLuu = new Set();

        let cover = $('.book-info img, .book-img img, .info-img img, img.cover').first().attr('src') || '';
        chiTiet.cover = (cover && !cover.startsWith('http')) ? `${BASE_URL}${cover}` : cover;

        const gioiThieuDiv = $('#gioithieu');
        if (gioiThieuDiv.length) chiTiet.gioi_thieu = gioiThieuDiv.text().trim().replace(/\r/g, '').replace(/\n/g, ' ');

        $('.info div, .info li, .list-info li, .truyen-info li, .book-info li, .meta-info li, ul > li').each((i, el) => {
            const text = $(el).text().replace(/\s+/g, ' ').trim();
            if (/Trạng thái\s*:/i.test(text)) chiTiet.trang_thai = text.replace(/.*?Trạng thái\s*:/i, '').trim();
            else if (/Nguồn\s*:/i.test(text)) chiTiet.nguon = text.replace(/.*?Nguồn\s*:/i, '').trim();
            else if (/Tác giả\s*:/i.test(text)) chiTiet.tac_gia = text.replace(/.*?Tác giả\s*:/i, '').trim();
            else if (/Thể loại\s*:/i.test(text)) chiTiet.the_loai = text.replace(/.*?Thể loại\s*:/i, '').trim();
            else if (/Lượt xem\s*:/i.test(text)) chiTiet.luot_xem = text.replace(/.*?Lượt xem\s*:/i, '').trim();
        });

        const processLinks = ($, elements) => {
            elements.each((i, el) => {
                let link = $(el).attr('href')?.trim() || '';
                const tenChuong = $(el).text().trim();
                if (!link || link.toLowerCase().startsWith('javascript') || link.startsWith('#')) return;
                if (/^\d+$/.test(tenChuong) || ['>', '<', '>>', '<<', 'Trang sau', 'Trang trước', '...'].includes(tenChuong)) return;
                if (link.startsWith('/')) link = `${BASE_URL}${link}`;
                if (!linksDaLuu.has(link)) {
                    linksDaLuu.add(link);
                    const parts = link.split('/');
                    danhSachChuong.push({ ten_chuong: tenChuong, chapterId: parts[parts.length - 1] });
                }
            });
        };

        let internalId = htmlText.match(/page\(['"]?(\d{3,})['"]?/)?.[1] ||
                         htmlText.match(/(?:story_id|truyen_id)\s*[:=]\s*['"]?(\d{3,})['"]?/i)?.[1] ||
                         $('input[id*="story_id" i], input[id*="truyen_id" i]').val();

        let totalPages = 1;
        $('.paging a, .pagination a').each((i, el) => {
            const pNum = parseInt($(el).text().trim());
            if (!isNaN(pNum) && pNum > totalPages) totalPages = pNum;
        });

        if (pageChuong === 1) processLinks($, $('#chapter-list a'));

        if (pageChuong > 1 && internalId) {
            try {
                const apiRes = await axios.get(`${BASE_URL}/get/listchap/${internalId}?page=${pageChuong}`, { headers: HEADERS, timeout: 10000 });
                let htmlContent = (typeof apiRes.data === 'object' && apiRes.data.data) ? apiRes.data.data : apiRes.data;
                const $api = cheerio.load(htmlContent);
                processLinks($api, $api('a'));
            } catch (err) {
                console.error(`Lỗi lấy trang ${pageChuong}:`, err.message);
            }
        }

        setCache(res);
        res.json({
            success: true, current_page: pageChuong, total_pages: totalPages,
            info: chiTiet, total_chapters_in_page: danhSachChuong.length, chapters: danhSachChuong
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi: ' + error.message });
    }
});

// ------------------- 6. API LẤY NỘI DUNG CHƯƠNG -------------------
app.get('/api/truyen/:bookId/:chapterId', async (req, res) => {
    const { bookId, chapterId } = req.params;
    const chapterUrl = `${BASE_URL}/${bookId}/${chapterId}`;

    try {
        const { data } = await axios.get(chapterUrl, { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(data);
        const contentDiv = $('#chapter-c, .chapter-c, .truyen, .truyen-content, #content').first();
        const noiDung = [];

        if (contentDiv.length) {
            contentDiv.find('script, style, iframe, ins').remove();
            contentDiv.find('p, br, div').each((i, el) => $(el).append('\n'));
            const rawText = contentDiv.text();
            rawText.split('\n').forEach(line => {
                const clean = line.trim();
                if (clean) noiDung.push(clean);
            });
        }

        setCache(res);
        res.json({
            success: true, bookId, chapterId,
            content: noiDung.length > 0 ? noiDung : ['Nội dung chương này tạm thời trống hoặc lỗi tải.']
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi tải nội dung chương: ' + error.message });
    }
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Crawler Server chạy tại: http://localhost:${PORT}`);
    console.log(`📌 Các endpoint:`);
    console.log(`   POST /api/crawl/single   - Cào 1 truyện (body: {bookId})`);
    console.log(`   POST /api/crawl/pages    - Cào nhiều trang (body: {pages})`);
    console.log(`   POST /api/crawl/list     - Cào danh sách (body: {bookIds: []})`);
    console.log(`   GET  /api/truyen-hot     - Lấy danh sách truyện hot`);
    console.log(`   GET  /api/truyen/:bookId - Lấy thông tin + chương`);
    console.log(`   GET  /api/truyen/:bookId/:chapterId - Lấy nội dung chương`);
});

module.exports = app;