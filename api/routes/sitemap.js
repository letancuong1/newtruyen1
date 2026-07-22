/**
 * Dynamic Sitemap Generator
 * Generates sitemap.xml with all pages, categories, and novel detail pages
 */
const express = require('express');
const router = express.Router();
const pool = require('../../db');

const BASE_URL = 'https://alotruyen.pro';

router.get('/sitemap.xml', async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

    // Get all books from database
    const booksResult = await pool.query(
      'SELECT id, slug, updated_at FROM books WHERE trang_thai IS NULL OR (trang_thai != \'đã xóa\' AND trang_thai != \'deleted\') ORDER BY id'
    );
    const books = booksResult.rows;

    // Get all categories
    const categoriesResult = await pool.query('SELECT name FROM categories ORDER BY name');
    const categories = categoriesResult.rows;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    // Static pages
    const staticPages = [
      { loc: '/', priority: '1.0', changefreq: 'daily' },
      { loc: '/index.html', priority: '1.0', changefreq: 'daily' },
      { loc: '/bxh.html', priority: '0.9', changefreq: 'daily' },
      { loc: '/theloai.html', priority: '0.8', changefreq: 'weekly' },
      { loc: '/danh-sach.html', priority: '0.8', changefreq: 'daily' },
      { loc: '/video-reviews.html', priority: '0.7', changefreq: 'weekly' },
      { loc: '/doc-truyen.html', priority: '0.7', changefreq: 'daily' },
      { loc: '/chi-tiet-truyen.html', priority: '0.6', changefreq: 'daily' },
      { loc: '/xem-review.html', priority: '0.6', changefreq: 'weekly' },
      { loc: '/profile.html', priority: '0.5', changefreq: 'monthly' },
      { loc: '/login.html', priority: '0.3', changefreq: 'monthly' },
      { loc: '/register.html', priority: '0.3', changefreq: 'monthly' },
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
    for (const cat of categories) {
      const slug = cat.name.toLowerCase().replace(/[^a-z0-9àáạãảâầấậẫẩăằắặẵẳđèéẹẽẻêềếệễểìíịĩỉòóọõỏôồốộỗổơờớợỡởùúụũủưừứựữửỳýỵỹỷ]/g, '').replace(/\s+/g, '-');
      xml += `
  <url>
    <loc>${BASE_URL}/theloai.html?genre=${encodeURIComponent(cat.name)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }

    // Novel detail pages
    for (const book of books) {
      const lastmod = book.updated_at ? new Date(book.updated_at).toISOString().split('T')[0] : '';
      xml += `
  <url>
    <loc>${BASE_URL}/chi-tiet-truyen.html?id=${book.id}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    }

    xml += `
</urlset>`;

    res.send(xml);
  } catch (err) {
    console.error('Sitemap generation error:', err);
    // Fallback to static sitemap
    res.sendFile('sitemap.xml', { root: './public' });
  }
});

module.exports = router;