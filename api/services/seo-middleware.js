/**
 * ALOTRUYEN PRO - Server-Side SEO Middleware v2
 * ===============================================
 * 
 * VẤN ĐỀ: Facebook/Google bot KHÔNG chạy JavaScript, chỉ đọc HTML tĩnh.
 * express.static gửi file gốc trực tiếp, middleware cũ KHÔNG hoạt động.
 * 
 * GIẢI PHÁP:
 * 1. Chặn request HTML page TRƯỚC khi đến express.static
 * 2. Đọc file HTML gốc từ disk
 * 3. Inject meta tags động (tên truyện, mô tả, ảnh bìa) vào <head>
 * 4. Gửi HTML đã modified về bot
 */
const fs = require('fs');
const path = require('path');
const pool = require('../../db');

const SITE_URL = 'https://alotruyen.pro';
const SITE_NAME = 'AloTruyen';
const DEFAULT_IMAGE = 'https://alotruyen.pro/icon-192x192.png';

// ===================== PAGE DEFAULT META =====================
const PAGE_META = {
  '/': {
    title: 'AloTruyen - Đọc Truyện Chữ Online & Xem Video Review Truyện Hay',
    description: 'Nền tảng đọc truyện chữ online chất lượng cao và xem video review truyện Tiên Hiệp, Huyền Huyễn, Manhua, Donghua 3D hấp dẫn. Cập nhật chương mới mỗi ngày tại AloTruyen.',
    image: DEFAULT_IMAGE, iw: 192, ih: 192, type: 'website'
  },
  '/index.html': {
    title: 'AloTruyen - Đọc Truyện Chữ Online & Xem Video Review Truyện Hay',
    description: 'Nền tảng đọc truyện chữ online chất lượng cao và xem video review truyện Tiên Hiệp, Huyền Huyễn, Manhua, Donghua 3D hấp dẫn. Cập nhật chương mới mỗi ngày tại AloTruyen.',
    image: DEFAULT_IMAGE, iw: 192, ih: 192, type: 'website'
  },
  '/video-reviews.html': {
    title: 'Video Review Truyện Hay - Review Truyện Tranh, 2D, 3D Donghua | AloTruyen',
    description: 'Tổng hợp video review truyện hay, tóm tắt truyện Tiên Hiệp, Cẩu Đạo, Dị Thú, Manhua, Donghua 3D cuốn nhất. Xem video review truyện chuẩn full bộ tại AloTruyen.',
    image: DEFAULT_IMAGE, iw: 192, ih: 192, type: 'website'
  },
  '/danh-sach.html': {
    title: 'Danh Sách Truyện - Truyện Hot, Truyện Tu Tiên, Huyền Huyễn | AloTruyen',
    description: 'Danh sách truyện hot, truyện tu tiên, huyền huyễn, ngôn tình mới nhất tại AloTruyen. Đọc truyện chữ online miễn phí.',
    image: DEFAULT_IMAGE, iw: 192, ih: 192, type: 'website'
  },
  '/chi-tiet-truyen.html': {
    title_default: 'Chi Tiết Truyện - Đọc Truyện Online | AloTruyen',
    desc_default: 'Đọc truyện online tại AloTruyen. Xem chi tiết truyện: tác giả, thể loại, số chương, đánh giá và bình luận.',
    image: DEFAULT_IMAGE, iw: 1200, ih: 630, type: 'book'
  },
  '/xem-review.html': {
    title_default: 'Xem Video Review Truyện Hay | AloTruyen',
    desc_default: 'Xem video review truyện hay, tóm tắt truyện Tiên Hiệp, Huyền Huyễn, Manhua, Donghua 3D cuốn nhất tại AloTruyen.',
    image: DEFAULT_IMAGE, iw: 1280, ih: 720, type: 'video.other'
  }
};

// ===================== UTILITY =====================
function cleanExcerpt(text, maxLen) {
  if (!text) return '';
  maxLen = maxLen || 150;
  var clean = String(text)
    .replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ')
    .replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean.replace(/"/g, '"').replace(/'/g, '&#39;');
  var cut = maxLen;
  var dot = clean.lastIndexOf('.', maxLen);
  if (dot >= 80) cut = dot + 1; else { var sp = clean.lastIndexOf(' ', maxLen); if (sp >= 80) cut = sp; }
  return clean.substring(0, cut).trim().replace(/"/g, '"').replace(/'/g, '&#39;') + '...';
}

