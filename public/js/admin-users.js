/**
 * admin-users.js - Quản Lý Đạo Hữu (User Management)
 *
 * APIs:
 *   GET  /api/admin/users?search=&role=&is_vip=&is_injured=&page=&limit=
 *   POST /api/admin/users/adjust-balance
 *   POST /api/admin/users/injure
 *   POST /api/admin/users/heal
 */

const API_BASE = '/api';
let currentPage = 1;
let currentFilters = { search: '', role: '', is_vip: '', is_injured: '' };
let pendingModalAction = null;

// =========================================================================
// UTILITY
// =========================================================================

function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString('vi-VN');
}

function formatCompact(num) {
    if (!num) return '0';
    const n = Number(num);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return formatNumber(n);
}

function showToast(message, type = 'success') {
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
// MODAL
// =========================================================================

function openModal(title, message, confirmText, confirmClass, actionFn) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    const confirmBtn = document.getElementById('modal-confirm-btn');
    confirmBtn.textContent = confirmText || 'Xác nhận';
    confirmBtn.className = `modal-btn ${confirmClass || 'danger'}`;
    pendingModalAction = actionFn;
    document.getElementById('modal-overlay').classList.add('show');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('show');
    pendingModalAction = null;
}

function confirmModalAction() {
    if (typeof pendingModalAction === 'function') pendingModalAction();
    closeModal();
}

// =========================================================================
// SIDEBAR
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
// FETCH USERS
// =========================================================================

