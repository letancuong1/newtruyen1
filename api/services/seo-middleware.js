/**
 * ALOTRUYEN PRO - Server-Side SEO Injector v3 (CERTIFIED WORKING)
 * ================================================================
 * 
 * CÁCH HOẠT ĐỘNG:
 * - Intercept các route HTML page cụ thể
 * - Đọc file HTML từ thư mục public/
 * - Query database để lấy dữ liệu thật
 * - INJECT meta tags TRỰC TIẾP vào HTML gốc
 * - Bot Facebook/Google đọc được ngay trong source code
 * 
 * KHÔNG dùng JavaScript client-side cho SEO nữa
 */
const fs = require('fs');
const path = require('path');
const pool = require('../../db');

const SITE_URL = 'https://alotruyen.pro';
const SITE_NAME = 'AloTruyen';
const DEFAULT_IMAGE = SITE_URL + '/icon-192x192.png';

// ===================== HELPERS =====================
function excerpt(text, max) {
  if (!text) return '';
  max = max || 150;
  var s = String(text).replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s.replace(/"/g, '"');
  var c = max;
  var d = s.lastIndexOf('.', max);
  if (d > 80) c = d + 1; else { var sp = s.lastIndexOf(' ', max); if (sp > 80) c = sp; }
  return s.substring(0, c).trim().replace(/"/g, '"') + '...';
}

function clean(s) {
  if (!s) return '';
  return String(s).replace(/^[\s\[\]{}"'()]+|[\s\[\]{}"'()]+$/g, '').replace(/["']/g, '').trim();
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&').replace(/"/g, '"').replace(/'/g, '&#39;').replace(/</g, '<').replace(/>/g, '>');
}

/**
 * Tạo toàn bộ block meta tags HTML
 */
function buildMeta(meta) {
  var t = esc(meta.title || '');
  var d = esc(meta.desc || '');
  var u = esc(meta.url || SITE_URL);
  var i = esc(meta.img || DEFAULT_IMAGE);
  var iw = meta.iw || 192;
  var ih = meta.ih || 192;
  var tp = meta.type || 'website';
  return [
    '<!-- SEO:SERVER -->',
    '<title>' + t + '</title>',
    '<meta name="description" content="' + d + '">',
    '<link rel="canonical" href="' + u + '">',
    '<meta property="og:type" content="' + tp + '">',
    '<meta property="og:url" content="' + u + '">',
    '<meta property="og:title" content="' + t + '">',
    '<meta property="og:description" content="' + d + '">',
    '<meta property="og:image" content="' + i + '">',
    '<meta property="og:image:width" content="' + iw + '">',
    '<meta property="og:image:height" content="' + ih + '">',
    '<meta property="og:site_name" content="' + SITE_NAME + '">',
    '<meta property="og:locale" content="vi_VN">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + t + '">',
    '<meta name="twitter:description" content="' + d + '">',
    '<meta name="twitter:image" content="' + i + '">'
  ].join('\n');
}

/**
 * Đọc file HTML từ public/
 */
function readHtmlFile(fileName) {
  var p = path.join(__dirname, '..', '..', 'public', fileName);
  console.log('[SEO] Reading file:', p);
  return fs.readFileSync(p, 'utf-8');
}

/**
 * Reset head section: xóa hết meta cũ, giữ link/css
 */
function replaceHead(html, newMetaBlock) {
  // Find the position of </head>
  var headEnd = html.indexOf('</head>');
  if (headEnd === -1) return html;
  
  // Find the start of actual content after <head>
  var headStart = html.indexOf('<head');
  if (headStart === -1) return html;
  
  // Find the closing > of <head...>
  var headTagEnd = html.indexOf('>', headStart) + 1;
  
  // Get everything before </head> - this is the current head content
  var beforeHead = html.substring(0, headTagEnd);
  var afterHead = html.substring(headEnd);
  
  // Keep only: <head> tag, meta charset, meta viewport, favicon, preconnect, preload, tailwind, fonts, fontawesome, theme.css, tailwind config, style, script src for tailwind config, and SEO engine
  // Remove: title, meta description, link canonical, og meta, twitter meta
  var currentHead = html.substring(headTagEnd, headEnd);
  
  // Remove specific old meta tags
  currentHead = currentHead.replace(/<title>.*?<\/title>/gi, '');
  currentHead = currentHead.replace(/<meta\s+name="description"[^>]*>/gi, '');
  currentHead = currentHead.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
  currentHead = currentHead.replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '');
  currentHead = currentHead.replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '');
  currentHead = currentHead.replace(/<!-- SEO Engine -->/gi, '');
  currentHead = currentHead.replace(/<script\s+src="\/js\/seo-engine\.js"><\/script>/gi, '');
  
  // Remove old JSON-LD schemas that are static (keep them for fallback or remove for dynamic)
  // We'll keep the static ones as fallback for non-bot users
  
  // Inject new meta + seo-engine script
  var newHead = currentHead + '\n' + newMetaBlock + '\n    <script src="/js/seo-engine.js"></script>';
  
  return beforeHead + newHead + afterHead;
}