function cleanName(str) {
  if (!str) return '';
  return String(str).replace(/^[\s\[\]{}"'()]+|[\s\[\]{}"'()]+$/g, '').replace(/["']/g, '').trim();
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&').replace(/"/g, '"').replace(/'/g, '&#39;').replace(/</g, '<').replace(/>/g, '>');
}

// ===================== BUILD META HTML =====================
function buildMetaHtml(meta) {
  if (!meta) return '';
  var title = escapeAttr(meta.title || '');
  var desc = escapeAttr(meta.description || '');
  var url = escapeAttr(meta.url || SITE_URL);
  var img = escapeAttr(meta.image || DEFAULT_IMAGE);
  var iw = meta.imageWidth || 192;
  var ih = meta.imageHeight || 192;
  var type = meta.type || 'website';
  
  return [
    '<!-- SEO SERVER-SIDE INJECTED -->',
    '<title>' + title + '</title>',
    '<meta name="description" content="' + desc + '">',
    '<link rel="canonical" href="' + url + '">',
    '<meta property="og:type" content="' + type + '">',
    '<meta property="og:url" content="' + url + '">',
    '<meta property="og:title" content="' + title + '">',
    '<meta property="og:description" content="' + desc + '">',
    '<meta property="og:image" content="' + img + '">',
    '<meta property="og:image:width" content="' + iw + '">',
    '<meta property="og:image:height" content="' + ih + '">',
    '<meta property="og:site_name" content="' + SITE_NAME + '">',
    '<meta property="og:locale" content="vi_VN">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + title + '">',
    '<meta name="twitter:description" content="' + desc + '">',
    '<meta name="twitter:image" content="' + img + '">'
  ].join('\n');
}

// ===================== DATABASE QUERIES =====================
async function getBookBySlug(slug) {
  try {
    var r = await pool.query('SELECT id, ten_truyen, anh_bia, gioi_thieu, tac_gia, the_loai, slug FROM books WHERE (slug = $1 OR id = $1) AND (trang_thai IS NULL OR trang_thai NOT ILIKE \'%đã xóa%\') LIMIT 1', [slug]);
    return r.rows[0] || null;
  } catch (e) { console.error('[SEO-DB] Book error:', e.message); return null; }
}

async function getVideoById(id) {
  try {
    var r = await pool.query('SELECT id_video, ten_truyen_sach, anh_thumbnail, mo_ta, gioi_thieu, link_video FROM youtube_truyen WHERE id_video = $1 OR slug = $1 LIMIT 1', [id]);
    return r.rows[0] || null;
  } catch (e) { console.error('[SEO-DB] Video error:', e.message); return null; }
}

// ===================== BOT DETECTION =====================
function isBot(ua) {
  if (!ua) return false;
  return /bot|crawler|spider|facebook|twitter|whatsapp|telegram|slack|discord|linkedin|pinterest|google|bing|yahoo|baidu|yandex|facebookexternalhit|facebot|Twitterbot|Slackbot|TelegramBot|curl|wget|python-requests|url|scrape|scraper/i.test(ua);
}

