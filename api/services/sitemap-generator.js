/**
 * ALOTRUYEN Dynamic Sitemap Generator - SEO Optimized
 * 
 * Sitemap Index + 4 sub-sitemaps: pages, categories, books, videos
 * No chapter sitemap (Google crawls from internal links)
 * Uses slug for clean URLs
 */

const pool = require('../../db');

const BASE_URL = 'https://alotruyen.pro';

/**
 * Escape XML special characters in strings
 */
function escapeXml(str) {
  if (!str) return '';
  var s = String(str);
  s = s.replace(/&/g, '\x26amp;');
  s = s.replace(/</g, '\x26lt;');
  s = s.replace(/>/g, '\x26gt;');
  s = s.replace(/"/g, '\x26quot;');
  s = s.replace(/'/g, '\x26#39;');
  return s;
}

/**
 * Format date to YYYY-MM-DD for lastmod attribute
 */
function formatDateShort(date) {
  if (!date) return new Date().toISOString().split('T')[0];
  const d = new Date(date);
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
  return d.toISOString().split('T')[0];
}

/**
 * Generate today's date string
 */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get the latest timestamp from a table column for lastmod accuracy
 */
async function getLastmodDate(table, dateColumn) {
  try {
    const result = await pool.query(
      `SELECT MAX(${dateColumn}) AS max_date FROM ${table}`
    );
    if (result.rows[0] && result.rows[0].max_date) {
      return formatDateShort(result.rows[0].max_date);
    }
  } catch (err) {
    console.error(`[GET LASTMOD ${table}]`, err.message);
  }
  return todayStr();
}

// ========================================================================
// SITEMAP INDEX
// ========================================================================

/**
 * Generate Sitemap Index - exactly 4 sub-sitemaps
 * Uses dynamic lastmod from each table's MAX timestamp
 */
async function generateSitemapIndex() {
  try {
    // Get actual lastmod dates from each table
    const [pagesLastmod, catsLastmod, booksLastmod, videosLastmod] = await Promise.all([
      Promise.resolve(todayStr()), // Static pages - always today
      getLastmodDate('categories', 'id'), // categories has no updated_at, use id ordering
      getLastmodDate('books', 'updated_at'),
      getLastmodDate('youtube_truyen', 'created_at')
    ]);

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    xml += '\n';
    xml += '  <sitemap>\n';
    xml += '    <loc>' + BASE_URL + '/sitemap-pages.xml</loc>\n';
    xml += '    <lastmod>' + pagesLastmod + '</lastmod>\n';
    xml += '  </sitemap>\n';
    xml += '\n';
    xml += '  <sitemap>\n';
    xml += '    <loc>' + BASE_URL + '/sitemap-categories.xml</loc>\n';
    xml += '    <lastmod>' + catsLastmod + '</lastmod>\n';
    xml += '  </sitemap>\n';
    xml += '\n';
    xml += '  <sitemap>\n';
    xml += '    <loc>' + BASE_URL + '/sitemap-books.xml</loc>\n';
    xml += '    <lastmod>' + booksLastmod + '</lastmod>\n';
    xml += '  </sitemap>\n';
    xml += '\n';
    xml += '  <sitemap>\n';
    xml += '    <loc>' + BASE_URL + '/sitemap-videos.xml</loc>\n';
    xml += '    <lastmod>' + videosLastmod + '</lastmod>\n';
    xml += '  </sitemap>\n';
    xml += '\n';
    xml += '</sitemapindex>';

    return xml;
  } catch (err) {
    console.error('[SITEMAP INDEX ERROR]', err.message);
    // Fallback: use today's date for all
    var fallback = '<?xml version="1.0" encoding="UTF-8"?>\n';
    fallback += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    fallback += '  <sitemap><loc>' + BASE_URL + '/sitemap-pages.xml</loc><lastmod>' + todayStr() + '</lastmod></sitemap>\n';
    fallback += '  <sitemap><loc>' + BASE_URL + '/sitemap-categories.xml</loc><lastmod>' + todayStr() + '</lastmod></sitemap>\n';
    fallback += '  <sitemap><loc>' + BASE_URL + '/sitemap-books.xml</loc><lastmod>' + todayStr() + '</lastmod></sitemap>\n';
    fallback += '  <sitemap><loc>' + BASE_URL + '/sitemap-videos.xml</loc><lastmod>' + todayStr() + '</lastmod></sitemap>\n';
    fallback += '</sitemapindex>';
    return fallback;
  }
}

// ========================================================================
// SITEMAP - STATIC PAGES (content-rich only)
// ========================================================================

/**
 * Generate sitemap-pages.xml - only pages with substantial content
 * REMOVED: doc-truyen.html, chi-tiet-truyen.html, xem-review.html (thin content / soft 404 risk)
 */
async function generateSitemapPages() {
  const today = todayStr();

  var pages = [
    { loc: '/',                  pri: '1.0', freq: 'daily'  },
    { loc: '/bxh.html',          pri: '0.9', freq: 'daily'  },
    { loc: '/theloai.html',      pri: '0.8', freq: 'weekly' },
    { loc: '/danh-sach.html',    pri: '0.8', freq: 'daily'  },
    { loc: '/video-reviews.html',pri: '0.7', freq: 'weekly' }
  ];

  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (var i = 0; i < pages.length; i++) {
    var p = pages[i];
    xml += '  <url>\n';
    xml += '    <loc>' + BASE_URL + p.loc + '</loc>\n';
    xml += '    <lastmod>' + today + '</lastmod>\n';
    xml += '    <changefreq>' + p.freq + '</changefreq>\n';
    xml += '    <priority>' + p.pri + '</priority>\n';
    xml += '  </url>\n';
  }

  xml += '</urlset>';
  return xml;
}

// ========================================================================
// SITEMAP - CATEGORIES (using slug for clean URLs)
// ========================================================================

/**
 * Generate sitemap-categories.xml from categories table
 * URL: /theloai.html?genre={slug} - using slug to avoid Vietnamese encoded chars
 */
async function generateSitemapCategories() {
  try {
    const result = await pool.query(
      "SELECT id, name, slug FROM categories WHERE slug IS NOT NULL AND slug != '' ORDER BY name"
    );
    const categories = result.rows;
    const today = todayStr();

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (var i = 0; i < categories.length; i++) {
      var cat = categories[i];
      var slug = cat.slug || cat.name;
      var catUrl = BASE_URL + '/theloai.html?genre=' + encodeURIComponent(slug);

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
// SITEMAP - BOOKS (using slug for clean URLs)
// ========================================================================

/**
 * Generate sitemap-books.xml from books table
 * URL: /chi-tiet-truyen.html?slug={slug} - clean SEO URLs using slug
 * Priority: 0.9 - main content pages
 */
async function generateSitemapBooks() {
  try {
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

      // Use slug for clean URL, fallback to id if no slug
      var slug = book.slug || book.id;
      var bookUrl = BASE_URL + '/chi-tiet-truyen.html?slug=' + escapeXml(slug);

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
// SITEMAP - VIDEOS (using slug from youtube_truyen)
// ========================================================================

/**
 * Generate sitemap-videos.xml from youtube_truyen table
 * URL: /xem-review.html?slug={slug} - using youtube_truyen.slug 
 * OR /video-review/{slug} if route exists
 * Priority: 0.7
 */
async function generateSitemapVideos() {
  try {
    const result = await pool.query(
      "SELECT id_video, slug, ngay_dang, created_at, tiu_de_goc FROM youtube_truyen WHERE slug IS NOT NULL AND slug != '' ORDER BY ngay_dang DESC NULLS LAST"
    );
    var videos = result.rows;

    // If no videos with slugs, fallback to all videos using id_video
    if (videos.length === 0) {
      const fallbackResult = await pool.query(
        'SELECT id_video, slug, ngay_dang, created_at, tiu_de_goc FROM youtube_truyen ORDER BY ngay_dang DESC NULLS LAST'
      );
      videos = fallbackResult.rows;
    }

    var today = todayStr();

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (var i = 0; i < videos.length; i++) {
      var video = videos[i];
      var lastmodDate = video.ngay_dang || video.created_at;
      var lastmod = formatDateShort(lastmodDate);

      // Use slug if available, fallback to id_video
      var identifier = video.slug || video.id_video;
      var videoUrl = BASE_URL + '/xem-review.html?slug=' + escapeXml(identifier);

      xml += '  <url>\n';
      xml += '    <loc>' + videoUrl + '</loc>\n';
      xml += '    <lastmod>' + lastmod + '</lastmod>\n';
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.7</priority>\n';
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
  generateSitemapVideos: generateSitemapVideos,
  BASE_URL: BASE_URL
};