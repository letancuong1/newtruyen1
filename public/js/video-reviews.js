/**
 * Video Reviews Listing Page - AloTruyen
 * Handles: filter loading, story card rendering, episode badge switching, pagination, sorting, lazy load
 * Loads stories immediately + filters in background for fast initial display
 */
(function() {
    'use strict';

    // ===================== STATE =====================
    const VR_STORAGE_KEY = 'alotruyen_video_reviews_state';

    // Load saved state from sessionStorage (to preserve page when returning from video detail)
    function loadSavedState() {
        try {
            var saved = sessionStorage.getItem(VR_STORAGE_KEY);
            if (saved) return JSON.parse(saved);
        } catch (e) { /* noop */ }
        return null;
    }

    function saveStateToSession() {
        try {
            sessionStorage.setItem(VR_STORAGE_KEY, JSON.stringify({
                currentPage: state.currentPage,
                keyword: state.keyword,
                style: state.style,
                category: state.category,
                subGenre: state.subGenre,
                sort: state.sort,
                duration: state.duration,
                total: state.total,
                totalPages: state.totalPages
            }));
        } catch (e) { /* noop */ }
    }

    var savedState = loadSavedState();

    const state = {
        currentPage: (savedState && savedState.currentPage) || 1,
        keyword: (savedState && savedState.keyword) || '',
        style: (savedState && savedState.style) || '',
        category: (savedState && savedState.category) || '',
        subGenre: (savedState && savedState.subGenre) || '',
        sort: (savedState && savedState.sort) || 'date',
        duration: (savedState && savedState.duration) || '',
        totalPages: 1,
        total: 0,
        filtersLoaded: false,
        isLoading: false,
        loadedPages: new Set(),
        allData: {}
    };

    // ===================== DOM REFS =====================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const grid = $('#stories-grid');
    const pagination = $('#pagination-container');
    const resultCount = $('#result-count');
    const searchInput = $('#search-input');
    const styleTabs = $('#style-tabs');
    const categorySelect = $('#category-select');
    const subgenreSelect = $('#subgenre-select');
    const sortSelect = $('#sort-select');
    const durationSelect = $('#duration-select');

    // ===================== UTILITY =====================
    function formatDuration(seconds) {
        if (!seconds && seconds !== 0) return '--:--';
        const s = Math.floor(seconds);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) {
            return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }
        return `${m}:${String(sec).padStart(2, '0')}`;
    }

    function formatNumber(num) {
        if (!num && num !== 0) return '0';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'Tr';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString('vi-VN');
    }

    function formatDate(dateStr) {
        if (!dateStr) return '--';
        return dateStr;
    }

    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    /**
     * Tạo label hiển thị cho mỗi tập
     */
    function formatEpisodeLabel(dinhDanhTap, index, siblingLabels) {
        if (!dinhDanhTap) return `Tập ${index + 1}`;
        const lower = dinhDanhTap.toLowerCase();

        if (lower.includes('full') || lower.includes('end') || lower.includes('bo')) {
            if (siblingLabels && siblingLabels.length > 0) {
                const hasOtherNumberedParts = siblingLabels.some((s, i) => {
                    if (i === index) return false;
                    if (!s) return false;
                    const sNum = s.replace(/[^0-9]/g, '');
                    if (sNum && parseInt(sNum) > 0) return true;
                    return false;
                });
                if (hasOtherNumberedParts) return 'Phần 1';
            }
            return 'Full Bộ';
        }

        const num = dinhDanhTap.replace(/[^0-9]/g, '');
        if (num) return `Phần ${num}`;
        return 'Phần 1';
    }

    // ===================== API CALLS =====================
    async function loadFilters() {
        try {
            const res = await fetch('/api/video-reviews/filters');
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to load filters');

            const { styles, categories, subGenres } = json.filters;

            styles.forEach(style => {
                const btn = document.createElement('button');
                btn.dataset.style = style;
                btn.className = 'style-tab px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-600 border border-gray-200';
                btn.textContent = style;
                styleTabs.appendChild(btn);
            });

            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                categorySelect.appendChild(opt);
            });

            subGenres.forEach(sub => {
                const opt = document.createElement('option');
                opt.value = sub;
                opt.textContent = sub;
                subgenreSelect.appendChild(opt);
            });

            state.filtersLoaded = true;
        } catch (err) {
            console.error('[VideoReviews] Filter load error:', err);
        }
    }

    async function loadStories(page, lazy = false) {
        if (state.isLoading) return;

        if (state.loadedPages.has(page) && state.allData[page] && !lazy) {
            renderCurrentPage(page);
            updatePaginationUI();
            return;
        }

        state.isLoading = true;

        const params = new URLSearchParams();
        params.set('page', page || 1);
        params.set('limit', 12);
        if (state.keyword) params.set('keyword', state.keyword);
        if (state.style) params.set('style', state.style);
        if (state.category) params.set('category', state.category);
        if (state.subGenre) params.set('sub_genre', state.subGenre);
        if (state.sort) params.set('sort', state.sort);
        if (state.duration) params.set('duration', state.duration);

        try {
            const res = await fetch(`/api/video-reviews/list?${params.toString()}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to load stories');

            state.allData[page] = json.data;
            state.loadedPages.add(page);

            if (!lazy) {
                state.currentPage = json.currentPage;
                state.totalPages = json.totalPages;
                state.total = json.total;
                renderCurrentPage(page);
                updatePaginationUI();
                saveStateToSession();
            } else {
                state.totalPages = json.totalPages;
                state.total = json.total;
                saveStateToSession();
            }
        } catch (err) {
            console.error('[VideoReviews] Load error:', err);
            if (!lazy) {
                grid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500">
                    <i class="fa-solid fa-triangle-exclamation text-3xl mb-3 text-brandPink"></i>
                    <p class="font-bold">Không thể tải dữ liệu</p>
                    <p class="text-xs mt-1">${err.message}</p>
                    <button onclick="location.reload()" class="mt-3 px-4 py-2 rounded-xl bg-gradient-to-r from-brandCyan to-brandPurple text-white text-xs font-bold">Thử lại</button>
                </div>`;
            }
        } finally {
            state.isLoading = false;
        }
    }

    function renderCurrentPage(page) {
        const stories = state.allData[page];
        if (!stories) return;
        state.currentPage = page;
        renderStories(stories);
        updatePaginationUI();
        updateResultCount();
    }

    function preloadPages() {
        const maxPreload = Math.min(state.currentPage + 2, state.totalPages);
        for (let p = state.currentPage + 1; p <= maxPreload; p++) {
            if (!state.loadedPages.has(p)) {
                loadStories(p, true);
            }
        }
    }

    // ===================== RENDER =====================
    function renderStories(stories) {
        if (!stories || stories.length === 0) {
            grid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500">
                <i class="fa-solid fa-video-slash text-3xl mb-3"></i>
                <p class="font-bold">Không tìm thấy video review nào</p>
                <p class="text-xs mt-1">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
            </div>`;
            return;
        }

        grid.innerHTML = stories.map((story, idx) => {
            const videos = story.videos || [];
            const activeVideo = videos[0] || {};
            const categories = story.the_loai_goc || [];
            const subGenres = story.luu_phai_chi_tiet || [];

            const siblingLabels = videos.map(v => v.dinh_danh_tap || '');

            // Sort videos: numbered parts (P1, P2...) first, Full/Bo at end
            const sortedVideos = videos.slice().sort(function(a, b) {
                var aLabel = a.dinh_danh_tap || '';
                var bLabel = b.dinh_danh_tap || '';
                var aIsFull = aLabel.toLowerCase().includes('full') || aLabel.toLowerCase().includes('end') || aLabel.toLowerCase().includes('bo');
                var bIsFull = bLabel.toLowerCase().includes('full') || bLabel.toLowerCase().includes('end') || bLabel.toLowerCase().includes('bo');
                if (aIsFull && !bIsFull) return 1;
                if (!aIsFull && bIsFull) return -1;
                var aNum = parseInt(aLabel.replace(/[^0-9]/g, '')) || 0;
                var bNum = parseInt(bLabel.replace(/[^0-9]/g, '')) || 0;
                return aNum - bNum;
            });

            // If only 1 video, show "Full Bộ"
            var isSingleVideo = sortedVideos.length === 1;
            var singleIsFull = isSingleVideo && sortedVideos[0].dinh_danh_tap && (sortedVideos[0].dinh_danh_tap.toLowerCase().includes('full') || sortedVideos[0].dinh_danh_tap.toLowerCase().includes('end') || sortedVideos[0].dinh_danh_tap.toLowerCase().includes('bo'));

            const badgesHtml = sortedVideos.map((v, vi) => {
                var label;
                if (isSingleVideo) {
                    label = 'Full Bộ';
                } else {
                    var tap = v.dinh_danh_tap || '';
                    if (tap.toLowerCase().includes('full') || tap.toLowerCase().includes('end')) {
                        label = 'Full Bộ';
                    } else {
                        var num = tap.replace(/[^0-9]/g, '');
                        label = 'P' + (num || tap);
                    }
                }
                const isActive = vi === 0;
                return `<span class="episode-badge inline-block px-3 py-1.5 rounded-lg text-[10px] font-bold border ${isActive ? 'active' : 'bg-white/80 text-slate-600 border-gray-200'}" 
                    data-video-id="${v.id_video}"
                    data-duration="${v.thoi_luong_giay || 0}"
                    data-views="${v.luot_xem || 0}"
                    data-likes="${v.luot_thich || 0}"
                    data-date="${v.ngay_dang || ''}"
                    data-link="${v.link_video || ''}"
                    data-index="${vi}">${label}</span>`;
            }).join('');

            const catTags = categories.slice(0, 3).map(c =>
                `<span class="inline-block px-2 py-0.5 rounded-md bg-cyan-50 text-brandCyan text-[9px] font-bold border border-cyan-200/50">${c}</span>`
            ).join('');

            const subTags = subGenres.slice(0, 3).map(s =>
                `<span class="inline-block px-2 py-0.5 rounded-md bg-purple-50 text-brandPurple text-[9px] font-bold border border-purple-200/50">${s}</span>`
            ).join('');

            const styleBadge = story.phong_cach_review
                ? `<span class="inline-block px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 text-[9px] font-bold border border-amber-200/50">${story.phong_cach_review}</span>`
                : '';

            const thumbUrl = story.anh_thumbnail || '';

            return `<div class="story-card p-0 flex flex-col" data-story-idx="${idx}">
                <div class="relative w-full aspect-[16/9] bg-slate-100 overflow-hidden rounded-t-2xl flex-shrink-0">
                    ${thumbUrl
                        ? `<img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(story.ten_truyen_sach)}" class="w-full h-full object-cover" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'flex items-center justify-center h-full text-slate-300\\'><i class=\\'fa-solid fa-video text-3xl\\'></i></div>'">`
                        : `<div class="flex items-center justify-center h-full text-slate-300"><i class="fa-solid fa-video text-3xl"></i></div>`
                    }
                    ${styleBadge ? `<span class="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/50 text-white text-[9px] font-bold backdrop-blur-sm">${escapeHtml(story.phong_cach_review)}</span>` : ''}
                    <span class="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm">
                        <i class="fa-regular fa-clock mr-1"></i>${formatDuration(activeVideo.thoi_luong_giay)}
                    </span>
                    <span class="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm">
                        ${story.so_phan || 1} phần
                    </span>
                </div>

                <div class="p-4 md:p-5 space-y-3 flex-1 flex flex-col">
                    <h3 class="text-sm md:text-base font-bold text-slate-800 leading-tight line-clamp-2" title="${escapeHtml(story.ten_truyen_sach)}">${escapeHtml(story.ten_truyen_sach)}</h3>
                    <div class="flex flex-wrap gap-1.5">${catTags}${subTags}</div>
                    <div class="flex flex-wrap gap-1.5 episode-container">${badgesHtml}</div>
                    <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-gray-100/60" data-meta-container>
                        <div class="flex items-center gap-3">
                            <span class="flex items-center gap-1"><i class="fa-regular fa-eye text-brandPurple"></i> <span class="views-display">${formatNumber(activeVideo.luot_xem)}</span></span>
                            <span class="flex items-center gap-1"><i class="fa-regular fa-heart text-brandPink"></i> <span class="likes-display">${formatNumber(activeVideo.luot_thich)}</span></span>
                        </div>
                        <span class="flex items-center gap-1"><i class="fa-regular fa-calendar text-slate-400"></i> <span class="date-display">${formatDate(activeVideo.ngay_dang)}</span></span>
                    </div>
                    <button onclick="window.location.href='xem-review.html?id=${activeVideo.id_video}'" class="w-full mt-auto py-2 rounded-xl bg-gradient-to-r from-brandCyan to-brandPurple text-white text-xs font-bold hover:shadow-md transition-all flex items-center justify-center gap-2">
                        <i class="fa-solid fa-play"></i> Xem Ngay
                    </button>
                </div>
            </div>`;
        }).join('');

        grid.querySelectorAll('.episode-badge').forEach(badge => {
            badge.addEventListener('click', function(e) {
                e.stopPropagation();
                const container = this.closest('.episode-container');
                const card = this.closest('.story-card');
                if (!container || !card) return;

                container.querySelectorAll('.episode-badge').forEach(b => {
                    b.classList.remove('active');
                    b.className = b.className.replace(/active/g, '').trim() + ' bg-white/80 text-slate-600 border-gray-200';
                });

                this.classList.add('active');
                this.className = this.className.replace(/bg-white\/80 text-slate-600 border-gray-200/g, '').trim();

                const meta = card.querySelector('[data-meta-container]');
                if (meta) {
                    meta.querySelector('.views-display').textContent = formatNumber(parseInt(this.dataset.views));
                    meta.querySelector('.likes-display').textContent = formatNumber(parseInt(this.dataset.likes));
                    meta.querySelector('.date-display').textContent = formatDate(this.dataset.date);
                }

                const watchBtn = card.querySelector('button:last-child');
                if (watchBtn) {
                    watchBtn.onclick = function() {
                        window.location.href = `xem-review.html?id=${this.dataset.videoId}`;
                    };
                    watchBtn.dataset.videoId = this.dataset.videoId;
                }
            });
        });
    }

    function updatePaginationUI() {
        const { currentPage, totalPages } = state;
        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        let html = '';
        html += `<button class="page-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-600 border border-gray-200 ${currentPage <= 1 ? 'opacity-40 cursor-not-allowed' : ''}" 
            onclick="window.vrGoTo(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-left"></i>
        </button>`;

        const start = Math.max(1, currentPage - 2);
        const end = Math.min(totalPages, currentPage + 2);

        if (start > 1) {
            html += `<button class="page-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-600 border border-gray-200" onclick="window.vrGoTo(1)">1</button>`;
            if (start > 2) html += `<span class="text-slate-400 text-xs">...</span>`;
        }

        for (let i = start; i <= end; i++) {
            html += `<button class="page-btn px-3 py-1.5 rounded-lg text-xs font-bold ${i === currentPage ? 'active' : 'bg-white text-slate-600 border border-gray-200'}" onclick="window.vrGoTo(${i})">${i}</button>`;
        }

        if (end < totalPages) {
            if (end < totalPages - 1) html += `<span class="text-slate-400 text-xs">...</span>`;
            html += `<button class="page-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-600 border border-gray-200" onclick="window.vrGoTo(${totalPages})">${totalPages}</button>`;
        }

        html += `<button class="page-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-600 border border-gray-200 ${currentPage >= totalPages ? 'opacity-40 cursor-not-allowed' : ''}" 
            onclick="window.vrGoTo(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-right"></i>
        </button>`;

        pagination.innerHTML = html;
    }

    function updateResultCount() {
        resultCount.textContent = `📊 ${state.total} kết quả • Trang ${state.currentPage}/${state.totalPages}`;
    }

    // ===================== EVENT HANDLERS =====================
    function reloadWithFilters() {
        state.currentPage = 1;
        state.loadedPages = new Set();
        state.allData = {};
        loadStories(1);
    }

    function setupEventListeners() {
        const debouncedSearch = debounce(() => {
            const newKeyword = searchInput.value.trim();
            if (newKeyword !== state.keyword) {
                state.keyword = newKeyword;
                state.currentPage = 1;
                state.loadedPages = new Set();
                state.allData = {};
                loadStories(1);
            }
        }, 400);

        searchInput.addEventListener('input', debouncedSearch);

        styleTabs.addEventListener('click', function(e) {
            const btn = e.target.closest('.style-tab');
            if (!btn) return;

            styleTabs.querySelectorAll('.style-tab').forEach(b => {
                b.classList.remove('active');
                b.className = b.className.replace(/active/g, '').trim() + ' bg-white text-slate-600 border border-gray-200';
            });
            btn.classList.add('active');
            btn.className = btn.className.replace(/bg-white text-slate-600 border border-gray-200/g, '').trim();

            state.style = btn.dataset.style || '';
            reloadWithFilters();
        });

        categorySelect.addEventListener('change', function() {
            state.category = this.value;
            reloadWithFilters();
        });

        subgenreSelect.addEventListener('change', function() {
            state.subGenre = this.value;
            reloadWithFilters();
        });

        if (sortSelect) {
            sortSelect.addEventListener('change', function() {
                state.sort = this.value;
                reloadWithFilters();
            });
        }

        // Duration preset filter
        if (durationSelect) {
            durationSelect.addEventListener('change', function() {
                state.duration = this.value;
                reloadWithFilters();
            });
            if (savedState && savedState.duration) {
                durationSelect.value = savedState.duration;
            }
        }

        // Restore search from saved state
        if (savedState && savedState.keyword && searchInput) {
            searchInput.value = savedState.keyword;
        }

        // Restore sort from saved state
        if (savedState && savedState.sort && sortSelect) {
            sortSelect.value = savedState.sort;
        }
    }

    // ===================== UTILITY =====================
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ===================== INIT =====================
    async function init() {
        // Show skeleton IMMEDIATELY
        const skeleton = document.getElementById('skeleton-template');
        if (skeleton) {
            grid.innerHTML = Array(6).fill(skeleton.outerHTML).join('');
        }

        setupEventListeners();

        // Load stories using the restored page (from sessionStorage if returning from video detail)
        loadStories(state.currentPage);

        // Load filters in background
        loadFilters().then(() => {
            // Filters loaded, no need to reload stories
        });

        // Preload next pages after stories load
        setTimeout(preloadPages, 500);
    }

    window.vrGoTo = function(page) {
        if (page < 1 || page > state.totalPages || state.isLoading) return;

        if (state.loadedPages.has(page)) {
            renderCurrentPage(page);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            loadStories(page);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        setTimeout(preloadPages, 200);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();