// ===================== STATIC PAGE META =====================
function getStaticMeta(pathname, fullUrl) {
  var map = {
    '/': {
      title: 'AloTruyen - Đọc Truyện Chữ Online & Xem Video Review Truyện Hay',
      desc: 'Nền tảng đọc truyện chữ online chất lượng cao và xem video review truyện Tiên Hiệp, Huyền Huyễn, Manhua, Donghua 3D hấp dẫn. Cập nhật chương mới mỗi ngày tại AloTruyen.',
      img: DEFAULT_IMAGE, iw: 192, ih: 192, type: 'website'
    },
    '/index.html': {
      title: 'AloTruyen - Đọc Truyện Chữ Online & Xem Video Review Truyện Hay',
      desc: 'Nền tảng đọc truyện chữ online chất lượng cao và xem video review truyện Tiên Hiệp, Huyền Huyễn, Manhua, Donghua 3D hấp dẫn. Cập nhật chương mới mỗi ngày tại AloTruyen.',
      img: DEFAULT_IMAGE, iw: 192, ih: 192, type: 'website'
    },
    '/video-reviews.html': {
      title: 'Video Review Truyện Hay - Review Truyện Tranh, 2D, 3D Donghua | AloTruyen',
      desc: 'Tổng hợp video review truyện hay, tóm tắt truyện Tiên Hiệp, Cẩu Đạo, Dị Thú, Manhua, Donghua 3D cuốn nhất. Xem video review truyện chuẩn full bộ tại AloTruyen.',
      img: DEFAULT_IMAGE, iw: 192, ih: 192, type: 'website'
    },
    '/danh-sach.html': {
      title: 'Danh Sách Truyện - Truyện Hot, Truyện Tu Tiên, Huyền Huyễn | AloTruyen',
      desc: 'Danh sách truyện hot, truyện tu tiên, huyền huyễn, ngôn tình mới nhất tại AloTruyen. Đọc truyện chữ online miễn phí.',
      img: DEFAULT_IMAGE, iw: 192, ih: 192, type: 'website'
    }
  };
  var m = map[pathname];
  if (!m) return null;
  return { title: m.title, desc: m.desc, url: fullUrl, img: m.img, iw: m.iw, ih: m.ih, type: m.type };
}

// ===================== DYNAMIC PAGE HANDLERS =====================

/**
 * Xử lý /chi-tiet-truyen.html?slug=xxx
 */
