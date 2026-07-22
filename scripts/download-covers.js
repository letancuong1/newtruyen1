/**
 * Script: Download ảnh bìa từ link hotlink về thư mục local
 * Chạy: node scripts/download-covers.js
 * 
 * Công dụng: Tải tất cả ảnh bìa đang là link ngoài (http/https) trong bảng books
 * về thư mục public/uploads/covers/ và cập nhật đường dẫn local vào DB.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pool = require('../db');

// ===================== CẤU HÌNH =====================
const COVERS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'covers');
const MAX_CONCURRENT = 5;  // Tải tối đa 5 ảnh cùng lúc
const BATCH_SIZE = 50;     // Log tiến độ sau mỗi 50 ảnh
const TIMEOUT = 30000;     // 30 giây timeout cho mỗi request

// Headers giả để tránh bị chặn
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://metruyenchuvn.com/'
};

/**
 * Lấy đuôi file từ URL
 */
function getExtension(url) {
    const clean = url.split('?')[0].split('#')[0]; // Bỏ query params và hash
    const match = clean.match(/\.(jpe?g|png|gif|webp|bmp|svg)(?:\?.*)?$/i);
    return match ? match[1].toLowerCase() : 'jpg'; // Mặc định .jpg nếu không xác định
}

/**
 * Tải 1 ảnh từ URL và lưu vào thư mục covers
 * @param {string} id - ID của truyện (dùng làm tên file)
 * @param {string} url - URL ảnh gốc
 * @returns {Promise<{success: boolean, localPath: string|null, error: string|null}>}
 */
async function downloadSingleCover(id, url) {
    try {
        const ext = getExtension(url);
        const fileName = `${id}.${ext}`;
        const filePath = path.join(COVERS_DIR, fileName);
        const localPath = `/uploads/covers/${fileName}`;

        // Kiểm tra nếu file đã tồn tại thì bỏ qua
        if (fs.existsSync(filePath)) {
            return { success: true, localPath, error: null, skipped: true };
        }

        // Tải ảnh dưới dạng stream
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: TIMEOUT,
            headers: HEADERS
        });

        // Kiểm tra content-type có phải ảnh không
        const contentType = response.headers['content-type'] || '';
        if (!contentType.startsWith('image/')) {
            return { success: false, localPath: null, error: `Không phải ảnh (${contentType})` };
        }

        // Ghi file
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        return { success: true, localPath, error: null, skipped: false };

    } catch (err) {
        return { success: false, localPath: null, error: err.message };
    }
}

/**
 * Chạy script migration
 */
async function main() {
    console.log('='.repeat(60));
    console.log('📥 BẮT ĐẦU TẢI ẢNH BÌA VỀ LOCAL');
    console.log('='.repeat(60));

    // 1. Tạo thư mục nếu chưa có
    if (!fs.existsSync(COVERS_DIR)) {
        fs.mkdirSync(COVERS_DIR, { recursive: true });
        console.log(`📁 Đã tạo thư mục: ${COVERS_DIR}`);
    } else {
        console.log(`📁 Thư mục đã tồn tại: ${COVERS_DIR}`);
    }

    // 2. Lấy danh sách truyện có ảnh bìa là link ngoài
    let books = [];
    try {
        const result = await pool.query(
            `SELECT id, ten_truyen, anh_bia FROM books WHERE anh_bia IS NOT NULL AND anh_bia != '' AND (anh_bia LIKE 'http%' OR anh_bia LIKE 'https%') ORDER BY created_at DESC`
        );
        books = result.rows;
        console.log(`📚 Tìm thấy ${books.length} truyện cần tải ảnh bìa.\n`);
    } catch (err) {
        console.error(`❌ Lỗi query database: ${err.message}`);
        process.exit(1);
    }

    if (books.length === 0) {
        console.log('✅ Không có truyện nào cần tải ảnh bìa!');
        process.exit(0);
    }

    // 3. Tải ảnh theo chunk (giới hạn concurrent)
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const total = books.length;

    for (let i = 0; i < total; i += MAX_CONCURRENT) {
        const chunk = books.slice(i, i + MAX_CONCURRENT);
        const promises = chunk.map(book => downloadSingleCover(book.id, book.anh_bia));
        const results = await Promise.allSettled(promises);

        for (let j = 0; j < results.length; j++) {
            const book = chunk[j];
            const r = results[j];

            if (r.status === 'rejected') {
                console.log(`  ❌ [${i + j + 1}/${total}] ${book.ten_truyen.substring(0, 30).padEnd(32)} | Lỗi không xác định`);
                errorCount++;
                continue;
            }

            const result = r.value;

            if (result.skipped) {
                console.log(`  ⏩ [${i + j + 1}/${total}] ${book.ten_truyen.substring(0, 30).padEnd(32)} | Đã có: ${result.localPath}`);
                skipCount++;
                
                // Vẫn update DB nếu chưa được cập nhật
                try {
                    await pool.query('UPDATE books SET anh_bia = $1 WHERE id = $2 AND (anh_bia LIKE $3 OR anh_bia LIKE $4)', 
                        [result.localPath, book.id, 'http%', 'https%']);
                } catch (e) {}
                continue;
            }

            if (result.success && result.localPath) {
                // Cập nhật đường dẫn local vào DB
                try {
                    await pool.query('UPDATE books SET anh_bia = $1 WHERE id = $2', [result.localPath, book.id]);
                    console.log(`  ✅ [${i + j + 1}/${total}] ${book.ten_truyen.substring(0, 30).padEnd(32)} | ${result.localPath}`);
                    successCount++;
                } catch (dbErr) {
                    console.log(`  ⚠️ [${i + j + 1}/${total}] ${book.ten_truyen.substring(0, 30).padEnd(32)} | Tải được nhưng lỗi DB: ${dbErr.message}`);
                    successCount++; // Vẫn tính là tải được
                }
            } else {
                console.log(`  ❌ [${i + j + 1}/${total}] ${book.ten_truyen.substring(0, 30).padEnd(32)} | ${result.error || 'Lỗi không xác định'}`);
                errorCount++;
            }
        }

        // Log tiến độ sau mỗi BATCH_SIZE ảnh
        const processed = Math.min(i + MAX_CONCURRENT, total);
        if (processed % BATCH_SIZE === 0 || processed === total) {
            console.log(`\n📊 Tiến độ: ${processed}/${total} ảnh | ✅ ${successCount} | ⏩ ${skipCount} | ❌ ${errorCount}\n`);
        }

        // Nghỉ 200ms giữa các chunk để tránh quá tải
        if (i + MAX_CONCURRENT < total) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    // 4. Tổng kết
    console.log('='.repeat(60));
    console.log('🎉 HOÀN TẤT!');
    console.log(`   ✅ Thành công: ${successCount}`);
    console.log(`   ⏩ Đã có sẵn: ${skipCount}`);
    console.log(`   ❌ Thất bại: ${errorCount}`);
    console.log(`   📁 Thư mục: ${COVERS_DIR}`);
    console.log('='.repeat(60));

    process.exit(0);
}

// Xử lý lỗi toàn cục
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err.message);
    process.exit(1);
});

main();