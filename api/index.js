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

// ===================== DYNAMIC SITEMAP SYSTEM (SEO-Optimized) =====================
// Sitemap Index + 4 sub-sitemaps: pages, categories, books, videos
// NO chapter sitemap (Google Bot crawls chapters from internal links in book detail)
const sitemapGenerator = require('./services/sitemap-generator');

// Cache sitemap results in-memory for 2 hours to reduce DB load
let sitemapCache = {};
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

function getCached(key, generatorFn) {
  const now = Date.now();
  if (sitemapCache[key] && (now - sitemapCache[key].timestamp < CACHE_TTL)) {
    return Promise.resolve(sitemapCache[key].data);
  }
  return generatorFn().then(data => {
    sitemapCache[key] = { data, timestamp: now };
    return data;
  });
}

// 1. SITEMAP INDEX - `/sitemap.xml`
app.get(['/sitemap.xml', '/api/sitemap.xml'], async (req, res) => {
  try {
    const xml = await getCached('index', () => sitemapGenerator.generateSitemapIndex());
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.send(xml);
  } catch (err) {
    console.error('[SITEMAP INDEX ERROR]', err.message);
    res.status(500).type('text').send('Sitemap generation failed');
  }
});

// 2. SITEMAP PAGES - `/sitemap-pages.xml`
app.get(['/sitemap-pages.xml', '/api/sitemap-pages.xml'], async (req, res) => {
  try {
    const xml = await getCached('pages', () => sitemapGenerator.generateSitemapPages());
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.send(xml);
  } catch (err) {
    console.error('[SITEMAP PAGES ERROR]', err.message);
    res.status(500).type('text').send('Sitemap pages generation failed');
  }
});

// 3. SITEMAP CATEGORIES - `/sitemap-categories.xml`
app.get(['/sitemap-categories.xml', '/api/sitemap-categories.xml'], async (req, res) => {
  try {
    const xml = await getCached('categories', () => sitemapGenerator.generateSitemapCategories());
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.send(xml);
  } catch (err) {
    console.error('[SITEMAP CATEGORIES ERROR]', err.message);
    res.status(500).type('text').send('Sitemap categories generation failed');
  }
});

// 4. SITEMAP BOOKS - `/sitemap-books.xml`
app.get(['/sitemap-books.xml', '/api/sitemap-books.xml'], async (req, res) => {
  try {
    const xml = await getCached('books', () => sitemapGenerator.generateSitemapBooks());
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.send(xml);
  } catch (err) {
    console.error('[SITEMAP BOOKS ERROR]', err.message);
    res.status(500).type('text').send('Sitemap books generation failed');
  }
});

// 5. SITEMAP VIDEOS - `/sitemap-videos.xml`
app.get(['/sitemap-videos.xml', '/api/sitemap-videos.xml'], async (req, res) => {
  try {
    const xml = await getCached('videos', () => sitemapGenerator.generateSitemapVideos());
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.send(xml);
  } catch (err) {
    console.error('[SITEMAP VIDEOS ERROR]', err.message);
    res.status(500).type('text').send('Sitemap videos generation failed');
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js')));
app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css')));

// ===================== COMPATIBILITY MIDDLEWARE =====================
app.use((req, res, next) => {
    const publicAliases = ['/get_books', '/get_categories', '/get_books_by_category', '/get_leaderboard_books'];
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