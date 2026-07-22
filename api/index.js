/**
 * ALOTRUYEN API - Main Entry Point
 * Tách thành các file route riêng biệt trong /api/routes/
 */
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const https = require('https');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(compression());

// Security headers - chặn lỗi CSP, framekill
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://vercel.app https://*.vercel.app");
    }
    next();
});

// ===================== SITEMAP ROUTE (catch BOTH paths) =====================
app.get(['/sitemap.xml', '/api/sitemap.xml'], async (req, res) => {
  try {
    const pool = require('../db');
    const BASE_URL = 'https://alotruyen.pro';
    
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    
    // Get all books (non-deleted)
    const booksResult = await pool.query(
      "SELECT id, slug, updated_at FROM books WHERE trang_thai IS NULL OR (trang_thai != 'đã xóa' AND trang_thai != 'deleted') ORDER BY id"
    );
    const books = booksResult.rows;
    
    // Get all categories
    const categoriesResult = await pool.query('SELECT id, name, slug FROM categories ORDER BY name');
    const categories = categoriesResult.rows;
    
    // Get video reviews
    const videosResult = await pool.query('SELECT id, slug, created_at FROM video_reviews ORDER BY id');
    const videos = videosResult.rows;
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    
    // Static pages (priority pages only - no login/register/profile)
    const staticPages = [
      { loc: '/', priority: '1.0', changefreq: 'daily' },
      { loc: '/index.html', priority: '1.0', changefreq: 'daily' },
      { loc: '/bxh.html', priority: '0.9', changefreq: 'daily' },
      { loc: '/theloai.html', priority: '0.8', changefreq: 'weekly' },
      { loc: '/danh-sach.html', priority: '0.8', changefreq: 'daily' },
      { loc: '/video-reviews.html', priority: '0.7', changefreq: 'weekly' },
      { loc: '/doc-truyen.html', priority: '0.7', changefreq: 'daily' },
      { loc: '/chi-tiet-truyen.html', priority: '0.7', changefreq: 'daily' },
      { loc: '/xem-review.html', priority: '0.6', changefreq: 'weekly' },
    ];
    
    for (const page of staticPages) {
      xml += `
  <url>
    <loc>${BASE_URL}${page.loc}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
    }
    
    // Category pages
    const today = new Date().toISOString().split('T')[0];
    for (const cat of categories) {
      xml += `
  <url>
    <loc>${BASE_URL}/theloai.html?genre=${encodeURIComponent(cat.name)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }
    
    // Novel detail pages (dynamic - the MOST important for SEO)
    for (const book of books) {
      const lastmod = book.updated_at ? new Date(book.updated_at).toISOString().split('T')[0] : today;
      xml += `
  <url>
    <loc>${BASE_URL}/chi-tiet-truyen.html?id=${book.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    }
    
    // Video review pages
    for (const video of videos) {
      const lastmod = video.created_at ? new Date(video.created_at).toISOString().split('T')[0] : today;
      xml += `
  <url>
    <loc>${BASE_URL}/xem-review.html?id=${video.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
    }
    
    xml += `
</urlset>`;
    
    res.send(xml);
  } catch (err) {
    console.error('Sitemap generation error:', err);
    // Fallback to static sitemap file
    try {
      res.sendFile(path.join(__dirname, '..', 'public', 'sitemap.xml'));
    } catch(e) {
      res.status(500).type('text').send('Sitemap generation failed');
    }
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js')));
app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));

// ===================== COMPATIBILITY MIDDLEWARE =====================
app.use((req, res, next) => {
    const publicAliases = ['/get_books', '/get_categories', '/get_books_by_category', '/get_leaderboard_books', '/sitemap.xml'];
    if (publicAliases.includes(req.path)) req.url = '/api' + req.url;
    next();
});

// ===================== IMPORT ROUTES =====================
app.use('/api', require('./routes/books'));
app.use('/api', require('./routes/comments'));
app.use('/api', require('./routes/chapters'));
app.use('/api', require('./routes/gamification'));
app.use('/api', require('./routes/missions'));
app.use('/api', require('./routes/admin'));
app.use('/api', require('./routes/crawler'));
app.use('/api', require('./routes/video-reviews'));
app.use('/api', require('./routes/admin-videos'));

// ===================== TTS ROUTE =====================
app.get('/api/tts', (req, res) => {
    const text = (req.query.text || '').substring(0, 200).trim();
    const lang = req.query.lang || 'vi';
    if (!text) return res.status(400).json({ error: 'Thiếu text' });
    
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(lang)}&client=tw-ob&ttsspeed=1`;
    const opts = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://translate.google.com/' } };
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const fetchTTS = (u) => new Promise((resolve, reject) => {
        https.get(u, opts, (r) => r.statusCode === 200 && (r.headers['content-type']||'').includes('audio') ? resolve(r) : reject(new Error(`Status ${r.statusCode}`))).on('error', reject);
    });
    
    (async () => {
        try { (await fetchTTS(url)).pipe(res); }
        catch (e) {
            try { (await fetchTTS(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(lang)}&client=tw-ob`)).pipe(res); }
            catch (e2) { res.status(502).json({ error: 'TTS không khả dụng' }); }
        }
    })();
});

// ===================== START SERVER =====================
if (process.env.NODE_ENV !== 'production') {
    const PORT = 3000;
    app.listen(PORT, () => console.log(`🚀 Server chạy tại: http://localhost:${PORT}`));
}

module.exports = app;