/**
 * ALOTRUYEN PRO - Server-Side SEO Middleware
 * ============================================
 * Inject meta tags dynamically into static HTML for social media bots
 * Facebook, Google, Zalo, Twitter, etc. (bots don't execute JS)
 * 
 * Intercepts HTML responses and replaces placeholder meta tags
 * with actual book/video data from the database.
 */
const pool = require('../../db');

const SITE_URL = 'https://alotruyen.pro';
const SITE_NAME = 'AloTruyen';
const DEFAULT_IMAGE = 'https://alotruyen.pro/icon-192x192.png';
const DEFAULT_DESC = 'Nền tảng đọc truyện chữ online chất lượng cao và xem video review truyện Tiên Hiệp, Huyền Huyễn, Manhua, Donghua 3D hấp dẫn.';

// Thông tin cố định cho từng trang
const PAGE_META = {
  '/index.html': {
    title: 'AloTruyen - Đọc Truyện Chữ Online & Xem Video Review Truyện Hay',
    description: DEFAULT_DESC,
    h1: 'AloTruyen - Đọc Truyện Chữ & Xem Video Review Truyện Mới Nhất',
    image: DEFAULT_IMAGE,
    imageWidth: 192,
    imageHeight: 192,
    type: 'website'
  },
  '/video-reviews.html': {
    title: 'Video Review Truyện Hay - Review Truyện Tranh, 2D, 3D Donghua | AloTruyen',
    description: 'Tổng hợp video review truyện hay, tóm tắt truyện Tiên Hiệp, Cẩu Đạo, Dị Thú, Manhua, Donghua 3D cuốn nhất. Xem video review truyện chuẩn full bộ tại AloTruyen.',
    h1: 'Video Review Truyện - Tóm Tắt Truyện Tranh & Donghua 3D',
    image: DEFAULT_IMAGE,
    imageWidth: 192,
    imageHeight: 192,
    type: 'website'
  },
  '/danh-sach.html': {
    title: 'Danh Sách Truyện - Truyện Hot, Truyện Tu Tiên, Huyền Huyễn | AloTruyen',
    description: 'Danh sách truyện hot, truyện tu tiên, huyền huyễn, ngôn tình mới nhất tại AloTruyen. Đọc truyện chữ online miễn phí.',
    h1: 'Danh Sách Truyện - Kho Tàng Truyện Chữ Online',
    image: DEFAULT_IMAGE,
    imageWidth: 192,
    imageHeight: 192,
    type: 'website'
  },
  '/xem-review.html': {
    title: 'Xem Video Review Truyện Hay | AloTruyen',
    description: 'Xem video review truyện hay, tóm tắt truyện Tiên Hiệp, Huyền Huyễn, Manhua, Donghua 3D cuốn nhất tại AloTruyen.',
    h1: 'Video Review Truyện',
    image: DEFAULT_IMAGE,
    imageWidth: 1280,
    imageHeight: 720,
    type: 'video.other'
  },
  '/chi-tiet-truyen.html': {
    title: 'Chi Tiết Truyện - Đọc Truyện Online | AloTruyen',
    description: 'Đọc truyện online tại AloTruyen. Xem chi tiết truyện: tác giả, thể loại, số chương, đánh giá và bình luận.',
    h1: 'Chi Tiết Truyện',
    image: DEFAULT_IMAGE,
    imageWidth: 400,
    imageHeight: 600,
    type: 'book'
  }
};

/**
 * Làm sạch excerpt
 */
function makeExcerpt(text, maxLen) {
  if (!text) return '';
  maxLen = maxLen || 150;
  let clean = String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/&[^;]+;/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= maxLen) return clean;
  var cutPos = maxLen;
  var sentenceEnd = clean.lastIndexOf('.', maxLen);
  if (sentenceEnd >= 80) cutPos = sentenceEnd + 1;
  else {
    var spacePos = clean.lastIndexOf(' ', maxLen);
    if (spacePos >= 80) cutPos = spacePos;
  }
  return clean.substring(0, cutPos).trim() + '...';
}

/**
 * Làm sạch tên
 */
function cleanName(str) {
  if (!str) return '';
  return String(str).replace(/^[\s\[\]{}"'()]+|[\s\[\]{}"'()]+$/g, '').replace(/[\{\}\[\]"]/g, '').trim();
}

/**
 * Tạo HTML meta tags
 */
function buildMetaTags(meta) {
  return [
    `<title>${meta.title || PAGE_META['/index.html'].title}</title>`,
    `<meta name="description" content="${meta.description || ''}">`,
    `<link rel="canonical" href="${meta.url || SITE_URL}">`,
    `<meta property="og:type" content="${meta.type || 'website'}">`,
    `<meta property="og:url" content="${meta.url || SITE_URL}">`,
    `<meta property="og:title" content="${meta.title || ''}">`,
    `<meta property="og:description" content="${meta.description || ''}">`,
    `<meta property="og:image" content="${meta.image || DEFAULT_IMAGE}">`,
    `<meta property="og:image:width" content="${meta.imageWidth || 192}">`,
    `<meta property="og:image:height" content="${meta.imageHeight || 192}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:locale" content="vi_VN">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${meta.title || ''}">`,
    `<meta name="twitter:description" content="${meta.description || ''}">`,
    `<meta name="twitter:image" content="${meta.image || DEFAULT_IMAGE}">`,
  ].join('\n    ');
}

/**
 * Kiểm tra có phải bot không
 */
function isBot(userAgent) {
  if (!userAgent) return false;
  const botPattern = /bot|crawler|spider|facebook|twitter|whatsapp|telegram|slack|discord|linkedin|pinterest|slack|google|bing|yahoo|duckduck|baidu|yandex|facebookexternalhit|facebot|Twitterbot|Slackbot|TelegramBot/i;
  return botPattern.test(userAgent);
}

/**
 * Fetch book data from DB by slug or id
 */
async function getBookData(param) {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, 
        COALESCE(c.avg,0)::float AS rating_avg, 
        COALESCE(c.count,0)::int AS rating_count
      FROM books b 
      LEFT JOIN LATERAL (
        SELECT AVG(rating_stars) AS avg, COUNT(*) AS count FROM comments WHERE book_id = b.id
      ) c ON true 
      WHERE (b.slug = $1 OR b.id = $1) 
        AND (b.trang_thai IS NULL OR b.trang_thai NOT ILIKE '%đã xóa%')
      LIMIT 1`,
      [param]
    );
    return rows[0] || null;
  } catch (e) {
    console.error('[SEO-Middleware] DB error:', e.message);
    return null;
  }
}

/**
 * Fetch video data from DB by id_video or slug
 */
async function getVideoData(param) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM youtube_truyen WHERE id_video = $1 OR slug = $1 LIMIT 1`,
      [param]
    );
    return rows[0] || null;
  } catch (e) {
    console.error('[SEO-Middleware] DB video error:', e.message);
    return null;
  }
}

