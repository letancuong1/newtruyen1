/**
 * AloTruyen Video Player - YouTube Iframe API
 * White-label experience: CSS clipping trick, skip toolbar, progress saving,
 * cinema mode, smart orientation, keyboard shortcuts
 */
(function() {
    'use strict';

    // ===================== CONSTANTS =====================
    const STORAGE_PROGRESS_PREFIX = 'alotruyen_vid_progress_';
    const RESUME_THRESHOLD = 15; // seconds from end to consider "watched"
    const SAVE_INTERVAL_MS = 5000;

    // ===================== STATE =====================
    let player = null;
    let playerReady = false;
    let currentVideoId = '';
    let currentYtId = '';
    let currentStoryData = null;
    let isCinemaMode = false;
    let resumeTime = null;
    let saveTimer = null;

    // ===================== DOM REFS =====================
    const $ = (sel) => document.querySelector(sel);
    const videoTitle = $('#video-title');
    const metaViews = $('#meta-views');
    const metaLikes = $('#meta-likes');
    const metaDuration = $('#meta-duration');
    const metaDate = $('#meta-date');
    const metaTags = $('#meta-tags');
    const siblingsContainer = $('#siblings-container');
    const cinemaBtn = $('#cinema-toggle-btn');
    const resumeToast = $('#resume-toast');
    const toastTime = $('#toast-time');
    const toastAccept = $('#toast-accept');
    const toastDismiss = $('#toast-dismiss');

    // ===================== UTILITY =====================
    function formatTime(seconds) {
        if (!seconds && seconds !== 0) return '0:00';
        const s = Math.floor(seconds);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
        return m + ':' + String(sec).padStart(2, '0');
    }

    function formatNumber(num) {
        if (!num && num !== 0) return '0';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'Tr';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString('vi-VN');
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function renderVideoRecommendations(recs) {
        var grid = document.getElementById('video-recommendations-grid');
        if (!grid) return;
        
        if (!recs || recs.length === 0) {
            grid.innerHTML = '<div class="col-span-full text-center text-xs text-slate-500 py-4">Chưa có video liên quan</div>';
            return;
        }
        
        grid.innerHTML = recs.map(function(r) {
            var thumbUrl = r.anh_thumbnail || '';
            var storyName = r.ten_truyen_sach || 'Không rõ';
            var views = formatNumber(r.luot_xem);
            var duration = formatTime(r.thoi_luong_giay);
            var slug = r.slug || r.id_video;
            
            return '<div class="rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-brandCyan/30 transition-all cursor-pointer group" onclick="window.location.href=\'/video-review/' + encodeURIComponent(slug) + '\'">' +
                '<div class="relative w-full aspect-[16/9] bg-slate-800 overflow-hidden">' +
                    (thumbUrl 
                        ? '<img src="' + escapeHtml(thumbUrl) + '" alt="' + escapeHtml(storyName) + '" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=\\\'flex items-center justify-center h-full text-slate-600\\\'><i class=\\\'fa-solid fa-video text-2xl\\\'></i></div>\'">'
                        : '<div class="flex items-center justify-center h-full text-slate-600"><i class="fa-solid fa-video text-2xl"></i></div>'
                    ) +
                    '<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>' +
                    '<span class="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold backdrop-blur-sm">' +
                        '<i class="fa-regular fa-clock mr-1"></i>' + duration +
                    '</span>' +
                '</div>' +
                '<div class="p-3 space-y-2">' +
                    '<h4 class="text-xs md:text-sm font-bold text-gray-200 leading-tight line-clamp-2 group-hover:text-brandCyan transition-colors" title="' + escapeHtml(storyName) + '">' + escapeHtml(storyName) + '</h4>' +
                    '<div class="flex items-center justify-between text-[10px] text-slate-500">' +
                        '<span><i class="fa-regular fa-eye mr-1 text-brandCyan"></i>' + views + '</span>' +
                    '</div>' +
                    '<button onclick="event.stopPropagation();window.location.href=\'/video-review/' + encodeURIComponent(slug) + '\'" class="w-full py-1.5 rounded-lg bg-gradient-to-r from-brandCyan to-brandPurple text-white text-[10px] font-bold hover:shadow-lg transition-all flex items-center justify-center gap-1.5">' +
                        '<i class="fa-solid fa-play"></i> Xem Ngay' +
                    '</button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function renderTextRecommendations(recs) {
        var grid = document.getElementById('text-recommendations-grid');
        if (!grid) return;
        
        if (!recs || recs.length === 0) {
            grid.innerHTML = '<div class="col-span-full text-center text-xs text-slate-500 py-4">Chưa có truyện chữ liên quan</div>';
            return;
        }
        
        grid.innerHTML = recs.map(function(r) {
            var coverUrl = r.anh_bia || '';
            var storyName = r.ten_truyen || 'Không rõ';
            var author = r.tac_gia || 'Khuyết Danh';
            var chapters = r.so_chuong || 0;
            var views = formatNumber(r.luot_xem);
            var slug = r.slug || '';
            var detailPage = slug ? 'chi-tiet-truyen.html?slug=' + encodeURIComponent(slug) : 'chi-tiet-truyen.html?id=' + encodeURIComponent(r.id);
            var genres = '';
            if (r.the_loai && Array.isArray(r.the_loai)) {
                genres = r.the_loai.slice(0, 3).map(function(g) {
                    return '<span class="px-1.5 py-0.5 rounded bg-white/5 text-gray-400 text-[9px] font-medium">' + g + '</span>';
                }).join('');
            }
            
            return '<div class="rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-purple-500/30 transition-all cursor-pointer group flex flex-col sm:flex-row" onclick="window.location.href=\'' + detailPage + '\'">' +
                '<div class="w-full sm:w-24 h-32 sm:h-28 flex-shrink-0 bg-slate-800 overflow-hidden">' +
                    (coverUrl 
                        ? '<img src="' + escapeHtml(coverUrl) + '" alt="' + escapeHtml(storyName) + '" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=\\\'flex items-center justify-center h-full text-slate-600\\\'><i class=\\\'fa-solid fa-book text-xl\\\'></i></div>\'">'
                        : '<div class="flex items-center justify-center h-full text-slate-600"><i class="fa-solid fa-book text-xl"></i></div>'
                    ) +
                '</div>' +
                '<div class="p-3 flex-1 flex flex-col gap-1.5 min-w-0">' +
                    '<h4 class="text-xs md:text-sm font-bold text-gray-200 leading-tight line-clamp-2 group-hover:text-purple-400 transition-colors" title="' + escapeHtml(storyName) + '">' + escapeHtml(storyName) + '</h4>' +
                    '<div class="flex items-center gap-1.5 text-[10px] text-gray-500">' +
                        '<i class="fa-solid fa-user-pen text-gray-600"></i>' +
                        '<span class="truncate">' + escapeHtml(author) + '</span>' +
                    '</div>' +
                    (genres ? '<div class="flex flex-wrap gap-1">' + genres + '</div>' : '') +
                    '<div class="flex items-center justify-between mt-auto pt-1">' +
                        '<span class="text-[10px] text-gray-500"><i class="fa-solid fa-book-open mr-1 text-purple-400"></i>' + formatNumber(chapters) + ' Chương</span>' +
                        '<span class="text-[10px] text-gray-500"><i class="fa-regular fa-eye mr-1 text-brandCyan"></i>' + views + '</span>' +
                    '</div>' +
                    '<button onclick="event.stopPropagation();window.location.href=\'' + detailPage + '\'" class="w-full py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-brandPurple text-white text-[10px] font-bold hover:shadow-lg transition-all flex items-center justify-center gap-1.5">' +
                        '<i class="fa-solid fa-book-open"></i> Đọc Ngay' +
                    '</button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function getVideoIdFromUrl(url) {
        if (!url) return null;
        var patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /^([a-zA-Z0-9_-]{11})$/
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = url.match(patterns[i]);
            if (m) return m[1];
        }
        return null;
    }

    function getBaseStoryId() {
        var params = new URLSearchParams(window.location.search);
        return params.get('id') || currentYtId || 'unknown';
    }

    function progressKey() {
        return STORAGE_PROGRESS_PREFIX + getBaseStoryId();
    }

    // ===================== LOCAL STORAGE =====================
    function saveProgress(seconds) {
        try {
            var data = { time: seconds, updated: Date.now(), videoId: currentVideoId };
            localStorage.setItem(progressKey(), JSON.stringify(data));
        } catch (e) { /* silently fail */ }
    }

    function loadProgress() {
        try {
            var raw = localStorage.getItem(progressKey());
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }

    function clearProgress() {
        try { localStorage.removeItem(progressKey()); } catch (e) { /* noop */ }
    }

    // ===================== LOAD VIDEO DATA =====================
    async function loadVideoData(videoId) {
        try {
            var isSlugMode = typeof videoId === 'string' && videoId.indexOf('SLUG_MODE:') === 0;
            var actualId = isSlugMode ? videoId.replace('SLUG_MODE:', '') : videoId;
            var apiParam = isSlugMode ? ('slug=' + encodeURIComponent(actualId)) : ('id=' + encodeURIComponent(actualId));
            var res = await fetch('/api/video-reviews/detail?' + apiParam);
            var json = await res.json();
            if (!json.success) throw new Error(json.error || 'Failed to load video');

            currentStoryData = json;
            var video = json.video;
            var siblings = json.siblings || [];

            // Render recommendations từ data đã có (không fetch lại API)
            if (json.videoRecommendations) renderVideoRecommendations(json.videoRecommendations);
            if (json.textRecommendations) renderTextRecommendations(json.textRecommendations);

            videoTitle.textContent = video.ten_truyen_sach || 'Video Review';
            metaViews.textContent = formatNumber(video.luot_xem);
            metaLikes.textContent = formatNumber(video.luot_thich);
            metaDuration.textContent = formatTime(video.thoi_luong_giay);
            metaDate.textContent = video.ngay_dang || '--';

            var tagsHtml = '';
            if (video.the_loai_goc && Array.isArray(video.the_loai_goc)) {
                video.the_loai_goc.forEach(function(t) {
                    tagsHtml += '<span class="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-brandCyan text-[10px] font-bold border border-cyan-500/20">' + t + '</span>';
                });
            }
            if (video.luu_phai_chi_tiet && Array.isArray(video.luu_phai_chi_tiet)) {
                video.luu_phai_chi_tiet.forEach(function(t) {
                    tagsHtml += '<span class="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-400 text-[10px] font-bold border border-purple-500/20">' + t + '</span>';
                });
            }
            if (video.phong_cach_review) {
                tagsHtml += '<span class="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] font-bold border border-amber-500/20">' + video.phong_cach_review + '</span>';
            }
            metaTags.innerHTML = tagsHtml;

            // Sort siblings: regular parts (P1, P2...) first, then Full/End/Bo at the end
            var sortedSiblings = siblings.slice().sort(function(a, b) {
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

            if (sortedSiblings.length === 1) {
                var single = sortedSiblings[0];
                var isFull = single.dinh_danh_tap && (single.dinh_danh_tap.toLowerCase().includes('full') || single.dinh_danh_tap.toLowerCase().includes('end') || single.dinh_danh_tap.toLowerCase().includes('bo'));
                var singleLabel = isFull ? 'Full Bộ' : 'Full Bộ';
                siblingsContainer.innerHTML = '<span class="episode-badge active inline-block px-3 py-1.5 rounded-lg text-[10px] font-bold border active" data-video-id="' + single.id_video + '">' + singleLabel + '</span>';
            } else {
                siblingsContainer.innerHTML = sortedSiblings.map(function(s, idx) {
                    var isActive = s.id_video === videoId;
                    var label = s.dinh_danh_tap
                        ? (s.dinh_danh_tap.toLowerCase().includes('full') || s.dinh_danh_tap.toLowerCase().includes('end')
                            ? 'Full Bộ'
                            : 'P' + (s.dinh_danh_tap.replace(/[^0-9]/g, '') || s.dinh_danh_tap))
                        : 'P' + (idx + 1);
                    return '<span class="episode-badge inline-block px-3 py-1.5 rounded-lg text-[10px] font-bold border ' + (isActive ? 'active' : 'bg-white/5 text-gray-400 border-white/10') + '" data-video-id="' + s.id_video + '">' + label + '</span>';
                }).join('');

                siblingsContainer.querySelectorAll('.episode-badge').forEach(function(badge) {
                    badge.addEventListener('click', function() {
                        var newId = this.dataset.videoId;
                        if (newId && newId !== videoId) {
                            window.location.href = 'xem-review.html?id=' + newId;
                        }
                    });
                });
            }

            return video;
        } catch (err) {
            console.error('[VideoPlayer] Load error:', err);
            videoTitle.textContent = 'Không thể tải video';
            return null;
        }
    }

    // ===================== YOUTUBE PLAYER =====================
    function initPlayer(ytId) {
        // Set iframe src with clean params
        var iframe = $('#youtube-player');
        if (!iframe) return;

        iframe.src = 'https://www.youtube-nocookie.com/embed/' + ytId + '?autoplay=1&controls=1&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&cc_load_policy=0&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(window.location.origin);

        // YouTube API callback will handle the rest via onYouTubeIframeAPIReady
    }

    // Called by YouTube Iframe API when ready
    window.onYouTubeIframeAPIReady = function() {
        // Player is already created by the iframe, but we need to get the API handle
        // Since YT.Player requires a div placeholder OR existing iframe ID
        // We'll create the player from the existing iframe
        if (player) return;

        var iframe = $('#youtube-player');
        if (!iframe) return;

        var ytId = '';
        var src = iframe.src;
        var m = src.match(/embed\/([a-zA-Z0-9_-]{11})/);
        if (m) ytId = m[1];

        if (!ytId) return;

        // Create YT.Player from existing iframe element
        player = new YT.Player('youtube-player', {
            events: {
                onReady: onPlayerReady,
                onStateChange: onPlayerStateChange,
                onError: onPlayerError
            }
        });
    };

    function onPlayerReady(event) {
        playerReady = true;
        console.log('[VideoPlayer] YouTube player ready');

        // Check for resume progress
        checkResumeProgress();

        // Start progress saving when playing
        if (player.getPlayerState() === YT.PlayerState.PLAYING) {
            startProgressSaving();
        }
    }

    function onPlayerStateChange(event) {
        var state = event.data;

        if (state === YT.PlayerState.PLAYING) {
            startProgressSaving();
        } else if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED) {
            stopProgressSaving();
            if (player && player.getCurrentTime) {
                saveProgress(player.getCurrentTime());
            }
        }
    }

    function onPlayerError(event) {
        console.error('[VideoPlayer] YouTube error:', event.data);
    }

    // ===================== SKIP CONTROLS =====================
    function handleSkip(seconds) {
        if (!player || !playerReady) return;
        var current = player.getCurrentTime() || 0;
        var duration = player.getDuration() || 0;
        var newTime = Math.max(0, Math.min(duration, current + seconds));
        player.seekTo(newTime, true);
        saveProgress(newTime);
    }

    // ===================== PROGRESS SAVING =====================
    function startProgressSaving() {
        stopProgressSaving();
        saveTimer = setInterval(function() {
            if (player && playerReady && player.getCurrentTime) {
                saveProgress(player.getCurrentTime());
            }
        }, SAVE_INTERVAL_MS);
    }

    function stopProgressSaving() {
        if (saveTimer) {
            clearInterval(saveTimer);
            saveTimer = null;
        }
    }

    // ===================== RESUME PROMPT =====================
    function checkResumeProgress() {
        var saved = loadProgress();
        if (!saved || !saved.time || saved.time <= 0) return;
        if (!player || !playerReady || !player.getDuration) return;

        var duration = player.getDuration();
        if (!duration || duration <= 0) {
            // Duration not available yet, try again later
            setTimeout(checkResumeProgress, 1000);
            return;
        }

        if (saved.time >= duration - RESUME_THRESHOLD) {
            clearProgress();
            return;
        }

        resumeTime = saved.time;
        toastTime.textContent = formatTime(resumeTime);
        resumeToast.classList.add('show');
    }

    function doResume(seconds) {
        resumeToast.classList.remove('show');
        if (player && playerReady && seconds !== null && seconds > 0) {
            player.seekTo(seconds, true);
        }
        resumeTime = null;
    }

    function dismissResume() {
        resumeToast.classList.remove('show');
        resumeTime = null;
    }

    // ===================== SMART MOBILE ORIENTATION =====================
    function isMobileDevice() {
        return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function tryLockOrientation(orientation) {
        try {
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock(orientation).catch(function() {});
            }
        } catch (e) { /* fail silently */ }
    }

    function tryUnlockOrientation() {
        try {
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        } catch (e) { /* fail silently */ }
    }

    // ===================== CINEMA MODE =====================
    function toggleCinemaMode() {
        isCinemaMode = !isCinemaMode;
        document.body.classList.toggle('cinema-mode', isCinemaMode);
        cinemaBtn.classList.toggle('active', isCinemaMode);
        cinemaBtn.innerHTML = isCinemaMode
            ? '<i class="fa-solid fa-compress mr-1"></i> Thoát Rạp phim'
            : '<i class="fa-solid fa-film mr-1"></i> Chế độ Rạp phim';
    }

    // ===================== KEYBOARD SHORTCUTS =====================
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    if (player && playerReady) {
                        if (player.getPlayerState() === YT.PlayerState.PLAYING) {
                            player.pauseVideo();
                        } else {
                            player.playVideo();
                        }
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    handleSkip(-10);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    handleSkip(10);
                    break;
                case 'KeyC':
                    e.preventDefault();
                    toggleCinemaMode();
                    break;
            }
        });
    }

    // ===================== FULLSCREEN ORIENTATION =====================
    function setupFullscreenListener() {
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    }

    function handleFullscreenChange() {
        var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (isFs && isMobileDevice()) {
            tryLockOrientation('landscape');
        } else if (!isFs && isMobileDevice()) {
            tryUnlockOrientation();
        }
    }

    // ===================== EVENT BINDING =====================
    function bindUI() {
        cinemaBtn.addEventListener('click', toggleCinemaMode);

        document.querySelectorAll('.skip-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var seconds = parseInt(this.dataset.seconds, 10);
                if (!isNaN(seconds)) handleSkip(seconds);
            });
        });

        toastAccept.addEventListener('click', function() { doResume(resumeTime); });
        toastDismiss.addEventListener('click', dismissResume);

        document.addEventListener('keydown', function(e) {
            if (e.code === 'Escape' && resumeToast.classList.contains('show')) {
                dismissResume();
            }
        });
    }

    // ===================== INIT =====================
    async function init() {
        var params = new URLSearchParams(window.location.search);
        // Support both id and slug parameters (prefer slug for SEO)
        var videoId = params.get('slug') || params.get('id');
        var isSlug = params.has('slug');

        if (!videoId) {
            videoTitle.textContent = 'Thiếu ID video';
            return;
        }

        currentVideoId = videoId;

        // Load video data from API (support both id and slug)
        var apiParam = isSlug ? ('slug=' + encodeURIComponent(videoId)) : ('id=' + encodeURIComponent(videoId));
        // Update loadVideoData to use the correct parameter
        var video = await loadVideoData(isSlug ? 'SLUG_MODE:' + videoId : videoId);
        if (!video) return;

        // Get YouTube video ID
        var ytId = getVideoIdFromUrl(video.link_video) || videoId;
        currentYtId = ytId;

        // Bind UI elements
        bindUI();

        // Setup keyboard shortcuts
        setupKeyboardShortcuts();

        // Setup fullscreen orientation listener
        setupFullscreenListener();

        // Initialize YouTube player (set iframe src)
        initPlayer(ytId);

        // If YouTube API is already loaded, call the callback manually
        if (typeof YT !== 'undefined' && YT.loaded) {
            if (!player) {
                // We need to wait a tiny bit for iframe to load
                setTimeout(function() {
                    if (window.onYouTubeIframeAPIReady) {
                        window.onYouTubeIframeAPIReady();
                    }
                }, 500);
            }
        }
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();