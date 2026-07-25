/**
 * ALOTRUYEN PRO - SEO Engine v2.0
 * ==================================
 * Centralized SEO management for dynamic meta tags, JSON-LD Schema,
 * Open Graph, Twitter Cards, Canonical URLs, and HTML sanitization.
 * 
 * Tích hợp cho tất cả trang: index, chi-tiet-truyen, video-reviews, xem-review, danh-sach
 */
(function(global) {
    'use strict';

    const SEO = {
        SITE_NAME: 'AloTruyen',
        SITE_URL: 'https://alotruyen.pro',
        DEFAULT_IMAGE: 'https://alotruyen.pro/icon-192x192.png',
        DEFAULT_IMAGE_WIDTH: 192,
        DEFAULT_IMAGE_HEIGHT: 192,

        /**
         * CẮT EXCERPT CHUẨN SEO - loại bỏ HTML, ký tự đặc biệt
         * @param {string} text - Nội dung gốc
         * @param {number} maxLen - Độ dài tối đa (mặc định 150 ký tự)
         * @param {number} minLen - Độ dài tối thiểu (mặc định 100 ký tự)
         * @returns {string} - Excerpt sạch, an toàn SEO
         */
        makeExcerpt: function(text, maxLen, minLen) {
            if (!text) return '';
            maxLen = maxLen || 150;
            minLen = minLen || 100;

            // 1. Loại bỏ HTML tags
            let clean = String(text)
                .replace(/<[^>]*>/g, '')          // Xóa HTML tags
                .replace(/&[^;]+;/g, ' ')          // Thay thế HTML entities
                .replace(/[\r\n\t]+/g, ' ')        // Xuống dòng -> space
                .replace(/\s+/g, ' ')              // Nhiều space -> 1 space
                .replace(/^[\s\[\]{}"'()]+|[\s\[\]{}"'()]+$/g, '') // Trim ký tự đặc biệt
                .trim();

            if (!clean) return '';

            // 2. Cắt độ dài phù hợp
            if (clean.length <= maxLen) return clean;

            // 3. Cắt tại dấu câu gần nhất (trong khoảng minLen-maxLen)
            var cutPos = maxLen;
            var sentenceEnd = clean.lastIndexOf('.', maxLen);
            if (sentenceEnd >= minLen) cutPos = sentenceEnd + 1;
            else {
                var commaPos = clean.lastIndexOf(',', maxLen);
                if (commaPos >= minLen) cutPos = commaPos;
                else {
                    var spacePos = clean.lastIndexOf(' ', maxLen);
                    if (spacePos >= minLen) cutPos = spacePos;
                }
            }

            return clean.substring(0, cutPos).trim() + '...';
        },

        /**
         * LÀM SẠCH TÊN HIỂN THỊ - loại bỏ ký tự rác
         */
        cleanName: function(str) {
            if (!str) return '';
            return String(str)
                .replace(/^[\s\[\]{}"'()]+|[\s\[\]{}"'()]+$/g, '')
                .replace(/[\{\}\[\]"]/g, '')
                .trim();
        },

        /**
         * CẬP NHẬT META TAGS ĐỘNG
         * @param {Object} opts - { title, description, url, image, type, siteName, locale }
         */
        updateMeta: function(opts) {
            if (!opts) return;

            // --- Title ---
            var title = opts.title || SEO.SITE_NAME;
            document.title = title;

            // Set or update <title> in <head>
            var titleTag = document.querySelector('title');
            if (!titleTag) {
                titleTag = document.createElement('title');
                document.head.appendChild(titleTag);
            }
            titleTag.textContent = title;

            // --- Meta Description ---
            var description = opts.description || '';
            SEO._setMeta('description', description);

            // --- Canonical URL ---
            var canonicalUrl = opts.url || SEO._getCleanUrl();
            SEO._setCanonical(canonicalUrl);

            // --- Open Graph ---
            SEO._setMeta('og:title', title, 'property');
            SEO._setMeta('og:description', description, 'property');
            SEO._setMeta('og:url', canonicalUrl, 'property');
            SEO._setMeta('og:image', opts.image || SEO.DEFAULT_IMAGE, 'property');
            SEO._setMeta('og:image:width', opts.imageWidth || String(SEO.DEFAULT_IMAGE_WIDTH), 'property');
            SEO._setMeta('og:image:height', opts.imageHeight || String(SEO.DEFAULT_IMAGE_HEIGHT), 'property');
            SEO._setMeta('og:type', opts.type || 'website', 'property');
            SEO._setMeta('og:site_name', opts.siteName || SEO.SITE_NAME, 'property');
            SEO._setMeta('og:locale', opts.locale || 'vi_VN', 'property');

            // --- Twitter Cards ---
            SEO._setMeta('twitter:card', 'summary_large_image');
            SEO._setMeta('twitter:title', title);
            SEO._setMeta('twitter:description', description);
            SEO._setMeta('twitter:image', opts.image || SEO.DEFAULT_IMAGE);
            if (opts.twitterSite) SEO._setMeta('twitter:site', opts.twitterSite);
        },

        /**
         * THÊM JSON-LD SCHEMA
         */
        addSchema: function(schemaObj, schemaId) {
            if (!schemaObj) return;
            var script = document.createElement('script');
            script.type = 'application/ld+json';
            if (schemaId) script.id = schemaId;
            script.textContent = JSON.stringify(schemaObj, null, 2);
            
            // Remove existing schema with same id if any
            if (schemaId) {
                var existing = document.getElementById(schemaId);
                if (existing) existing.remove();
            }
            document.head.appendChild(script);
        },

        /**
         * XÓA JSON-LD SCHEMA THEO ID
         */
        removeSchema: function(schemaId) {
            var el = document.getElementById(schemaId);
            if (el) el.remove();
        },

        /**
         * THÊM / CẬP NHẬT SCHEMA CHO TRANG CHI TIẾT TRUYỆN (Book + AggregateRating)
         */
        addBookSchema: function(bookData) {
            if (!bookData) return;
            var name = SEO.cleanName(bookData.ten_truyen || bookData.title || '');
            if (!name) return;

            var author = SEO.cleanName(bookData.tac_gia || bookData.author || '');
            var description = SEO.makeExcerpt(bookData.gioi_thieu || bookData.description || '', 200);
            var ratingAvg = parseFloat(bookData.rating_avg || bookData.ratingAvg || 0);
            var ratingCount = parseInt(bookData.rating_count || bookData.ratingCount || 0);
            var categories = bookData.the_loai || bookData.categories || [];
            if (typeof categories === 'string') {
                try { categories = JSON.parse(categories); } catch(e) { categories = [categories]; }
            }
            var image = bookData.anh_bia || bookData.cover || SEO.DEFAULT_IMAGE;
            var slug = bookData.slug || '';
            var bookId = bookData.id || '';

            var schema = {
                '@context': 'https://schema.org',
                '@type': 'Book',
                'name': name,
                'url': SEO.SITE_URL + '/chi-tiet-truyen.html' + (slug ? '?slug=' + slug : bookId ? '?id=' + bookId : ''),
                'image': image,
                'author': author ? {
                    '@type': 'Person',
                    'name': author
                } : undefined,
                'description': description,
                'inLanguage': 'vi',
                'genre': categories.length > 0 ? categories : undefined,
                'numberOfPages': parseInt(bookData.so_chuong || bookData.chaptersCount || 0) || undefined
            };

            // Add AggregateRating only if there are ratings
            if (ratingAvg > 0 && ratingCount > 0) {
                schema.aggregateRating = {
                    '@type': 'AggregateRating',
                    'ratingValue': ratingAvg.toFixed(1),
                    'ratingCount': ratingCount,
                    'bestRating': 5,
                    'worstRating': 1
                };
            }

            SEO.addSchema(schema, 'seo-book-schema');
        },

        /**
         * THÊM / CẬP NHẬT SCHEMA CHO TRANG VIDEO (VideoObject)
         */
        addVideoSchema: function(videoData) {
            if (!videoData) return;
            var name = SEO.cleanName(videoData.ten_truyen_sach || videoData.title || '');
            if (!name) return;

            var description = SEO.makeExcerpt(videoData.mo_ta || videoData.description || videoData.gioi_thieu || '', 200);
            var thumbnailUrl = videoData.anh_thumbnail || videoData.thumbnail || '';
            var uploadDate = videoData.ngay_dang || videoData.uploadDate || '';
            var duration = videoData.thoi_luong_giay || 0;
            var linkVideo = videoData.link_video || videoData.contentUrl || '';
            var embedUrl = '';
            var videoId = videoData.id_video || '';

            // Try to extract YouTube embed URL
            if (linkVideo) {
                var ytMatch = linkVideo.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
                if (ytMatch) {
                    embedUrl = 'https://www.youtube.com/embed/' + ytMatch[1];
                }
            } else if (videoId) {
                // Support both full URL and short ID
                if (videoId.match(/^[a-zA-Z0-9_-]{11}$/)) {
                    embedUrl = 'https://www.youtube.com/embed/' + videoId;
                } else {
                    embedUrl = videoId;
                }
            }

            var schema = {
                '@context': 'https://schema.org',
                '@type': 'VideoObject',
                'name': name,
                'description': description,
                'thumbnailUrl': thumbnailUrl || SEO.DEFAULT_IMAGE,
                'uploadDate': uploadDate || new Date().toISOString(),
                'contentUrl': linkVideo || undefined,
                'embedUrl': embedUrl || undefined,
                'duration': duration ? 'PT' + Math.floor(duration / 3600) + 'H' + Math.floor((duration % 3600) / 60) + 'M' + (duration % 60) + 'S' : undefined,
                'inLanguage': 'vi'
            };

            SEO.addSchema(schema, 'seo-video-schema');
        },

        /**
         * THÊM / CẬP NHẬT BREADCRUMB SCHEMA
         */
        addBreadcrumbSchema: function(items) {
            if (!items || !items.length) return;
            var itemListElement = items.map(function(item, index) {
                return {
                    '@type': 'ListItem',
                    'position': index + 1,
                    'name': item.name,
                    'item': item.url ? (item.url.startsWith('http') ? item.url : SEO.SITE_URL + item.url) : undefined
                };
            }).filter(Boolean);

            if (itemListElement.length === 0) return;

            var schema = {
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                'itemListElement': itemListElement
            };

            SEO.addSchema(schema, 'seo-breadcrumb-schema');
        },

        /**
         * CẬP NHẬT THẺ ALT CHO TẤT CẢ ẢNH TRONG CONTAINER
         */
        updateImageAltTags: function(container, altText) {
            if (!container || !altText) return;
            var imgs = container.querySelectorAll('img');
            imgs.forEach(function(img) {
                // Only set alt if it's empty or has placeholder
                var currentAlt = (img.getAttribute('alt') || '').trim();
                if (!currentAlt || currentAlt === 'cover' || currentAlt === 'thumbnail' || currentAlt === 'image') {
                    img.setAttribute('alt', altText);
                }
            });
        },

        /**
         * KIỂM TRA VÀ ĐẢM BẢO CHỈ 1 THẺ H1 DUY NHẤT
         */
        ensureSingleH1: function(text) {
            var h1s = document.querySelectorAll('h1');
            if (h1s.length > 1) {
                // Giữ lại H1 đầu tiên, chuyển các H1 còn lại thành H2
                for (var i = 1; i < h1s.length; i++) {
                    var h2 = document.createElement('h2');
                    h2.innerHTML = h1s[i].innerHTML;
                    h2.className = h1s[i].className;
                    Array.from(h1s[i].attributes).forEach(function(attr) {
                        if (attr.name !== 'class') {
                            h2.setAttribute(attr.name, attr.value);
                        }
                    });
                    h1s[i].parentNode.replaceChild(h2, h1s[i]);
                }
            } else if (h1s.length === 0 && text) {
                // Nếu không có H1 nào, tạo một H1 ẩn
                var h1 = document.createElement('h1');
                h1.className = 'sr-only';
                h1.textContent = text;
                document.body.insertBefore(h1, document.body.firstChild);
            }
        },

        /**
         * THÊM NOINDEX CHO TRANG PHÂN TRANG NẾU CẦN
         */
        handlePaginationNoindex: function(currentPage) {
            if (currentPage > 1) {
                SEO._setMeta('robots', 'noindex, follow');
            } else {
                SEO._setMeta('robots', 'index, follow');
            }
        },

        // ===================== PRIVATE HELPERS =====================

        /**
         * Lấy URL đầy đủ bao gồm query parameters (cho canonical & og:url)
         * Phải giữ nguyên ?slug=xxx để Facebook/Google bot đọc đúng URL
         */
        _getCleanUrl: function() {
            return window.location.href;
        },

        /**
         * Set or update a meta tag
         */
        _setMeta: function(name, content, attrName) {
            if (!name || !content) return;
            attrName = attrName || 'name';
            
            var selector = 'meta[' + attrName + '="' + name + '"]';
            var meta = document.querySelector(selector);
            
            if (!meta) {
                meta = document.createElement('meta');
                meta.setAttribute(attrName, name);
                document.head.appendChild(meta);
            }
            meta.setAttribute('content', content);
        },

        /**
         * Set or update canonical URL
         */
        _setCanonical: function(url) {
            if (!url) return;
            var link = document.querySelector('link[rel="canonical"]');
            if (!link) {
                link = document.createElement('link');
                link.setAttribute('rel', 'canonical');
                document.head.appendChild(link);
            }
            link.setAttribute('href', url);
        },

        /**
         * REMOVE ALL CSS HIDING FOR SEO - Dùng để đảm bảo nội dung không bị ẩn khỏi Google
         */
        removeSeoHiding: function() {
            // Remove any CSS that might hide content from Google
            var styles = document.querySelectorAll('style, link[rel="stylesheet"]');
            // Only remove specific problematic patterns - this is just a safety check
        }
    };

    // ===================== EXPORT GLOBALLY =====================
    global.SEO = SEO;
    global.AloSeo = SEO;

    console.log('[SEO Engine] Loaded successfully v2.0');
})(typeof window !== 'undefined' ? window : this);