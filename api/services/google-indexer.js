const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const keyPath = path.join(process.cwd(), 'service_account.json');

if (!fs.existsSync(keyPath)) {
  console.error('❌ [Google Indexer] Không tìm thấy file service_account.json tại:', keyPath);
} else {
  console.log('✅ [Google Indexer] Đã kết nối file key thành công:', keyPath);
}

// Khởi tạo Auth bằng GoogleAuth (Chuẩn chính thức của Google, tự động đọc keyFile)
const auth = new google.auth.GoogleAuth({
  keyFile: keyPath,
  scopes: ['https://www.googleapis.com/auth/indexing'],
});

const indexing = google.indexing({ version: 'v3', auth });

/**
 * Gửi yêu cầu Index URL lên Google
 */
async function requestIndexing(url, type = 'URL_UPDATED') {
  try {
    const response = await indexing.urlNotifications.publish({
      requestBody: {
        url: url,
        type: type,
      },
    });
    console.log(`[Google Indexing Success] ${url}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`[Google Indexing Error] ${url}:`, error.response ? error.response.data : error.message);
    return null;
  }
}

module.exports = { 
  requestIndexing,
  requestBookIndexing: requestIndexing,
  requestChapterIndexing: requestIndexing,
  requestVideoIndexing: requestIndexing
};