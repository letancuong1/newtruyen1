/**
 * Routes: Crawler (cào truyện tự động từ Metruyenchuvn.com)
 */
const express = require('express');
const router = express.Router();
const { crawlSingleBook, crawlBookList, crawlListPage } = require('../services/crawlerService');

// ===================== POST /api/admin/crawl =====================
// Body: { link: "https://metruyenchuvn.com/..." } hoặc { pages: 1 }
// Không dùng SSE, trả về JSON đơn giản với mảng logs
router.post('/admin/crawl', async (req, res) => {
    const { link, pages, list } = req.body;

    if (!link && !pages && !list) {
        return res.status(400).json({
            success: false,
            error: 'Thiếu tham số! Cung cấp "link" (URL truyện), "pages" (số trang), hoặc "list" (link danh sách).'
        });
    }

    // Thu thập log vào mảng, trả về sau khi hoàn tất
    const logs = [];
    const logFn = (message) => {
        logs.push(message);
        console.log(`[CRAWL] ${message}`);
    };

    try {
        let result;

        if (link) {
            // Cào 1 truyện
            logFn(`🚀 BẮT ĐẦU CÀO: ${link}`);
            result = await crawlSingleBook(link, logFn);
            logFn(`🎉 HOÀN TẤT! Đã lưu "${result.tenTruyen}" với ${result.totalChapters} chương.`);
        } else if (list) {
            // Cào theo link danh sách (VD: /danh-sach/truyen-ngon-tinh-ngan)
            logFn(`🚀 BẮT ĐẦU CÀO DANH SÁCH: ${list}`);
            result = await crawlListPage(list, logFn);
            logFn(`🎉 HOÀN TẤT! ${result.totalCrawled} mới, bỏ qua ${result.totalSkipped} truyện cũ.`);
        } else if (pages) {
            // Cào theo số trang hot
            const numPages = parseInt(pages) || 1;
            result = await crawlBookList(numPages, logFn);
            logFn(`🎉 HOÀN TẤT! Đã cào tổng cộng ${result.totalCrawled} truyện.`);
        }

        return res.json({
            success: true,
            done: true,
            result,
            logs
        });

    } catch (err) {
        logFn(`❌ LỖI: ${err.message}`);
        return res.json({
            success: false,
            error: err.message,
            logs
        });
    }
});

module.exports = router;