async function fetchUsers(page = 1) {
    const tbody = document.getElementById('users-table-body');
    const countEl = document.getElementById('users-count');
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang tải dữ liệu...</td></tr>';

    try {
        const params = new URLSearchParams();
        params.set('page', page);
        params.set('limit', '20');
        if (currentFilters.search) params.set('search', currentFilters.search);
        if (currentFilters.role) params.set('role', currentFilters.role);
        if (currentFilters.is_vip) params.set('is_vip', currentFilters.is_vip);
        if (currentFilters.is_injured) params.set('is_injured', currentFilters.is_injured);

        console.log('Fetching users with params:', params.toString());
        const response = await fetch(`${API_BASE}/admin/users?${params.toString()}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API error response:', errorText);
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-gray-500 py-10">❌ Lỗi máy chủ (HTTP ${response.status})</td></tr>`;
            return;
        }
        
        const data = await response.json();

        if (!data || !data.success) {
            const errorMsg = data?.error || 'Lỗi không xác định';
            console.error('API returned error:', errorMsg);
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-gray-500 py-10">❌ ${errorMsg}</td></tr>`;
            return;
        }

        const users = data.users || [];
        const pagination = data.pagination || { page: 1, total: 0, total_pages: 1 };

        if (countEl) countEl.textContent = `(${formatNumber(pagination.total)} đạo hữu)`;

        currentPage = pagination.page;
        if (pageInfo) pageInfo.textContent = `Trang ${pagination.page} / ${pagination.total_pages || 1}`;
        if (prevBtn) prevBtn.disabled = pagination.page <= 1;
        if (nextBtn) nextBtn.disabled = pagination.page >= pagination.total_pages;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-500 py-10"><i class="fa-solid fa-inbox text-2xl block mb-2 opacity-50"></i>Không tìm thấy đạo hữu nào</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => {
            const initials = (user.display_name || '?').charAt(0).toUpperCase();
            const roleClass = `role-${user.role || 'reader'}`;
            const roleIcon = user.role === 'admin' ? '🛡️' : user.role === 'author' ? '✍️' : '📖';
            const roleName = user.role === 'admin' ? 'Admin' : user.role === 'author' ? 'Tác giả' : 'Độc giả';
            const isVip = user.is_vip === true || user.is_vip === 'true' || user.is_vip === 1;
            const isInjured = user.is_injured === true || user.is_injured === 'true' || user.is_injured === 1;
            const realmName = user.ten_canh_gioi || 'Không';

            // Tính thời gian còn lại nếu bị thương
            let injuredInfo = '';
            if (isInjured && user.injured_until) {
                const until = new Date(user.injured_until);
                const now = new Date();
                const hoursLeft = Math.max(0, Math.ceil((until - now) / 3600000));
                injuredInfo = hoursLeft > 0 ? ` (${hoursLeft}h)` : '';
            }

            return `
                <tr>
                    <td data-label="Đạo Hữu">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div class="user-avatar">${initials}</div>
                            <div>
                                <div style="font-weight:600;color:#f1f5f9;font-size:13px;">${user.display_name || 'Vô Danh'}</div>
                                <div style="font-size:10px;color:#6b7280;">${user.dao_hieu || ''}</div>
                            </div>
                        </div>
                    </td>
                    <td data-label="Email" style="font-size:12px;color:#9ca3af;">${user.email || '—'}</td>
                    <td data-label="Cảnh Giới"><span class="realm-badge">${realmName}</span></td>
                    <td data-label="Linh Thạch" style="font-weight:600;color:#fbbf24;">${formatCompact(user.linh_thach)}</td>
                    <td data-label="Kim Cương" style="font-weight:600;color:#c084fc;">${formatCompact(user.kim_cuong)}</td>
                    <td data-label="EXP" style="color:#60a5fa;">${formatCompact(user.tu_vi_exp)}</td>
                    <td data-label="VIP">
                        <span class="badge ${isVip ? 'vip' : ''}" style="${!isVip ? 'opacity:0.3;' : ''}">
                            <i class="fa-solid fa-crown"></i> ${isVip ? 'VIP' : 'Thường'}
                        </span>
                    </td>
                    <td data-label="Trạng Thái">
                        ${isInjured
                            ? `<span class="badge injured"><i class="fa-solid fa-skull"></i> Trọng thương${injuredInfo}</span>`
                            : `<span class="badge healthy"><i class="fa-solid fa-heart"></i> Bình thường</span>`
                        }
                        <span class="badge ${roleClass}">${roleIcon} ${roleName}</span>
                    </td>
                    <td data-label="Hành Động">
                        <div class="action-btn-group" style="flex-direction:column;gap:3px;">
                            <button class="action-btn balance" onclick="openBalanceModal('${user.id}', '${user.display_name || 'Vô Danh'}')" title="Can thiệp tài sản">
                                <i class="fa-solid fa-coins"></i> Tài sản
                            </button>
                            ${isInjured
                                ? `<button class="action-btn heal" onclick="healUser('${user.id}')" title="Hồi phục"><i class="fa-solid fa-heart-circle-check"></i> Hồi phục</button>`
                                : `<button class="action-btn injure" onclick="openInjureModal('${user.id}', '${user.display_name || 'Vô Danh'}')" title="Đả thương"><i class="fa-solid fa-skull"></i> Đả thương</button>`
                            }
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Lỗi fetch users:', error);
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-500 py-10">❌ Lỗi kết nối máy chủ</td></tr>';
    }
}

// =========================================================================
// FILTERS
// =========================================================================

function applyFilters() {
    currentFilters.search = document.getElementById('search-input')?.value || '';
    currentFilters.role = document.getElementById('role-filter')?.value || '';
    currentFilters.is_vip = document.getElementById('vip-filter')?.value || '';
    currentFilters.is_injured = document.getElementById('injured-filter')?.value || '';
    currentPage = 1;
    fetchUsers(1);
}

function resetFilters() {
    const searchInput = document.getElementById('search-input');
    const roleFilter = document.getElementById('role-filter');
    const vipFilter = document.getElementById('vip-filter');
    const injuredFilter = document.getElementById('injured-filter');
    if (searchInput) searchInput.value = '';
    if (roleFilter) roleFilter.value = '';
    if (vipFilter) vipFilter.value = '';
    if (injuredFilter) injuredFilter.value = '';
    currentFilters = { search: '', role: '', is_vip: '', is_injured: '' };
    currentPage = 1;
    fetchUsers(1);
}

function goToPage(page) {
    if (page < 1) return;
    fetchUsers(page);
}

// =========================================================================
// BALANCE MODAL
// =========================================================================

function openBalanceModal(userId, displayName) {
    document.getElementById('balance-user-id').value = userId;
    document.getElementById('balance-user-name').textContent = `👤 ${displayName}`;
    document.getElementById('bal-lt').value = 0;
    document.getElementById('bal-kc').value = 0;
    document.getElementById('bal-exp').value = 0;
    document.getElementById('balance-modal-overlay').style.display = 'block';
}

function closeBalanceModal() {
    document.getElementById('balance-modal-overlay').style.display = 'none';
}

async function saveBalance() {
    const userId = document.getElementById('balance-user-id').value;
    const lt = parseInt(document.getElementById('bal-lt').value) || 0;
    const kc = parseInt(document.getElementById('bal-kc').value) || 0;
    const exp = parseInt(document.getElementById('bal-exp').value) || 0;

    if (lt === 0 && kc === 0 && exp === 0) {
        showToast('❌ Vui lòng nhập ít nhất một giá trị!', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/users/adjust-balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                linh_thach: lt,
                kim_cuong: kc,
                tu_vi_exp: exp
            })
        });

        const data = await response.json();
        if (data.success) {
            showToast(data.message || '✅ Đã điều chỉnh tài sản!', 'success');
            closeBalanceModal();
            fetchUsers(currentPage);
        } else {
            showToast(`❌ ${data.error || 'Lỗi!'}`, 'error');
        }
    } catch (error) {
        showToast('❌ Lỗi kết nối máy chủ!', 'error');
    }
}

// =========================================================================
// INJURE MODAL
// =========================================================================

function openInjureModal(userId, displayName) {
    document.getElementById('injure-user-id').value = userId;
    document.getElementById('injure-user-name').textContent = `👤 ${displayName}`;
    document.getElementById('injure-days').value = 1;
    document.getElementById('injure-modal-overlay').style.display = 'block';
}

function closeInjureModal() {
    document.getElementById('injure-modal-overlay').style.display = 'none';
}

async function confirmInjure() {
    const userId = document.getElementById('injure-user-id').value;
    const days = parseInt(document.getElementById('injure-days').value) || 1;

    if (days < 1) {
        showToast('❌ Số ngày phải >= 1!', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/users/injure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, days: days })
        });

        const data = await response.json();
        if (data.success) {
            showToast(data.message || '✅ Đã đả thương!', 'success');
            closeInjureModal();
            fetchUsers(currentPage);
        } else {
            showToast(`❌ ${data.error || 'Lỗi!'}`, 'error');
        }
    } catch (error) {
        showToast('❌ Lỗi kết nối máy chủ!', 'error');
    }
}

// =========================================================================
// HEAL USER
// =========================================================================

async function healUser(userId) {
    openModal(
        '🩹 Hồi phục đạo hữu',
        'Bạn có chắc chắn muốn hồi phục (bỏ trạng thái trọng thương) cho đạo hữu này?',
        'Hồi phục',
        'primary',
        async () => {
            try {
                const response = await fetch(`${API_BASE}/admin/users/heal`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId })
                });

                const data = await response.json();
                if (data.success) {
                    showToast(data.message || '✅ Đã hồi phục!', 'success');
                    fetchUsers(currentPage);
                } else {
                    showToast(`❌ ${data.error || 'Lỗi!'}`, 'error');
                }
            } catch (error) {
                showToast('❌ Lỗi kết nối máy chủ!', 'error');
            }
        }
    );
}

// =========================================================================
// KEYBOARD SHORTCUTS
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyFilters();
        });
    }

    fetchUsers(1);
});