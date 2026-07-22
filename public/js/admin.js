/**
 * admin.js - Bảng Điều Khiển Quản Trị AloTruyen
 * 
 * Kết nối dữ liệu từ API backend (Express/PostgreSQL)
 * Tất cả các API đều được định nghĩa sẵn trong `api/index.js`
 * 
 * Base URL: dùng API_BASE = '/api' (mặc định localhost:3000)
 */

const API_BASE = '/api';

// =========================================================================
// HÀM TIỆN ÍCH
// =========================================================================

/** Format số với dấu phẩy (VD: 1,000,000) */
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString('vi-VN');
}

/** Format ngày giờ Việt Nam */
function formatDate(dateStr) {
    if (!dateStr) return '---';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '---';
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Format số thành dạng rút gọn (1.2K, 3.5M) */
function formatCompact(num) {
    if (!num) return '0';
    const n = Number(num);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return formatNumber(n);
}

/** Format tiền VND */
function formatCurrency(num) {
    if (!num) return '0 ₫';
    return Number(num).toLocaleString('vi-VN') + ' ₫';
}

/** Toast notification */
function showAdminToast(message, type = 'success') {
    const container = document.getElementById('admin-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// =========================================================================
// 1. LOAD THỐNG KÊ (DASHBOARD STATS)
// =========================================================================

/**
 * fetchDashboardStats()
 * 
 * API: GET /api/admin/stats
 * Response:
 *   stats: {
 *     total_users       => COUNT(*) FROM profiles
 *     total_views       => SUM(luot_xem) FROM books
 *     total_linh_thach  => SUM(linh_thach) FROM profiles
 *     total_revenue     => SUM(amount_vnd) FROM transactions (success)
 *   }
 *   pending_books: [...]    => books WHERE trang_thai ILIKE '%chờ%' LIMIT 5
 *   recent_activities: [...] => UNION (topup, breakthrough, register) LIMIT 6
 */
async function fetchDashboardStats() {
    try {
        const response = await fetch(`${API_BASE}/admin/stats`);
        const data = await response.json();

        // API trả về success:false có thể do lỗi DB, nhưng vẫn trả data rỗng
        // Trong trường hợp đó, dùng fallback
        if (data && data.success === false) {
            console.warn('⚠️ Admin API báo lỗi:', data.error, '- dùng fallback data');
            renderFallbackData();
            return;
        }

        // Nếu không có data.stats (response không đúng format), fallback
        if (!data || !data.stats) {
            console.warn('⚠️ Admin API response không đúng format - dùng fallback');
            renderFallbackData();
            return;
        }

        const { stats, pending_books, recent_activities } = data;

        // Kiểm tra nếu tất cả stats đều = 0 (có thể DB đang trống, nhưng vẫn cần bỏ skeleton)
        // Gán vào các thẻ stat
        const elUsers = document.getElementById('stat-total-users');
        const elViews = document.getElementById('stat-total-views');
        const elLT = document.getElementById('stat-total-linh-thach');
        const elRevenue = document.getElementById('stat-total-revenue');

        if (elUsers) {
            elUsers.textContent = formatNumber(stats.total_users);
            elUsers.classList.remove('skeleton-load');
        }
        if (elViews) {
            elViews.textContent = formatCompact(stats.total_views);
            elViews.classList.remove('skeleton-load');
        }
        if (elLT) {
            elLT.textContent = formatCompact(stats.total_linh_thach);
            elLT.classList.remove('skeleton-load');
        }
        if (elRevenue) {
            elRevenue.textContent = `${formatNumber(stats.total_revenue)} VND`;
            elRevenue.classList.remove('skeleton-load');
        }

        // Gán vào sidebar overview
        const elUsersSide = document.getElementById('stat-total-users-side');
        if (elUsersSide) elUsersSide.textContent = formatNumber(stats.total_users);

        // Render bảng truyện chờ duyệt
        renderPendingBooks(pending_books);

        // Render hoạt động tu tiên
        renderRecentActivities(recent_activities);

    } catch (error) {
        console.error('Lỗi fetch dashboard stats:', error);
        // Nếu API chưa có hoặc lỗi mạng, dùng fallback dữ liệu mẫu
        renderFallbackData();
    }
}

// =========================================================================
// 1b. LOAD THỐNG KÊ CHI TIẾT (NÂNG CẤP)
// =========================================================================

/**
 * fetchDetailedStats()
 * 
 * API: GET /api/admin/stats/detailed
 * Response:
 *   data.views_by_time: Lượt đọc 1 ngày, 3 ngày, 1 tuần, 1 tháng
 *   data.views_by_category: Lượt xem theo danh mục
 *   data.revenue_by_time: Doanh thu theo các mốc
 *   data.new_vips_by_time: VIP mới theo các mốc
 *   data.vips_by_realm: VIP theo cảnh giới
 *   data.totals: Tổng số sách, chapter, VIP
 */
async function fetchDetailedStats() {
    try {
        const response = await fetch(`${API_BASE}/admin/stats/detailed`);
        const data = await response.json();

        if (!data || !data.success || !data.data) {
            console.warn('⚠️ Detailed stats API không khả dụng, dùng fallback');
            renderDetailedFallback();
            return;
        }

        const d = data.data;

        // === RENDER: Lượt đọc theo thời gian ===
        renderViewsByTime(d.views_by_time);

        // === RENDER: Lượt xem theo danh mục ===
        renderViewsByCategory(d.views_by_category);

        // === RENDER: Doanh thu theo thời gian ===
        renderRevenueByTime(d.revenue_by_time);

        // === RENDER: VIP mới theo thời gian ===
        renderNewVipsByTime(d.new_vips_by_time);

        // === RENDER: VIP theo cảnh giới ===
        renderVipsByRealm(d.vips_by_realm);

        // === RENDER: Tổng số bổ sung ===
        renderTotals(d.totals);

    } catch (error) {
        console.error('Lỗi fetch detailed stats:', error);
        renderDetailedFallback();
    }
}

// =========================================================================
// 2. RENDER BẢNG "TRUYỆN MỚI CHỜ DUYỆT"
// =========================================================================

/**
 * renderPendingBooks(books)
 * 
 * Render vào <tbody id="table-pending-books">
 * Mỗi dòng có: Tên truyện, Tác giả, Thời gian, Badge "Chờ duyệt", Hành động (Duyệt/Hủy)
 * Gắn sự kiện onclick="duyetTruyen(id, 'approve')" / duyetTruyen(id, 'reject')
 */
function renderPendingBooks(books) {
    const tbody = document.getElementById('table-pending-books');
    const countEl = document.getElementById('pending-count');
    if (!tbody) return;

    if (!books || books.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-gray-500 py-8">
                    <i class="fa-solid fa-inbox text-2xl block mb-2 opacity-50"></i>
                    Không có truyện nào chờ duyệt
                </td>
            </tr>
        `;
        if (countEl) countEl.textContent = '(0)';
        return;
    }

    if (countEl) countEl.textContent = `(${books.length})`;

    tbody.innerHTML = books.map(book => {
        const tenTruyen = book.ten_truyen || 'Vô Danh';
        const tacGia = book.tac_gia || 'Khuyết Danh';
        const createdAt = formatDate(book.created_at);
        const bookId = book.id;

        return `
            <tr>
                <td>
                    <div class="book-title">${tenTruyen}</div>
                </td>
                <td data-label="Tác Giả">${tacGia}</td>
                <td data-label="Thời Gian">${createdAt}</td>
                <td data-label="Trạng Thái">
                    <span class="badge-pending"><i class="fa-regular fa-clock"></i> Chờ duyệt</span>
                </td>
                <td data-label="Hành Động">
                    <button class="action-btn approve" onclick="duyetTruyen('${bookId}', 'approve')">
                        <i class="fa-solid fa-check"></i> Duyệt
                    </button>
                    <button class="action-btn reject" onclick="duyetTruyen('${bookId}', 'reject')">
                        <i class="fa-solid fa-xmark"></i> Hủy
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// =========================================================================
// 3. HÀM XỬ LÝ DUYỆT / TỪ CHỐI TRUYỆN
// =========================================================================

/**
 * duyetTruyen(bookId, action)
 * 
 * API: POST /api/admin/approve_book
 * Body: { book_id, action: 'approve' | 'reject' }
 * 
 * Sau khi thành công: cập nhật UI ngay + toast + reload lại danh sách
 */
async function duyetTruyen(bookId, action) {
    if (!bookId) return;

    const actionText = action === 'approve' ? 'Duyệt' : 'Từ chối';

    try {
        const response = await fetch(`${API_BASE}/admin/approve_book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ book_id: bookId, action })
        });
        const data = await response.json();

        if (data.success) {
            showAdminToast(`✅ ${data.message || `${actionText} thành công!`}`, 'success');
            // Reload lại danh sách pending books
            fetchDashboardStats();
        } else {
            showAdminToast(`❌ ${data.error || 'Lỗi xử lý!'}`, 'error');
        }
    } catch (error) {
        console.error(`Lỗi ${actionText} truyện:`, error);
        showAdminToast(`❌ Lỗi kết nối máy chủ!`, 'error');
    }
}

// =========================================================================
// 4. RENDER "HOẠT ĐỘNG TU TIÊN MỚI NHẤT"
// =========================================================================

/**
 * renderRecentActivities(activities)
 * 
 * Render vào <ul id="list-recent-activities">
 * 
 * Cấu trúc mỗi item:
 *   type: 'topup' | 'breakthrough' | 'register' | 'read'
 *   display_name: tên user
 *   amount: số tiền (nếu topup)
 *   action: mô tả hành động
 *   created_at: thời gian
 */
function renderRecentActivities(activities) {
    const list = document.getElementById('list-recent-activities');
    if (!list) return;

    if (!activities || activities.length === 0) {
        list.innerHTML = '<li class="text-gray-500 text-sm py-4 text-center">Chưa có hoạt động nào</li>';
        return;
    }

    // Map icon và màu sắc theo loại hoạt động
    const typeConfig = {
        topup: { icon: 'fa-solid fa-gem', color: 'text-yellow-400', label: 'Nạp KC' },
        breakthrough: { icon: 'fa-solid fa-mountain', color: 'text-purple-400', label: 'Đột phá' },
        register: { icon: 'fa-solid fa-user-plus', color: 'text-emerald-400', label: 'Đăng ký' },
        read: { icon: 'fa-solid fa-book-open', color: 'text-blue-400', label: 'Đọc truyện' }
    };

    list.innerHTML = activities.map(act => {
        const cfg = typeConfig[act.type] || { icon: 'fa-solid fa-bell', color: 'text-gray-400', label: 'Khác' };
        const userName = act.display_name || 'Đạo Hữu Vô Danh';
        const time = formatDate(act.created_at);
        let detail = act.action || '';

        // Thêm số tiền nếu có
        if (act.type === 'topup' && act.amount) {
            detail = `vừa nạp thành công ${formatNumber(act.amount)} VND`;
        }

        return `
            <li class="activity-item">
                <span class="act-icon ${cfg.color}"><i class="${cfg.icon}"></i></span>
                <div class="act-content">
                    <div class="main">
                        <span class="user-name">${userName}</span> ${detail}
                    </div>
                    <div class="time">${time}</div>
                </div>
            </li>
        `;
    }).join('');
}

// =========================================================================
// 5. RENDER: LƯỢT ĐỌC THEO THỜI GIAN
// =========================================================================

function renderViewsByTime(viewsByTime) {
    const container = document.getElementById('detailed-views-time');
    if (!container || !viewsByTime || !viewsByTime.items) return;

    container.innerHTML = viewsByTime.items.map(item => {
        const value = formatCompact(item.value);
        return `
            <div class="stat-mini-card">
                <div class="stat-mini-value">${value}</div>
                <div class="stat-mini-label">${item.label}</div>
            </div>
        `;
    }).join('');
}

// =========================================================================
// 5b. RENDER: LƯỢT XEM THEO DANH MỤC
// =========================================================================

function renderViewsByCategory(categories) {
    const container = document.getElementById('detailed-category-views');
    if (!container) return;

    if (!categories || categories.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-sm text-center py-4">Chưa có dữ liệu</div>';
        return;
    }

    // Tính max views để vẽ thanh tỷ lệ
    const maxViews = Math.max(...categories.map(c => c.total_views), 1);

    container.innerHTML = categories.map(cat => {
        const pct = (cat.total_views / maxViews * 100).toFixed(0);
        return `
            <div class="category-bar-row">
                <div class="category-bar-label">
                    <span>${cat.category_name}</span>
                    <span class="category-bar-stats">${formatCompact(cat.total_views)} (${cat.book_count} truyện)</span>
                </div>
                <div class="category-bar-track">
                    <div class="category-bar-fill" style="width:${pct}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// =========================================================================
// 5c. RENDER: DOANH THU THEO THỜI GIAN
// =========================================================================

function renderRevenueByTime(revenueByTime) {
    const container = document.getElementById('detailed-revenue-time');
    if (!container || !revenueByTime || !revenueByTime.items) return;

    // Tìm max để vẽ thanh
    const maxVal = Math.max(...revenueByTime.items.map(i => i.value), 1);

    container.innerHTML = revenueByTime.items.map(item => {
        const pct = (item.value / maxVal * 100).toFixed(0);
        return `
            <div class="stat-mini-card revenue-card">
                <div class="stat-mini-value text-yellow-400">${formatCurrency(item.value)}</div>
                <div class="stat-mini-label">${item.label}</div>
                <div class="revenue-bar-track">
                    <div class="revenue-bar-fill" style="width:${pct}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// =========================================================================
// 5d. RENDER: VIP MỚI THEO THỜI GIAN
// =========================================================================

function renderNewVipsByTime(vipsByTime) {
    const container = document.getElementById('detailed-vips-time');
    if (!container || !vipsByTime || !vipsByTime.items) return;

    const maxVal = Math.max(...vipsByTime.items.map(i => i.value), 1);

    container.innerHTML = vipsByTime.items.map(item => {
        const pct = (item.value / maxVal * 100).toFixed(0);
        return `
            <div class="stat-mini-card vip-card">
                <div class="stat-mini-value text-purple-400">${item.value}</div>
                <div class="stat-mini-label">${item.label}</div>
                <div class="vip-bar-track">
                    <div class="vip-bar-fill" style="width:${pct}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// =========================================================================
// 5e. RENDER: VIP THEO CẢNH GIỚI
// =========================================================================

function renderVipsByRealm(vipsByRealm) {
    const container = document.getElementById('detailed-vips-realm');
    if (!container) return;

    if (!vipsByRealm || vipsByRealm.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-sm text-center py-4">Chưa có dữ liệu</div>';
        return;
    }

    const maxCount = Math.max(...vipsByRealm.map(r => r.vip_count), 1);

    container.innerHTML = vipsByRealm.map(realm => {
        const pct = (realm.vip_count / maxCount * 100).toFixed(0);
        return `
            <div class="realm-row">
                <div class="realm-name">
                    <i class="fa-solid fa-mountain text-purple-400"></i> ${realm.ten_canh_gioi}
                </div>
                <div class="realm-bar-track">
                    <div class="realm-bar-fill" style="width:${pct}%"></div>
                </div>
                <div class="realm-count">${realm.vip_count}</div>
            </div>
        `;
    }).join('');
}

// =========================================================================
// 5f. RENDER: TỔNG SỐ BỔ SUNG
// =========================================================================

function renderTotals(totals) {
    const elBooks = document.getElementById('stat-total-books');
    const elChapters = document.getElementById('stat-total-chapters');
    const elVips = document.getElementById('stat-total-vips');

    if (elBooks && totals) {
        elBooks.textContent = formatNumber(totals.total_books);
        elBooks.classList.remove('skeleton-load');
    }
    if (elChapters && totals) {
        elChapters.textContent = formatNumber(totals.total_chapters);
        elChapters.classList.remove('skeleton-load');
    }
    if (elVips && totals) {
        elVips.textContent = formatNumber(totals.total_vips);
        elVips.classList.remove('skeleton-load');
    }

    // Populate sidebar overview
    const elBooksSide = document.getElementById('stat-total-books-side');
    const elChaptersSide = document.getElementById('stat-total-chapters-side');
    const elVipsSide = document.getElementById('stat-total-vips-side');
    if (elBooksSide && totals) elBooksSide.textContent = formatNumber(totals.total_books);
    if (elChaptersSide && totals) elChaptersSide.textContent = formatNumber(totals.total_chapters);
    if (elVipsSide && totals) elVipsSide.textContent = formatNumber(totals.total_vips);
}

// =========================================================================
// 6. FALLBACK KHI API CHƯA HOẠT ĐỘNG
// =========================================================================

function renderFallbackData() {
    // Stats mẫu
    const sampleStats = () => {
        const elUsers = document.getElementById('stat-total-users');
        const elViews = document.getElementById('stat-total-views');
        const elLT = document.getElementById('stat-total-linh-thach');
        const elRevenue = document.getElementById('stat-total-revenue');
        if (elUsers) { elUsers.textContent = '12,458'; elUsers.classList.remove('skeleton-load'); }
        if (elViews) { elViews.textContent = '1.2M'; elViews.classList.remove('skeleton-load'); }
        if (elLT) { elLT.textContent = '2.4M'; elLT.classList.remove('skeleton-load'); }
        if (elRevenue) { elRevenue.textContent = '86,420,000 VND'; elRevenue.classList.remove('skeleton-load'); }
    };

    // Pending books mẫu
    const samplePending = () => {
        renderPendingBooks([
            { id: '1', ten_truyen: 'Cửu Chuyển Đan Thần', tac_gia: 'Lục Thiếu Du', created_at: new Date(Date.now() - 3600000).toISOString() },
            { id: '2', ten_truyen: 'Vạn Cổ Tối Cường Tông', tac_gia: 'Phong Hỏa Hí Chư Hầu', created_at: new Date(Date.now() - 7200000).toISOString() },
            { id: '3', ten_truyen: 'Thái Cổ Kiếm Thần', tac_gia: 'Thiên Tàm Thổ Đậu', created_at: new Date(Date.now() - 86400000).toISOString() },
        ]);
    };

    // Activities mẫu
    const sampleActivities = () => {
        renderRecentActivities([
            { type: 'breakthrough', display_name: 'Độc Cô Cầu Bại', action: 'vừa đột phá Trúc Cơ', created_at: new Date(Date.now() - 300000).toISOString() },
            { type: 'topup', display_name: 'Thiên Mệnh', amount: 100000, created_at: new Date(Date.now() - 720000).toISOString() },
            { type: 'read', display_name: 'Hắc Ám Thần Vương', action: 'đọc xong chương 1256 "Cửu Chuyển Đan Thần"', created_at: new Date(Date.now() - 1080000).toISOString() },
            { type: 'register', display_name: 'Tiểu Đồng Tử', action: 'vừa gia nhập tu tiên giới', created_at: new Date(Date.now() - 1560000).toISOString() },
            { type: 'topup', display_name: 'Băng Hồ Hiền Nữ', amount: 50000, created_at: new Date(Date.now() - 2880000).toISOString() },
        ]);
    };

    sampleStats();
    samplePending();
    sampleActivities();
}

function renderDetailedFallback() {
    // Views by time fallback
    const viewsTime = document.getElementById('detailed-views-time');
    if (viewsTime) {
        viewsTime.innerHTML = `
            <div class="stat-mini-card"><div class="stat-mini-value">1,234</div><div class="stat-mini-label">24 giờ qua</div></div>
            <div class="stat-mini-card"><div class="stat-mini-value">3,567</div><div class="stat-mini-label">3 ngày qua</div></div>
            <div class="stat-mini-card"><div class="stat-mini-value">8,910</div><div class="stat-mini-label">7 ngày qua</div></div>
            <div class="stat-mini-card"><div class="stat-mini-value">45,678</div><div class="stat-mini-label">30 ngày qua</div></div>
        `;
    }

    // Category views fallback
    const catViews = document.getElementById('detailed-category-views');
    if (catViews) {
        catViews.innerHTML = `
            <div class="category-bar-row">
                <div class="category-bar-label"><span>Tiên Hiệp</span><span class="category-bar-stats">456K (120 truyện)</span></div>
                <div class="category-bar-track"><div class="category-bar-fill" style="width:100%"></div></div>
            </div>
            <div class="category-bar-row">
                <div class="category-bar-label"><span>Kiếm Hiệp</span><span class="category-bar-stats">312K (85 truyện)</span></div>
                <div class="category-bar-track"><div class="category-bar-fill" style="width:68%"></div></div>
            </div>
            <div class="category-bar-row">
                <div class="category-bar-label"><span>Ngôn Tình</span><span class="category-bar-stats">234K (62 truyện)</span></div>
                <div class="category-bar-track"><div class="category-bar-fill" style="width:51%"></div></div>
            </div>
        `;
    }

    // Revenue by time fallback
    const revTime = document.getElementById('detailed-revenue-time');
    if (revTime) {
        revTime.innerHTML = `
            <div class="stat-mini-card revenue-card"><div class="stat-mini-value text-yellow-400">1,200,000 ₫</div><div class="stat-mini-label">24 giờ qua</div></div>
            <div class="stat-mini-card revenue-card"><div class="stat-mini-value text-yellow-400">3,500,000 ₫</div><div class="stat-mini-label">3 ngày qua</div></div>
            <div class="stat-mini-card revenue-card"><div class="stat-mini-value text-yellow-400">8,900,000 ₫</div><div class="stat-mini-label">7 ngày qua</div></div>
            <div class="stat-mini-card revenue-card"><div class="stat-mini-value text-yellow-400">42,000,000 ₫</div><div class="stat-mini-label">30 ngày qua</div></div>
        `;
    }

    // VIPs by time fallback
    const vipsTime = document.getElementById('detailed-vips-time');
    if (vipsTime) {
        vipsTime.innerHTML = `
            <div class="stat-mini-card vip-card"><div class="stat-mini-value text-purple-400">5</div><div class="stat-mini-label">24 giờ qua</div></div>
            <div class="stat-mini-card vip-card"><div class="stat-mini-value text-purple-400">12</div><div class="stat-mini-label">3 ngày qua</div></div>
            <div class="stat-mini-card vip-card"><div class="stat-mini-value text-purple-400">28</div><div class="stat-mini-label">7 ngày qua</div></div>
            <div class="stat-mini-card vip-card"><div class="stat-mini-value text-purple-400">156</div><div class="stat-mini-label">30 ngày qua</div></div>
        `;
    }

    // VIPs by realm fallback
    const vipsRealm = document.getElementById('detailed-vips-realm');
    if (vipsRealm) {
        vipsRealm.innerHTML = `
            <div class="realm-row"><div class="realm-name"><i class="fa-solid fa-mountain text-purple-400"></i> Kim Đan</div><div class="realm-bar-track"><div class="realm-bar-fill" style="width:100%"></div></div><div class="realm-count">45</div></div>
            <div class="realm-row"><div class="realm-name"><i class="fa-solid fa-mountain text-purple-400"></i> Nguyên Anh</div><div class="realm-bar-track"><div class="realm-bar-fill" style="width:62%"></div></div><div class="realm-count">28</div></div>
            <div class="realm-row"><div class="realm-name"><i class="fa-solid fa-mountain text-purple-400"></i> Hóa Thần</div><div class="realm-bar-track"><div class="realm-bar-fill" style="width:33%"></div></div><div class="realm-count">15</div></div>
        `;
    }

    // Totals fallback
    const elBooks = document.getElementById('stat-total-books');
    const elChapters = document.getElementById('stat-total-chapters');
    const elVips = document.getElementById('stat-total-vips');
    if (elBooks) { elBooks.textContent = '1,234'; elBooks.classList.remove('skeleton-load'); }
    if (elChapters) { elChapters.textContent = '56,789'; elChapters.classList.remove('skeleton-load'); }
    if (elVips) { elVips.textContent = '156'; elVips.classList.remove('skeleton-load'); }
}

// =========================================================================
// 7. SIDEBAR UTILITIES
// =========================================================================

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('show');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');
}

// =========================================================================
// 8. KHỞI TẠO
// =========================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🧘 AloTruyen Admin Panel');
    console.log('📊 Đang tải dữ liệu Dashboard...');

    // Fetch dữ liệu thật từ API
    await Promise.all([
        fetchDashboardStats(),
        fetchDetailedStats()
    ]);
});