async function handleBookDetail(req, res, next) {
  var slug = req.query.slug || req.query.id || '';
  console.log('[SEO] Book detail slug:', slug);
  
  var fileName = 'chi-tiet-truyen.html';
  var html = readHtmlFile(fileName);
  
  var queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  var fullUrl = SITE_URL + '/chi-tiet-truyen.html' + queryStr;
  
  var meta = null;
  
  if (slug) {
    try {
      var r = await pool.query(
        'SELECT id, ten_truyen, anh_bia, gioi_thieu, tac_gia, the_loai, slug FROM books WHERE (slug = $1 OR id = $1) AND (trang_thai IS NULL OR trang_thai NOT ILIKE \'%đã xóa%\') LIMIT 1',
        [slug]
      );
      var book = r.rows[0];
      console.log('[SEO] Book found:', book ? book.ten_truyen : 'NO');
      
      if (book) {
        var name = clean(book.ten_truyen) || 'Chi Tiết Truyện';
        var desc = excerpt(book.gioi_thieu, 150);
        var cover = book.anh_bia || '';
        if (cover && !cover.startsWith('http')) {
          cover = SITE_URL + '/' + cover.replace(/^\/+/, '');
        }
        var cats = book.the_loai;
        var catsStr = Array.isArray(cats) ? cats.join(', ') : (typeof cats === 'string' ? cats : '');
        
        meta = {
          title: name + ' - Đọc Xem Online Mới Nhất | AloTruyen',
          desc: desc || ('Đọc truyện ' + name + ' online.' + (catsStr ? ' Thể loại: ' + catsStr + '.' : '')),
          url: fullUrl,
          img: cover || DEFAULT_IMAGE,
          iw: 1200, ih: 630,
          type: 'book'
        };
      }
    } catch (e) {
      console.error('[SEO] DB query error:', e.message);
    }
  }
  
  if (!meta) {
    meta = {
      title: 'Chi Tiết Truyện - Đọc Truyện Online | AloTruyen',
      desc: 'Đọc truyện online tại AloTruyen. Xem chi tiết truyện: tác giả, thể loại, số chương, đánh giá và bình luận.',
      url: fullUrl,
      img: DEFAULT_IMAGE, iw: 1200, ih: 630, type: 'book'
    };
  }
  
  var metaHtml = buildMeta(meta);
  html = replaceHead(html, metaHtml);
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

/**
 * Xử lý /xem-review.html?id=xxx hoặc ?slug=xxx
 */
async function handleVideoDetail(req, res, next) {
  var slug = req.query.slug || req.query.id || '';
  console.log('[SEO] Video detail id:', slug);
  
  var fileName = 'xem-review.html';
  var html = readHtmlFile(fileName);
  
  var queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  var fullUrl = SITE_URL + '/xem-review.html' + queryStr;
  
  var meta = null;
  
  if (slug) {
    try {
      var r = await pool.query(
        'SELECT id_video, ten_truyen_sach, anh_thumbnail, mo_ta, gioi_thieu, link_video FROM youtube_truyen WHERE id_video = $1 OR slug = $1 LIMIT 1',
        [slug]
      );
      var video = r.rows[0];
      console.log('[SEO] Video found:', video ? video.ten_truyen_sach : 'NO');
      
      if (video) {
        var name = clean(video.ten_truyen_sach) || 'Video Review';
        var desc = excerpt(video.mo_ta || video.gioi_thieu, 150);
        var thumb = video.anh_thumbnail || '';
        if (thumb && !thumb.startsWith('http')) {
          thumb = SITE_URL + '/' + thumb.replace(/^\/+/, '');
        }
        
        meta = {
          title: name + ' - Xem Online Mới Nhất | AloTruyen',
          desc: desc || ('Xem video review ' + name + ' tại AloTruyen.'),
          url: fullUrl,
          img: thumb || DEFAULT_IMAGE,
          iw: 1280, ih: 720,
          type: 'video.other'
        };
      }
    } catch (e) {
      console.error('[SEO] DB video error:', e.message);
    }
  }
  
  if (!meta) {
    meta = {
      title: 'Xem Video Review Truyện Hay | AloTruyen',
      desc: 'Xem video review truyện hay, tóm tắt truyện Tiên Hiệp, Huyền Huyễn, Manhua, Donghua 3D cuốn nhất tại AloTruyen.',
      url: fullUrl,
      img: DEFAULT_IMAGE, iw: 1280, ih: 720, type: 'video.other'
    };
  }
  
  var metaHtml = buildMeta(meta);
  html = replaceHead(html, metaHtml);
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

/**
 * Xử lý static page (index, video-reviews, danh-sach)
 */
function handleStaticPage(req, res, next, fileName, pathKey) {
  console.log('[SEO] Static page:', fileName);
  
  var html = readHtmlFile(fileName);
  var queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  var fullUrl = SITE_URL + fileName + queryStr;
  
  var meta = getStaticMeta(pathKey || fileName, fullUrl);
  if (!meta) return next();
  
  var metaHtml = buildMeta(meta);
  html = replaceHead(html, metaHtml);
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// ===================== EXPORT ROUTE HANDLERS =====================
module.exports = {
  handleBookDetail,
  handleVideoDetail,
  handleStaticPage
};