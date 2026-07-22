/**
 * Dynamic Sitemap Generator for AloTruyen
 * Dùng chung pool từ db.js (đã hoạt động)
 */
const pool = require('../db');
const BASE_URL = 'https://alotruyen.pro';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  try {
    const [booksRes, catsRes, vidsRes] = await Promise.all([
      pool.query("SELECT id, slug, updated_at FROM books WHERE trang_thai IS NULL OR (trang_thai != 'đã xóa' AND trang_thai != 'deleted') ORDER BY id"),
      pool.query("SELECT id, name, slug FROM categories ORDER BY name"),
      pool.query("SELECT id, slug, created_at FROM video_reviews ORDER BY id")
    ]);

    const books = booksRes.rows;
    const categories = catsRes.rows;
    const videos = vidsRes.rows;
    const today = new Date().toISOString().split('T')[0];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

    // 1. Static pages
    const pages = [
      ['/', 'daily', '1.0'],
      ['/bxh.html', 'daily', '0.9'],
      ['/theloai.html', 'weekly', '0.8'],
      ['/danh-sach.html', 'daily', '0.8'],
      ['/video-reviews.html', 'weekly', '0.7'],
      ['/doc-truyen.html', 'daily', '0.7'],
      ['/xem-review.html', 'weekly', '0.6'],
    ];
    for (const [loc, freq, pri] of pages) {
      xml += '\n  <url>\n    <loc>' + BASE_URL + loc + '</loc>\n    <changefreq>' + freq + '</changefreq>\n    <priority>' + pri + '</priority>\n  </url>';
    }

    // 2. Categories (dynamic)
    for (const cat of categories) {
      xml += '\n  <url>\n    <loc>' + BASE_URL + '/theloai.html?genre=' + encodeURIComponent(cat.name) + '</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>';
    }

    // 3. Books (dynamic - mỗi book 1 URL riêng với ID)
    for (const book of books) {
      const lm = book.updated_at ? new Date(book.updated_at).toISOString().split('T')[0] : today;
      xml += '\n  <url>\n    <loc>' + BASE_URL + '/chi-tiet-truyen.html?id=' + book.id + '</loc>\n    <lastmod>' + lm + '</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>';
    }

    // 4. Videos (dynamic)
    for (const video of videos) {
      const lm = video.created_at ? new Date(video.created_at).toISOString().split('T')[0] : today;
      xml += '\n  <url>\n    <loc>' + BASE_URL + '/xem-review.html?id=' + video.id + '</loc>\n    <lastmod>' + lm + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>';
    }

    xml += '\n</urlset>';
    return res.status(200).send(xml);

  } catch (err) {
    console.error('SITEMAP ERROR:', err.message);
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>' + BASE_URL + '/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n  <url><loc>' + BASE_URL + '/bxh.html</loc><changefreq>daily</changefreq><priority>0.9</priority></url>\n  <url><loc>' + BASE_URL + '/theloai.html</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n  <url><loc>' + BASE_URL + '/danh-sach.html</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n</urlset>');
  }
};