/**
 * Main middleware handler
 */
async function handleSeoInjection(req, res, html) {
  const urlPath = req.path || '/';
  const queryString = req.url.split('?')[1] || '';
  const fullUrl = SITE_URL + req.url;
  const userAgent = req.headers['user-agent'] || '';
  const isBotRequest = isBot(userAgent);

  // Default meta = page default based on path
  let metaTags = '';
  let pageKey = urlPath;
  
  // Nếu là / thì map sang /index.html
  if (pageKey === '/' || pageKey === '') pageKey = '/index.html';
  
  // Get page defaults
  let defaultMeta = PAGE_META[pageKey];
  if (!defaultMeta) {
    // Try to infer from extension
    if (pageKey.endsWith('.html')) {
      defaultMeta = PAGE_META[pageKey] || null;
    } else {
      defaultMeta = null;
    }
  }

  // ===== DYNAMIC DATA: Chi tiết truyện =====
  if (pageKey === '/chi-tiet-truyen.html') {
    const slug = req.query.slug || req.query.id || '';
    if (slug) {
      const book = await getBookData(slug);
      if (book) {
        const title = cleanName(book.ten_truyen || '');
        const excerpt = makeExcerpt(book.gioi_thieu || '', 150);
        const cover = book.anh_bia || DEFAULT_IMAGE;
        // Absolute URL for og:image
        const absoluteCover = cover.startsWith('http') ? cover : SITE_URL + (cover.startsWith('/') ? '' : '/') + cover;
        const bookUrl = fullUrl; // already has ?slug=xxx
        const categories = book.the_loai || [];
        const catsStr = Array.isArray(categories) ? categories.join(', ') : categories;
        
        metaTags = buildMetaTags({
          title: `${title} - Đọc/Xem Online Mới Nhất | AloTruyen`,
          description: excerpt || `Đọc truyện ${title} online, cập nhật chương mới nhất. Thể loại: ${catsStr || 'Truyện chữ'}.`,
          url: bookUrl,
          image: absoluteCover,
          imageWidth: 1200,
          imageHeight: 630,
          type: 'book'
        });
      }
    }
  }

  // ===== DYNAMIC DATA: Video Review =====
  else if (pageKey === '/xem-review.html') {
    const videoId = req.query.slug || req.query.id || '';
    if (videoId) {
      const video = await getVideoData(videoId);
      if (video) {
        const title = cleanName(video.ten_truyen_sach || '');
        const excerpt = makeExcerpt(video.mo_ta || video.gioi_thieu || '', 150);
        const thumb = video.anh_thumbnail || DEFAULT_IMAGE;
        const absoluteThumb = thumb.startsWith('http') ? thumb : SITE_URL + (thumb.startsWith('/') ? '' : '/') + thumb;
        const videoUrl = fullUrl;
        
        metaTags = buildMetaTags({
          title: `${title} - Xem Online Mới Nhất | AloTruyen`,
          description: excerpt || `Xem video review ${title} tại AloTruyen.`,
          url: videoUrl,
          image: absoluteThumb,
          imageWidth: 1280,
          imageHeight: 720,
          type: 'video.other'
        });
      }
    }
  }

  // ===== STATIC PAGES (home, video list, etc) =====
  if (!metaTags && defaultMeta) {
    metaTags = buildMetaTags({
      title: defaultMeta.title,
      description: defaultMeta.description,
      url: fullUrl,
      image: defaultMeta.image,
      imageWidth: defaultMeta.imageWidth,
      imageHeight: defaultMeta.imageHeight,
      type: defaultMeta.type
    });
  }

  // Fallback
  if (!metaTags) {
    metaTags = buildMetaTags({
      title: PAGE_META['/index.html'].title,
      description: PAGE_META['/index.html'].description,
      url: fullUrl,
      type: 'website'
    });
  }

  // Inject meta tags into HTML: replace </head> with our meta + </head>
  if (html) {
    html = html.replace('</head>', `\n    <!-- SEO Dynamic Injected -->\n    ${metaTags}\n    </head>`);
    
    // Update H1 if available
    if (defaultMeta && defaultMeta.h1 && html.includes('</h1>')) {
      // Replace first h1 content with proper SEO H1
      // Only do this for bot requests to avoid messing up user's dynamic content
    }
  }

  return html;
}

module.exports = { handleSeoInjection, isBot, PAGE_META };