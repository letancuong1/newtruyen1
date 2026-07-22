/**
 * Crawler Service - Cào truyện từ Metruyenchuvn.com
 * Chuyển đổi từ Python script sang Node.js (axios + cheerio)
 * Lưu trực tiếp vào Database qua pool
 */
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../../db');

// ===================== CẤU HÌNH =====================
const BASE_URL = 'https://metruyenchuvn.com';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/javascript, */*; q=0.01'
};

const MAX_CONCURRENT = 5; // Số request song song tối đa (kiểm soát để không bị block)
const CHUNK_SIZE = 50;     // Gộp 50 chương để insert batch
const MAX_RETRIES = 3;

// Tạo axios instance với headers mặc định
const apiClient = axios.create({
    timeout: 15000,
    headers: HEADERS
});

// ===================== UTILITY =====================
function generateUniqueId(existingIds = new Set()) {
    while (true) {
        const id = crypto.randomUUID();
        if (!existingIds.has(id)) return id;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Chia mảng thành các chunk nhỏ để xử lý song song có kiểm soát
 */
function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

/**
 * Kiểm tra truyện đã tồn tại trong DB chưa (theo tên hoặc 50 ký tự đầu nội dung)
 * @param {string} tenTruyen
 * @param {string} firstChapterContent - nội dung chương đầu (tối thiểu 50 ký tự)
 * @returns {Promise<object|null>} - thông tin truyện nếu đã tồn tại, null nếu chưa
 */
async function checkDuplicateBook(tenTruyen, firstChapterContent) {
    if (!tenTruyen) return null;
    
    try {
        // 1. Kiểm tra theo tên truyện (chính xác hoặc LIKE)
        const nameCheck = await pool.query(
            'SELECT id, ten_truyen, so_chuong FROM books WHERE ten_truyen ILIKE $1 OR ten_truyen ILIKE $2 LIMIT 1',
            [tenTruyen, tenTruyen.replace(/[^\w\s]/g, '') + '%']
        );
        if (nameCheck.rows.length > 0) {
            return { ...nameCheck.rows[0], matchType: 'name' };
        }
        
        // 2. Kiểm tra theo 50 ký tự đầu nội dung (chương đầu tiên)
        if (firstChapterContent && firstChapterContent.length >= 50) {
            const sampleText = firstChapterContent.substring(0, 50);
            const contentCheck = await pool.query(
                `SELECT b.id, b.ten_truyen, b.so_chuong 
                 FROM books b 
                 JOIN chapters c ON c.book_id = b.id 
                 WHERE c.chapter_number = 1 
                   AND (c.content ILIKE $1 OR c.content LIKE $2)
                 LIMIT 1`,
                [`%${sampleText}%`, `%${sampleText}%`]
            );
            if (contentCheck.rows.length > 0) {
                return { ...contentCheck.rows[0], matchType: 'content' };
            }
        }
    } catch (err) {
        // Nếu lỗi query, bỏ qua check
        console.error('[checkDuplicateBook] Lỗi:', err.message);
    }
    
    return null;
}

/**
 * Xử lý một mảng các promise với số lượng concurrent giới hạn
 */
async function processInChunks(items, maxConcurrent, fn) {
    const results = [];
    for (let i = 0; i < items.length; i += maxConcurrent) {
        const chunk = items.slice(i, i + maxConcurrent);
        const chunkResults = await Promise.allSettled(chunk.map(item => fn(item)));
        for (const result of chunkResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                console.error(`[Crawler] Lỗi xử lý item: ${result.reason?.message || result.reason}`);
            }
        }
        // Nghỉ ngắn giữa các chunk để tránh bị rate limit
        if (i + maxConcurrent < items.length) {
            await sleep(500);
        }
    }
    return results;
}

// ===================== LẤY NỘI DUNG TRANG =====================
/**
 * Lấy danh sách chương từ trang chi tiết truyện + API phân trang
 */