// ===================== MAIN HANDLER =====================
async function seoMiddleware(req, res, next) {
  var pathname = req.path;
  var ua = req.headers['user-agent'] || '';
  
  // Chỉ xử lý cho HTML pages
  var htmlPages = ['/', '/index.html', '/chi-tiet-truyen.html', '/xem-review.html', '/video-reviews.html', '/danh-sach.html'];
  if (!htmlPages.includes(pathname)) {
    return next();
  }
  
  // Luôn inject SEO cho MỌI request (không chỉ bot)
  // vì cần đảm bảo canonical URL luôn đúng
  try {
    // Map path to file
    var filePath = pathname === '/' ? '/index.html' : pathname;
    var fullPath = path.join(__dirname, '..', '..', 'public', filePath);
    
    // Read HTML file
    var html = fs.readFileSync(fullPath, 'utf-8');
    
    // Build full URL with query string
    var queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    var fullUrl = SITE_URL + filePath + queryStr;
    
    // Get dynamic data for specific pages
    var meta = null;
    var slug = req.query.slug || req.query.id || '';
    
    if (pathname === '/chi-tiet-truyen.html' && slug) {
      var book = await getBookBySlug(slug);
      if (book) {
        var name = cleanName(book.ten_truyen) || 'Chi Tiết Truyện';
        var excerpt = cleanExcerpt(book.gioi_thieu, 150);
        var cover = (book.anh_bia || '').startsWith('http') ? book.anh_bia : SITE_URL + '/' + (book.anh_bia || '').replace(/^\/+/, '');
        var cats = book.the_loai;
        var catsStr = Array.isArray(cats) ? cats.join(', ') : (typeof cats === 'string' ? cats : '');
        
        meta = {
          title: name + ' - Đọc/Xem Online Mới Nhất | AloTruyen',
          description: excerpt || ('Đọc truyện ' + name + ' online, cập nhật chương mới nhất.' + (catsStr ? ' Thể loại: ' + catsStr + '.' : '')),
          url: fullUrl,
          image: cover || DEFAULT_IMAGE,
          imageWidth: 1200,
          imageHeight: 630,
          type: 'book'
        };
      }
    } else if (pathname === '/xem-review.html' && slug) {
      var video = await getVideoById(slug);
      if (video) {
        var vname = cleanName(video.ten_truyen_sach) || 'Video Review';
        var vdesc = cleanExcerpt(video.mo_ta || video.gioi_thieu, 150);
        var vthumb = (video.anh_thumbnail || '').startsWith('http') ? video.anh_thumbnail : SITE_URL + '/' + (video.anh_thumbnail || '').replace(/^\/+/, '');
        
        meta = {
          title: vname + ' - Xem Online Mới Nhất | AloTruyen',
          description: vdesc || ('Xem video review ' + vname + ' tại AloTruyen.'),
          url: fullUrl,
          image: vthumb || DEFAULT_IMAGE,
          imageWidth: 1280,
          imageHeight: 720,
          type: 'video.other'
        };
      }
    }
    
    // If no dynamic data, use page defaults
    if (!meta) {
      var pageDef = PAGE_META[pathname === '/' ? '/' : filePath];
      if (pageDef) {
        meta = {
          title: pageDef.title || pageDef.title_default || SITE_NAME,
          description: pageDef.description || pageDef.desc_default || '',
          url: fullUrl,
          image: pageDef.image || DEFAULT_IMAGE,
          imageWidth: pageDef.iw || 192,
          imageHeight: pageDef.ih || 192,
          type: pageDef.type || 'website'
        };
      }
    }
    
    // Final fallback
    if (!meta) {
      meta = {
        title: SITE_NAME + ' - Đọc Truyện Chữ Online',
        description: 'Đọc truyện chữ online miễn phí tại ' + SITE_NAME,
        url: fullUrl,
        image: DEFAULT_IMAGE,
        imageWidth: 192,
        imageHeight: 192,
        type: 'website'
      };
    }
    
    // === INJECT INTO HTML ===
    var metaHtml = buildMetaHtml(meta);
    
    // Remove existing <title>, <meta name="description">, <link canonical>, og/twitter meta tags
    // Then inject new ones right before </head>
    html = html.replace(/<title>.*?<\/title>/i, '');
    html = html.replace(/<meta\s+name="description"[^>]*>/gi, '');
    html = html.replace(/<link\s+rel="canonical"[^>]*>/gi, '');
    html = html.replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '');
    html = html.replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, '');
    html = html.replace('</head>', '\n' + metaHtml + '\n</head>');
    
    // Update og:image in the existing meta (in case user already has some)
    // Also update the SEO Engine script reference order
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60'); // Short cache for dynamic content
    return res.send(html);
    
  } catch (err) {
    console.error('[SEO-Middleware] Error:', err.message);
    next(); // Fallback to normal static file serving
  }
}

module.exports = seoMiddleware;