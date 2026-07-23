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
 * Simple Vietnamese-to-slug conversion
 * Chuyển "Tiên Hiệp" -> "tien-hiep", "Đại Cổ" -> "dai-co"
 */
function slugify(text) {
  if (!text) return '';
  var s = String(text).toLowerCase();
  // Chuyển chữ có dấu sang không dấu
  var map = {
    'à':'a','á':'a','ạ':'a','ả':'a','ã':'a',
    'â':'a','ầ':'a','ấ':'a','ậ':'a','ẩ':'a','ẫ':'a',
    'ă':'a','ằ':'a','ắ':'a','ặ':'a','ẳ':'a','ẵ':'a',
    'è':'e','é':'e','ẹ':'e','ẻ':'e','ẽ':'e',
    'ê':'e','ề':'e','ế':'e','ệ':'e','ể':'e','ễ':'e',
    'ì':'i','í':'i','ị':'i','ỉ':'i','ĩ':'i',
    'ò':'o','ó':'o','ọ':'o','ỏ':'o','õ':'o',
    'ô':'o','ồ':'o','ố':'o','ộ':'o','ổ':'o','ỗ':'o',
    'ơ':'o','ờ':'o','ớ':'o','ợ':'o','ở':'o','ỡ':'o',
    'ù':'u','ú':'u','ụ':'u','ủ':'u','ũ':'u',
    'ư':'u','ừ':'u','ứ':'u','ự':'u','ử':'u','ữ':'u',
    'ỳ':'y','ý':'y','ỵ':'y','ỷ':'y','ỹ':'y',
    'đ':'d',
    'À':'a','Á':'a','Ạ':'a','Ả':'a','Ã':'a',
    'Â':'a','Ầ':'a','Ấ':'a','Ậ':'a','Ẩ':'a','Ẫ':'a',
    'Ă':'a','Ằ':'a','Ắ':'a','Ặ':'a','Ẳ':'a','Ẵ':'a',
    'È':'e','É':'e','Ẹ':'e','Ẻ':'e','Ẽ':'e',
    'Ê':'e','Ề':'e','Ế':'e','Ệ':'e','Ể':'e','Ễ':'e',
    'Ì':'i','Í':'i','Ị':'i','Ỉ':'i','Ĩ':'i',
    'Ò':'o','Ó':'o','Ọ':'o','Ỏ':'o','Õ':'o',
    'Ô':'o','Ồ':'o','Ố':'o','Ộ':'o','Ổ':'o','Ỗ':'o',
    'Ơ':'o','Ờ':'o','Ớ':'o','Ợ':'o','Ở':'o','Ỡ':'o',
    'Ù':'u','Ú':'u','Ụ':'u','Ủ':'u','Ũ':'u',
    'Ư':'u','Ừ':'u','Ứ':'u','Ự':'u','Ử':'u','Ữ':'u',
    'Ỳ':'y','Ý':'y','Ỵ':'y','Ỷ':'y','Ỹ':'y',
    'Đ':'d'
  };
  for (var k in map) {
    var re = new RegExp(k, 'g');
    s = s.replace(re, map[k]);
  }
  // Thay space bằng -, xóa ký tự đặc biệt
  s = s.replace(/[^a-z0-9-]/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^-|-$/g, '');
  return s;
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
    // Video categories sitemap (genres, styles, sub-genres)
    xml += '\n';
    xml += '  <sitemap>\n';
    xml += '    <loc>' + BASE_URL + '/sitemap-video-categories.xml</loc>\n';
    xml += '    <lastmod>' + todayStr() + '</lastmod>\n';
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
    fallback += '  <sitemap><loc>' + BASE_URL + '/sitemap-video-categories.xml</loc><lastmod>' + todayStr() + '</lastmod></sitemap>\n';
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
// SITEMAP - VIDEO CATEGORIES (genres, styles, sub-genres)
// ========================================================================

/**
 * Generate sitemap-video-categories.xml from youtube_truyen categories
 * Queries distinct genres (the_loai_goc), styles (phong_cach_review), and sub-genres (luu_phai_chi_tiet)
 * URL: /video-reviews.html?genre={slug}
 */
async function generateSitemapVideoCategories() {
  try {
    // Get distinct genres from the_loai_goc array
    const genresResult = await pool.query(
      "SELECT DISTINCT unnest(the_loai_goc) AS name FROM youtube_truyen WHERE the_loai_goc IS NOT NULL ORDER BY 1"
    );
    // Get distinct review styles
    const stylesResult = await pool.query(
      "SELECT DISTINCT phong_cach_review AS name FROM youtube_truyen WHERE phong_cach_review IS NOT NULL AND phong_cach_review != '' ORDER BY 1"
    );
    // Get distinct sub-genres
    const subGenresResult = await pool.query(
      "SELECT DISTINCT unnest(luu_phai_chi_tiet) AS name FROM youtube_truyen WHERE luu_phai_chi_tiet IS NOT NULL ORDER BY 1"
    );

    var today = todayStr();

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Add genre categories
    for (var i = 0; i < genresResult.rows.length; i++) {
      var name = genresResult.rows[i].name;
      if (!name) continue;
      var slug = slugify(name);
      var catUrl = BASE_URL + '/video-reviews.html?genre=' + slug;
      xml += '  <url>\n';
      xml += '    <loc>' + catUrl + '</loc>\n';
      xml += '    <lastmod>' + today + '</lastmod>\n';
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.6</priority>\n';
      xml += '  </url>\n';
    }

    // Add review styles
    for (var j = 0; j < stylesResult.rows.length; j++) {
      var style = stylesResult.rows[j].name;
      if (!style) continue;
      var styleSlug = slugify(style);
      var styleUrl = BASE_URL + '/video-reviews.html?style=' + styleSlug;
      xml += '  <url>\n';
      xml += '    <loc>' + styleUrl + '</loc>\n';
      xml += '    <lastmod>' + today + '</lastmod>\n';
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.5</priority>\n';
      xml += '  </url>\n';
    }

    // Add sub-genres
    for (var k = 0; k < subGenresResult.rows.length; k++) {
      var sub = subGenresResult.rows[k].name;
      if (!sub) continue;
      var subSlug = slugify(sub);
      var subUrl = BASE_URL + '/video-reviews.html?sub_genre=' + subSlug;
      xml += '  <url>\n';
      xml += '    <loc>' + subUrl + '</loc>\n';
      xml += '    <lastmod>' + today + '</lastmod>\n';
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.5</priority>\n';
      xml += '  </url>\n';
    }

    xml += '</urlset>';
    return xml;
  } catch (err) {
    console.error('[SITEMAP VIDEO CATEGORIES ERROR]', err.message);
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

      // Use slug for clean URL, fallback to id_video
      var identifier = video.slug || video.id_video;
      var videoUrl = BASE_URL + '/video-review/' + escapeXml(identifier);

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
  generateSitemapVideoCategories: generateSitemapVideoCategories,
  generateSitemapVideos: generateSitemapVideos,
  BASE_URL: BASE_URL
};