async function extractChapters(link, logFn) {
    const chapters = [];
    const seenLinks = new Set();
    let detail = {
        ten_truyen: '',
        tac_gia: 'Đang cập nhật',
        the_loai: 'Đang cập nhật',
        luot_xem: 'Đang cập nhật',
        cover: '',
        trang_thai: 'Đang cập nhật',
        nguon: 'Sưu tầm',
        gioi_thieu: ''
    };

    try {
        const response = await apiClient.get(link);
        const $ = cheerio.load(response.data);

        // Lấy tên truyện
        const tenTruyenEl = $('h1[itemprop="name"], .book-info h1, h1').first();
        if (tenTruyenEl.length) {
            detail.ten_truyen = tenTruyenEl.text().trim();
        }

        // Lấy ảnh bìa
        let cover = $('.book-info img, .book-img img, .info-img img, img.cover').first().attr('src') || '';
        detail.cover = (cover && !cover.startsWith('http')) ? `${BASE_URL}${cover}` : cover;

        // Lấy giới thiệu
        const gioiThieuDiv = $('#gioithieu');
        if (gioiThieuDiv.length) {
            detail.gioi_thieu = gioiThieuDiv.text().trim().replace(/\r?\n/g, ' ');
        }

        // Lấy thông tin từ các thẻ li
        $('.info div, .info li, .list-info li, .truyen-info li, .book-info li, .meta-info li, .book-info-top li, ul > li').each((i, el) => {
            const text = $(el).text().trim();
            if (text.includes('Trạng thái:')) {
                detail.trang_thai = text.replace('Trạng thái:', '').trim();
            } else if (text.includes('Nguồn')) {
                detail.nguon = text.split(':').slice(-1)[0].trim();
            } else if (/Tác giả\s*:/i.test(text)) {
                detail.tac_gia = text.replace(/.*?Tác giả\s*:/i, '').trim();
            } else if (/Thể loại\s*:/i.test(text)) {
                detail.the_loai = text.replace(/.*?Thể loại\s*:/i, '').trim();
            } else if (/Lượt xem\s*:/i.test(text)) {
                detail.luot_xem = text.replace(/.*?Lượt xem\s*:/i, '').trim();
            }
        });

        // Lấy danh sách chương từ trang đầu
        $('#chapter-list a').each((i, el) => {
            let link = $(el).attr('href') || '';
            const tenChuong = $(el).text().trim();

            if (!link || link.toLowerCase().startsWith('javascript') || link.startsWith('#')) return;
            if (tenChuong.match(/^\d+$/) || ['>', '<', '>>', '<<', 'Trang sau', 'Trang trước', '...'].includes(tenChuong)) return;

            if (link.startsWith('/')) link = BASE_URL + link;
            else if (!link.startsWith('http')) return;

            if (!seenLinks.has(link)) {
                seenLinks.add(link);
                chapters.push({ ten_chuong: tenChuong, link });
            }
        });

        // Tìm ID nội bộ để gọi API phân trang
        const hasPaging = $('.paging').length > 0;
        if (!hasPaging) {
            return { detail, chapters };
        }

        let internalId = null;

        // Tìm ID ẩn trong response text (pattern page('123456') hoặc story_id: 123456)
        const pageMatch = response.data.match(/page\(['"]?(\d{3,})['"]?/);
        if (pageMatch) internalId = pageMatch[1];

        if (!internalId) {
            const jsMatch = response.data.match(/(?:story_id|truyen_id)\s*[:=]\s*['"]?(\d{3,})['"]?/i);
            if (jsMatch) internalId = jsMatch[1];
        }

        if (!internalId) {
            // Tìm input ẩn có id chứa story_id hoặc truyen_id
            const inputEl = $('input[id*="story_id"], input[id*="truyen_id"]').first();
            if (inputEl.length && inputEl.val() && /^\d+$/.test(inputEl.val())) {
                internalId = inputEl.val();
            }
        }

        if (!internalId) {
            return { detail, chapters };
        }

        // Gọi API phân trang để lấy thêm chương
        let pageNum = 2;
        while (true) {
            const apiUrl = `${BASE_URL}/get/listchap/${internalId}?page=${pageNum}`;
            try {
                const res = await apiClient.get(apiUrl);
                let htmlContent = res.data;

                // Nếu response là JSON, lấy trường 'data'
                if (typeof res.data === 'object' && res.data.data) {
                    htmlContent = res.data.data;
                }

                const $$ = cheerio.load(htmlContent);
                const aTags = $$('a');
                if (aTags.length === 0) break;

                let newChaps = 0;
                aTags.each((i, el) => {
                    let link = $$(el).attr('href') || '';
                    const tenChuong = $$(el).text().trim();

                    if (!link || link.toLowerCase().startsWith('javascript') || link.startsWith('#')) return;
                    if (tenChuong.match(/^\d+$/) || ['>', '<', '>>', '<<', 'Trang sau', 'Trang trước', '...'].includes(tenChuong)) return;

                    if (link.startsWith('/')) link = BASE_URL + link;
                    else if (!link.startsWith('http')) return;

                    if (!seenLinks.has(link)) {
                        seenLinks.add(link);
                        chapters.push({ ten_chuong: tenChuong, link });
                        newChaps++;
                    }
                });

                if (newChaps === 0) break;
                pageNum++;
            } catch (err) {
                logFn(`  [Lỗi API] Trang ${pageNum}: ${err.message}`);
                break;
            }
        }

    } catch (err) {
        logFn(`  [Cảnh báo] Lỗi kết nối lấy danh sách chương: ${err.message}`);
    }

    return { detail, chapters };
}

// ===================== XỬ LÝ ẢNH BÌA =====================
// Trên Vercel (serverless) không thể ghi file.
// Script `scripts/download-covers.js` chạy local để tải ảnh về thư mục public/uploads/covers/
// Nếu ảnh đã được tải về → dùng đường dẫn local, nếu không → giữ link gốc

const COVERS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'covers');

/**
 * Xử lý đường dẫn ảnh bìa:
 * - Nếu đã có file local trong thư mục covers → dùng đường dẫn local
 * - Nếu không → giữ nguyên link gốc (hotlink)
 */
function resolveCoverUrl(id, originalUrl) {
    if (!originalUrl || !originalUrl.startsWith('http')) return originalUrl;
    
    try {
        if (!fs.existsSync(COVERS_DIR)) return originalUrl;
        
        // Tìm file ảnh trong thư mục covers có tên bắt đầu bằng id
        const files = fs.readdirSync(COVERS_DIR);
        const match = files.find(f => f.startsWith(id + '.'));
        if (match) {
            return `/uploads/covers/${match}`;
        }
    } catch (e) {}
    
    return originalUrl;
}

/**
 * (Alias) - Giữ tên cho tương thích code cũ, thực chất là resolveCoverUrl
 */
async function downloadCoverLocal(id, url) {
    return resolveCoverUrl(id, url);
}

// ===================== LẤY NỘI DUNG 1 CHƯƠNG =====================
async function fetchChapterContent(chapterItem) {
    const { ten_chuong, link } = chapterItem;
    let contentLines = [];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await apiClient.get(link, { timeout: 15000 });
            const $ = cheerio.load(response.data);

            // Tìm content div với nhiều selector
            const contentSelectors = [
                '#chapter-c',
                '.chapter-c',
                '.truyen',
                '.truyen-content',
                '#content'
            ];

            let contentDiv = null;
            for (const sel of contentSelectors) {
                const el = $(sel).first();
                if (el.length) {
                    contentDiv = el;
                    break;
                }
            }

            if (contentDiv) {
                // Xóa các thẻ không cần thiết
                contentDiv.find('script, style, iframe, ins').remove();

                const rawText = contentDiv.text();
                const lines = rawText.split('\n');
                for (const line of lines) {
                    const clean = line.trim();
                    if (clean) contentLines.push(clean);
                }
            }
            break; // Thành công thì thoát loop

        } catch (err) {
            if (attempt < MAX_RETRIES - 1) {
                await sleep(1500);
            }
        }
    }

    return {
        ten_chuong,
        noi_dung: contentLines.length > 0 ? contentLines : ['Nội dung chương này tạm thời trống hoặc lỗi tải.']
    };
}

// ===================== CÀO THEO LINK CỤ THỂ =====================
/**
 * Cào 1 truyện từ link cụ thể
 * @param {string} bookLink - Link truyện trên metruyenchuvn.com
 * @param {function} logFn - Hàm ghi log
 * @returns {object} - Thông tin truyện đã lưu
 */
async function crawlSingleBook(bookLink, logFn) {
    // Hỗ trợ cả full URL (https://metruyenchuvn.com/truyen-xyz) và bookId (truyen-xyz)
    let bookIdParam = bookLink;
    if (bookLink.startsWith('http')) {
        // Lấy bookId từ URL: https://metruyenchuvn.com/truyen-xyz -> truyen-xyz
        const parts = bookLink.split('/').filter(s => s);
        bookIdParam = parts[parts.length - 1] || parts[parts.length - 2] || bookLink;
        // Đảm bảo link đầy đủ
        if (!bookLink.startsWith(BASE_URL)) {
            bookLink = `${BASE_URL}/${bookIdParam}`;
        }
    } else if (!bookLink.startsWith(BASE_URL)) {
        // Nếu chỉ là bookId, tạo full URL
        bookLink = `${BASE_URL}/${bookLink}`;
    }

    logFn(`📖 Đang xử lý: ${bookIdParam}`);

    // Tạo ID
    const bookId = generateUniqueId();

    // Lấy danh sách chương + thông tin
    const { detail, chapters } = await extractChapters(bookLink, logFn);
    
    // === KIỂM TRA TRÙNG LẶP ===
    // Lấy tên truyện từ detail nếu có, hoặc từ URL
    let tenTruyenCheck = detail?.ten_truyen || bookIdParam;
    let firstChapterContent = '';
    if (chapters.length > 0) {
        // Fetch nội dung chương đầu để lấy 50 ký tự so sánh
        try {
            const firstChap = await fetchChapterContent(chapters[0]);
            firstChapterContent = firstChap.noi_dung?.join('\n') || '';
        } catch (e) {}
    }
    
    const duplicate = await checkDuplicateBook(tenTruyenCheck, firstChapterContent);
    if (duplicate) {
        logFn(`  ⏩ BỎ QUA! "${tenTruyenCheck}" đã tồn tại trong DB (ID: ${duplicate.id}, match: ${duplicate.matchType}).`);
        return { id: duplicate.id, totalChapters: duplicate.so_chuong, tenTruyen: duplicate.ten_truyen, skipped: true };
    }
    
    const totalChapters = chapters.length;
    logFn(`  -> Tìm thấy ${totalChapters} chương. Đang tải nội dung...`);

    // Lấy nội dung các chương theo chunk (kiểm soát concurrent)
    const allChapterData = [];

    const chapterChunks = chunkArray(chapters, MAX_CONCURRENT);
    for (let i = 0; i < chapterChunks.length; i++) {
        const chunk = chapterChunks[i];
        const results = await Promise.allSettled(
            chunk.map(ch => fetchChapterContent(ch))
        );
        for (const r of results) {
            if (r.status === 'fulfilled') {
                allChapterData.push(r.value);
            } else {
                logFn(`    [Lỗi] ${r.reason?.message || 'Lỗi không xác định'}`);
            }
        }

        // Log tiến độ
        if ((i + 1) % 5 === 0 || i === chapterChunks.length - 1) {
            logFn(`    [+] Đã tải ${Math.min((i + 1) * MAX_CONCURRENT, totalChapters)}/${totalChapters} chương...`);
        }

        // Nghỉ giữa các chunk
        if (i < chapterChunks.length - 1) {
            await sleep(300);
        }
    }

    // Lưu vào database trong transaction
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lưu thông tin truyện vào bảng books
        // Lấy thông tin thêm từ books nếu cần (tác giả, thể loại...)
        const now = new Date();
        const slug = bookLink.split('/').filter(s => s).pop() || bookId;

        // Kiểm tra xem link_goc đã tồn tại chưa
        const existCheck = await client.query(
            'SELECT id, ten_truyen FROM books WHERE link_goc = $1 LIMIT 1',
            [bookLink]
        );

        let finalBookId;
        if (existCheck.rows.length > 0) {
            // Đã tồn tại, cập nhật
            finalBookId = existCheck.rows[0].id;
            logFn(`  ⏩ Truyện đã tồn tại với ID: ${finalBookId}. Đang cập nhật...`);

            await client.query(`
                UPDATE books SET
                    so_chuong = $1,
                    trang_thai = $2,
                    nguon = $3,
                    gioi_thieu = CASE WHEN $4::text <> '' THEN $4 ELSE gioi_thieu END,
                    updated_at = NOW()
                WHERE id = $5
            `, [totalChapters, detail.trang_thai, detail.nguon, detail.gioi_thieu, finalBookId]);
        } else {
            // Chưa tồn tại, insert mới
            // Cố gắng lấy tên truyện từ response
            let tenTruyen = bookLink.split('/').pop() || 'Truyện mới';
            let tacGia = 'Đang cập nhật';
            let anhBia = '';
            let theLoai = [];

            // Thử fetch lại để lấy thông tin cơ bản
            try {
                const resp = await apiClient.get(bookLink);
                const $$ = cheerio.load(resp.data);

                tenTruyen = $$('h1[itemprop="name"], .book-info h1, h1').first().text().trim() || tenTruyen;

                const coverImg = $$('a.cover img, .book-cover img, img[itemprop="image"]').first();
                if (coverImg.length) {
                    let src = coverImg.attr('src') || coverImg.attr('data-src') || '';
                    if (src.startsWith('/')) src = BASE_URL + src;
                    anhBia = src;
                }

                // Tác giả
                const authorEl = $$('li:contains("Tác giả") a, .book-info-top li:contains("Tác giả") a').first();
                if (authorEl.length) {
                    tacGia = authorEl.text().trim();
                }

                // Thể loại
                const categoryEls = $$('li:contains("Thể loại") a, .book-info-top li:contains("Thể loại") a');
                if (categoryEls.length) {
                    categoryEls.each((i, el) => {
                        theLoai.push($$(el).text().trim());
                    });
                }
            } catch (err) {
                // Không lấy được, dùng giá trị mặc định
            }

            finalBookId = bookId;

            // Tải ảnh bìa về local trước khi lưu
            const localCover = await downloadCoverLocal(finalBookId, anhBia);
            logFn(`  🖼️ Ảnh bìa: ${anhBia.substring(0, 50)}... → ${localCover}`);
            await client.query(`
                INSERT INTO books (id, ten_truyen, anh_bia, tac_gia, the_loai, luot_xem, so_chuong, trang_thai, nguon, gioi_thieu, slug, link_goc, created_at, updated_at, is_vip)
                VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, NOW(), NOW(), false)
            `, [finalBookId, tenTruyen, localCover, tacGia, theLoai, totalChapters, detail.trang_thai, detail.nguon, detail.gioi_thieu, slug, bookLink]);

            logFn(`  ✅ Đã tạo truyện mới: "${tenTruyen}" (ID: ${finalBookId})`);
        }

        // Lưu nội dung các chương
        // Xóa các chương cũ nếu đã tồn tại (để tránh trùng) - chỉ xóa nếu re-crawl
        if (existCheck.rows.length > 0 && allChapterData.length > 0) {
            // Kiểm tra số chương hiện tại
            const existingCount = await client.query(
                'SELECT COUNT(*)::int AS cnt FROM chapters WHERE book_id = $1',
                [finalBookId]
            );
            if (existingCount.rows[0].cnt > 0 && existingCount.rows[0].cnt <= totalChapters) {
                // Xóa chương cũ và insert lại
                await client.query('DELETE FROM chapters WHERE book_id = $1', [finalBookId]);
                logFn(`  🔄 Đã xóa ${existingCount.rows[0].cnt} chương cũ, chuẩn bị cập nhật...`);
            }
        }

        // Insert chapters theo chunk để tránh query quá lớn
        const chapterChunksForDB = chunkArray(allChapterData, CHUNK_SIZE);
        let chapNumber = 1;
        let totalInserted = 0;

        for (const chunk of chapterChunksForDB) {
            // Build bulk insert
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
                // Sử dụng subquery để chèn có kiểm tra tồn tại, tránh lỗi nếu chưa có unique constraint
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

        // Cập nhật lại số chương chính xác
        await client.query(
            'UPDATE books SET so_chuong = (SELECT COUNT(*) FROM chapters WHERE book_id = $1), updated_at = NOW() WHERE id = $1',
            [finalBookId]
        );

        await client.query('COMMIT');

        logFn(`  ✅ Đã lưu ${totalInserted} chương vào database.`);
        return { id: finalBookId, totalChapters: totalInserted, tenTruyen: existCheck.rows[0]?.ten_truyen || 'Truyện mới' };

    } catch (err) {
        await client.query('ROLLBACK');
        logFn(`  ❌ Lỗi database: ${err.message}`);
        throw err;
    } finally {
        client.release();
    }
}

// ===================== CÀO THEO DANH SÁCH TRANG =====================
/**
 * Cào truyện từ danh sách trang hot
 * @param {number} pages - Số trang cần cào (mỗi trang ~20 truyện)
 * @param {function} logFn - Hàm ghi log
 */
async function crawlBookList(pages = 1, logFn) {
    logFn('🚀 BẮT ĐẦU CÀO TRUYỆN TỪ DANH SÁCH...');

    let totalCrawled = 0;

    for (let page = 1; page <= pages; page++) {
        const listUrl = `${BASE_URL}/danh-sach/truyen-hot?page=${page}`;
        logFn(`\n📄 ĐANG QUÉT TRANG: ${page} (${listUrl})`);

        try {
            const response = await apiClient.get(listUrl);
            const $ = cheerio.load(response.data);
            const items = $('div.item');

            if (items.length === 0) {
                logFn('🏁 Đã hết truyện để cào.');
                break;
            }

            const bookLinks = [];
            items.each((i, el) => {
                const titleTag = $(el).find('h3 a');
                if (!titleTag.length) return;

                let link = titleTag.attr('href') || '';
                if (link.startsWith('/')) link = BASE_URL + link;

                if (link) {
                    bookLinks.push(link);
                }
            });

            logFn(`  -> Tìm thấy ${bookLinks.length} truyện trên trang.`);

            // Xử lý từng truyện (tuần tự để tránh quá tải)
            for (let i = 0; i < bookLinks.length; i++) {
                const link = bookLinks[i];
                logFn(`\n${'='.repeat(40)}`);
                logFn(`📖 [${page}/${pages}] Truyện ${i + 1}/${bookLinks.length}`);

                try {
                    await crawlSingleBook(link, logFn);
                    totalCrawled++;
                } catch (err) {
                    logFn(`  ❌ Lỗi: ${err.message}`);
                }

                // Nghỉ giữa các truyện
                if (i < bookLinks.length - 1) {
                    await sleep(1000);
                }
            }

        } catch (err) {
            logFn(`❌ Lỗi hệ thống khi quét trang ${page}: ${err.message}`);
        }
    }

    logFn(`\n🎉 HOÀN TẤT! Đã cào tổng cộng ${totalCrawled} truyện.`);
    return { totalCrawled };
}

// ===================== CÀO THEO LINK DANH SÁCH =====================
/**
 * Cào tất cả truyện từ 1 link danh sách (VD: https://metruyenchuvn.com/danh-sach/truyen-ngon-tinh-ngan)
 * @param {string} listLink - Link danh sách (có thể có ?page= hoặc không)
 * @param {function} logFn - Hàm ghi log
 */
async function crawlListPage(listLink, logFn) {
    logFn(`🚀 BẮT ĐẦU CÀO DANH SÁCH: ${listLink}`);

    // Xử lý link
    let baseUrl = listLink;
    let startPage = 1;

    // Nếu link đã có ?page=, lấy page đó
    const pageMatch = listLink.match(/[?&]page=(\d+)/);
    if (pageMatch) {
        startPage = parseInt(pageMatch[1]) || 1;
        baseUrl = listLink.replace(/[?&]page=\d+/, '');
    }

    // Đảm bảo baseUrl không kết thúc bằng ? hay &
    baseUrl = baseUrl.replace(/[?&]$/, '');
    if (!baseUrl.startsWith('http')) {
        baseUrl = BASE_URL + (baseUrl.startsWith('/') ? '' : '/') + baseUrl;
    }

    let totalCrawled = 0;
    let totalSkipped = 0;
    let page = startPage;
    let hasMore = true;

    while (hasMore) {
        const pageUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${page}`;
        logFn(`\n📄 Trang ${page}: ${pageUrl}`);

        try {
            const response = await apiClient.get(pageUrl);
            const $ = cheerio.load(response.data);
            const items = $('div.item');

            if (items.length === 0) {
                logFn('🏁 Không còn truyện nào.');
                hasMore = false;
                break;
            }

            const bookLinks = [];
            items.each((i, el) => {
                const href = $(el).find('a.cover').attr('href') || '';
                if (href) bookLinks.push(href.startsWith('/') ? BASE_URL + href : href);
            });

            logFn(`  -> ${bookLinks.length} truyện.`);

            for (let i = 0; i < bookLinks.length; i++) {
                const link = bookLinks[i];
                logFn(`\n📖 [Tr ${page}] ${i + 1}/${bookLinks.length}`);
                try {
                    const result = await crawlSingleBook(link, logFn);
                    if (result.skipped) totalSkipped++;
                    else totalCrawled++;
                } catch (err) {
                    logFn(`  ❌ ${err.message}`);
                }
                if (i < bookLinks.length - 1) await sleep(800);
            }

            page++;

            // Kiểm tra nếu có nút "Trang sau" thì còn, nếu không thì dừng
            const nextBtn = $('.paging a:last-child, .pagination a:last-child');
            if (nextBtn.length && (nextBtn.text().trim() === '>' || nextBtn.text().trim() === '>>' || nextBtn.text().trim() === 'Trang sau')) {
                // còn trang
            } else {
                // Thử kiểm tra page hiện tại có đủ item không
                if (bookLinks.length < 20) hasMore = false;
            }

        } catch (err) {
            logFn(`❌ Lỗi trang ${page}: ${err.message}`);
            hasMore = false;
        }
    }

    logFn(`\n🎉 HOÀN TẤT! Đã cào ${totalCrawled} truyện mới, bỏ qua ${totalSkipped} truyện đã có.`);
    return { totalCrawled, totalSkipped };
}

// ===================== EXPORT =====================
module.exports = {
    crawlSingleBook,
    crawlBookList,
    crawlListPage
};
