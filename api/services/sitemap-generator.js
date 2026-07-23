/**
 * ALOTRUYEN Dynamic Sitemap Generator - Core Module
 * 
 * Generates XML sitemaps with Sitemap Index structure for optimal SEO.
 * Supports splitting large sitemaps (chapters) into multiple files.
 * 
 * Database tables: books, categories, chapters, youtube_truyen
 */

const pool = require('../../db');

const BASE_URL = 'https://alotruyen.pro';
const CHARS_PER_PAGE = 50000; // Safe limit ~ 45,000 URLs per file
const CHAPTERS_PER_SITEMAP = 10000; // ~10,000 chapters per file

/**
 * Escape XML special characters in strings
 */
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '\x26amp;')
    .replace(/</g, '\x26lt;')
    .replace(/>/g, '\x26gt;')
    .replace(/"/g, '\x26quot;')
    .replace(/'/g, '\x26#39;');
}

/**
 * Format date to ISO 8601 (YYYY-MM-DDThh:mm:ss+07:00)
 */
function formatISODate(date) {
  if (!date) {
    return new Date().toISOString().replace('Z', '+07:00');
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return new Date().toISOString().replace('Z', '+07:00');
  }
  return d.toISOString().replace('Z', '+07:00');
}

/**
 * Format date to YYYY-MM-DD for lastmod attribute
 */
function formatDateShort(date) {
  if (!date) {
    return new Date().toISOString().split('T')[0];
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  return d.toISOString().split('T')[0];
}

/**
 * Generate today's date string
 */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ========================================================================
// SITEMAP INDEX
// ========================================================================

/**
 * Generate the main Sitemap Index XML that points to all sub-sitemaps
 * Automatically determines pagination based on chapter count
 */
async function generateSitemapIndex() {
  try {
    const countResult = await pool.query('SELECT COUNT(*)::int AS cnt FROM chapters');
    const totalChapters = countResult.rows[0].cnt;
    const chapterPages = Math.ceil(totalChapters / CHAPTERS_PER_SITEMAP);
    const today = todayStr();

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    xml += '\n';
    xml += '  <sitemap>\n';
    xml += '    <loc>' + BASE_URL + '/sitemap-pages.xml</loc>\n';
    xml += '    <lastmod>' + today + '</lastmod>\n';
    xml += '  </sitemap>\n';
    xml += '\n';
    xml += '  <sitemap>\n';
    xml += '    <loc>' + BASE_URL + '/sitemap-categories.xml</loc>\n';
    xml += '    <lastmod>' + today + '</lastmod>\n';
    xml += '  </sitemap>\n';
    xml += '\n';
    xml += '  <sitemap>\n';
    xml += '    <loc>' + BASE_URL + '/sitemap-books.xml</loc>\n';
    xml += '    <lastmod>' + today + '</lastmod>\n';
    xml += '  </sitemap>\n';

    if (chapterPages <= 1) {
      xml += '\n';
      xml += '  <sitemap>\n';
      xml += '    <loc>' + BASE_URL + '/sitemap-chapters.xml</loc>\n';
      xml += '    <lastmod>' + today + '</lastmod>\n';
      xml += '  </sitemap>\n';
    } else {
      for (var i = 1; i <= chapterPages; i++) {
        xml += '\n';
        xml += '  <sitemap>\n';
        xml += '    <loc>' + BASE_URL + '/sitemap-chapters-' + i + '.xml</loc>\n';
        xml += '    <lastmod>' + today + '</lastmod>\n';
        xml += '  </sitemap>\n';
      }
    }

    xml += '\n';
    xml += '  <sitemap>\n';
    xml += '    <loc>' + BASE_URL + '/sitemap-videos.xml</loc>\n';
    xml += '    <lastmod>' + today + '</lastmod>\n';
    xml += '  </sitemap>\n';
    xml += '\n';
    xml += '</sitemapindex>';

    return xml;
  } catch (err) {
    console.error('[SITEMAP INDEX ERROR]', err.message);
    throw err;
  }
}

// ========================================================================
// SITEMAP - STATIC PAGES
// ========================================================================

/**
 * Generate sitemap-pages.xml for all static/system pages
 */
async function generateSitemapPages() {
  const today = todayStr();

  var pages = {
    '/': { pri: '1.0', freq: 'daily' },
    '/bxh.html': { pri: '0.9', freq: 'daily' },
    '/theloai.html': { pri: '0.8', freq: 'weekly' },
    '/danh-sach.html': { pri: '0.8', freq: 'daily' },
    '/video-reviews.html': { pri: '0.7', freq: 'weekly' },
    '/doc-truyen.html': { pri: '0.7', freq: 'daily' },
    '/chi-tiet-truyen.html': { pri: '0.7', freq: 'daily' },
    '/xem-review.html': { pri: '0.6', freq: 'weekly' }
  };

  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (var loc in pages) {
    var p = pages[loc];
    xml += '  <url>\n';
    xml += '    <loc>' + BASE_URL + loc + '</loc>\n';
    xml += '    <lastmod>' + today + '</lastmod>\n';
    xml += '    <changefreq>' + p.freq + '</changefreq>\n';
    xml += '    <priority>' + p.pri + '</priority>\n';
    xml += '  </url>\n';
  }

  xml += '</urlset>';
  return xml;
}

// ========================================================================
// SITEMAP - CATEGORIES
// ========================================================================

/**
 * Generate sitemap-categories.xml from the categories table
 */
async function generateSitemapCategories() {
  try {
    const result = await pool.query(
      'SELECT id, name, slug FROM categories ORDER BY name'
    );
    const categories = result.rows;
    const today = todayStr();

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (var i = 0; i < categories.length; i++) {
      var cat = categories[i];
      var catUrl = BASE_URL + '/theloai.html?genre=' + encodeURIComponent(cat.name);
      xml += '  <url>\n';
      xml += '    <loc>' + catUrl + '</loc>\n';
      xml += '    <lastmod>' + today + '</lastmod>\n';
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.7</priority>\n';
      xml += '  </url>\n';
    }

    xml += '</urlset>';
    return xml;
  } catch (err) {
    console.error('[SITEMAP CATEGORIES ERROR]', err.message);
    throw err;
  }
}

// ========================================================================
// SITEMAP - BOOKS
// ========================================================================

/**
 * Generate sitemap-books.xml for all book detail pages
 * Priority: high (0.9) - these are the main content pages
 */
async function generateSitemapBooks() {
  try {
    // Danh sch truy?n chua b? xa (trang_thai != 'd xa')
    const result = await pool.query(
      "SELECT id, slug, updated_at, created_at FROM books WHERE trang_thai IS NULL OR (trang_thai != $1 AND trang_thai != 'deleted') ORDER BY updated_at DESC NULLS LAST",
      ['đã xóa']
    );
    const books = result.rows;

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (var i = 0; i < books.length; i++) {
      var book = books[i];
      var lastmodDate = book.updated_at || book.created_at;
      var lastmod = formatDateShort(lastmodDate);
      var bookUrl = BASE_URL + '/chi-tiet-truyen.html?id=' + escapeXml(book.id);

      xml += '  <url>\n';
      xml += '    <loc>' + bookUrl + '</loc>\n';
      xml += '    <lastmod>' + lastmod + '</lastmod>\n';
      xml += '    <changefreq>daily</changefreq>\n';
      xml += '    <priority>0.9</priority>\n';
      xml += '  </url>\n';
    }

    xml += '</urlset>';
    return xml;
  } catch (err) {
    console.error('[SITEMAP BOOKS ERROR]', err.message);
    throw err;
  }
}

// ========================================================================
// SITEMAP - CHAPTERS (with pagination support)
// ========================================================================

/**
 * Generate sitemap-chapters.xml (single file or paginated)
 * 
 * @param {number} page - Page number (1-based). If null/undefined, uses page 1.
 */
async function generateSitemapChapters(page) {
  try {
    var p = (page && page > 0) ? page : 1;
    var offset = (p - 1) * CHAPTERS_PER_SITEMAP;

    const result = await pool.query(
      'SELECT b.id AS book_id, b.slug, c.chapter_number ' +
      'FROM chapters c ' +
      'JOIN books b ON c.book_id = b.id ' +
      "WHERE (b.trang_thai IS NULL OR (b.trang_thai != $1 AND b.trang_thai != 'deleted')) " +
      'ORDER BY b.id, c.chapter_number ASC ' +
      'OFFSET $2 LIMIT $3',
      ['đã xóa', offset, CHAPTERS_PER_SITEMAP]
    );
    var chapters = result.rows;
    var today = todayStr();

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (var i = 0; i < chapters.length; i++) {
      var ch = chapters[i];
      var chapterUrl = BASE_URL + '/doc-truyen.html?book_id=' + escapeXml(ch.book_id) + '&chapter_number=' + ch.chapter_number;

      xml += '  <url>\n';
      xml += '    <loc>' + chapterUrl + '</loc>\n';
      xml += '    <lastmod>' + today + '</lastmod>\n';
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.8</priority>\n';
      xml += '  </url>\n';
    }

    xml += '</urlset>';
    return xml;
  } catch (err) {
    console.error('[SITEMAP CHAPTERS ERROR]', err.message);
    throw err;
  }
}

/**
 * Get total number of chapters for pagination calculation
 */
async function getTotalChapterCount() {
  try {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS cnt ' +
      'FROM chapters c ' +
      'JOIN books b ON c.book_id = b.id ' +
      "WHERE (b.trang_thai IS NULL OR (b.trang_thai != $1 AND b.trang_thai != 'deleted'))",
      ['đã xóa']
    );
    return result.rows[0].cnt;
  } catch (err) {
    console.error('[GET CHAPTER COUNT ERROR]', err.message);
    return 0;
  }
}

// ========================================================================
// SITEMAP - VIDEOS
// ========================================================================

/**
 * Generate sitemap-videos.xml from the youtube_truyen table
 */
async function generateSitemapVideos() {
  try {
    const result = await pool.query(
      'SELECT id_video, ngay_dang, created_at, tiu_de_goc FROM youtube_truyen ORDER BY ngay_dang DESC NULLS LAST'
    );
    var videos = result.rows;
    var today = todayStr();

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (var i = 0; i < videos.length; i++) {
      var video = videos[i];
      var lastmodDate = video.ngay_dang || video.created_at;
      var lastmod = formatDateShort(lastmodDate);
      var videoUrl = BASE_URL + '/xem-review.html?id=' + escapeXml(video.id_video);

      xml += '  <url>\n';
      xml += '    <loc>' + videoUrl + '</loc>\n';
      xml += '    <lastmod>' + lastmod + '</lastmod>\n';
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.6</priority>\n';
      xml += '  </url>\n';
    }

    xml += '</urlset>';
    return xml;
  } catch (err) {
    console.error('[SITEMAP VIDEOS ERROR]', err.message);
    throw err;
  }
}

// ========================================================================
// EXPORT
// ========================================================================

module.exports = {
  generateSitemapIndex: generateSitemapIndex,
  generateSitemapPages: generateSitemapPages,
  generateSitemapCategories: generateSitemapCategories,
  generateSitemapBooks: generateSitemapBooks,
  generateSitemapChapters: generateSitemapChapters,
  getTotalChapterCount: getTotalChapterCount,
  generateSitemapVideos: generateSitemapVideos,
  CHAPTERS_PER_SITEMAP: CHAPTERS_PER_SITEMAP,
  BASE_URL: BASE_URL
};