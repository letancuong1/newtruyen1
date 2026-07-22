/**
 * admin-billing.js - Quản Lý Giao Dịch & Gói Nạp
 *
 * APIs:
 *   GET  /api/admin/transactions?search=&status=&page=&limit=
 *   POST /api/admin/transactions/approve
 *   GET  /api/admin/packages
 *   POST /api/admin/packages
 *   PUT  /api/admin/packages/:id
 *   DELETE /api/admin/packages/:id
 */

const API_BASE = '/api';
let currentTxPage = 1;
let currentTxFilters = { search: '', status: '' };
let currentPkgPage = 1;
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
// TABS
// =========================================================================

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab-btn[onclick*="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');

    if (tab === 'packages' && document.getElementById('pkg-table-body').children.length <= 1) {
        fetchPackages();
    }
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
// FETCH TRANSACTIONS
// =========================================================================

async function fetchTransactions(page = 1) {
    const tbody = document.getElementById('tx-table-body');
    const countEl = document.getElementById('tx-count');
    const pageInfo = document.getElementById('tx-page-info');
    const prevBtn = document.getElementById('tx-prev-page');
    const nextBtn = document.getElementById('tx-next-page');

    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang tải...</td></tr>';

    try {
        const params = new URLSearchParams();
        params.set('page', page);
        params.set('limit', '20');
        if (currentTxFilters.search) params.set('search', currentTxFilters.search);
        if (currentTxFilters.status) params.set('status', currentTxFilters.status);

        const response = await fetch(`${API_BASE}/admin/transactions?${params.toString()}`);
        const data = await response.json();

        if (!data || !data.success) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10">❌ Lỗi tải dữ liệu</td></tr>';
            return;
        }

        const txs = data.transactions || [];
        const pagination = data.pagination || { page: 1, total: 0, total_pages: 1 };

        if (countEl) countEl.textContent = `(${formatNumber(pagination.total)} giao dịch)`;

        currentTxPage = pagination.page;
        if (pageInfo) pageInfo.textContent = `Trang ${pagination.page} / ${pagination.total_pages || 1}`;
        if (prevBtn) prevBtn.disabled = pagination.page <= 1;
        if (nextBtn) nextBtn.disabled = pagination.page >= pagination.total_pages;

        if (txs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10"><i class="fa-solid fa-inbox text-2xl block mb-2 opacity-50"></i>Không có giao dịch</td></tr>';
            return;
        }

        tbody.innerHTML = txs.map(tx => {
            const status = (tx.status || 'PENDING').toUpperCase();
            const statusClass = status === 'SUCCESS' ? 'success' : status === 'PENDING' ? 'pending' : 'failed';
            const statusText = status === 'SUCCESS' ? '✅ Thành công' : status === 'PENDING' ? '⏳ Chờ duyệt' : '❌ Thất bại';
            const amountVnd = parseInt(tx.amount_vnd) || 0;
            const kimCuong = parseInt(tx.kim_cuong_added) || 0;
            const time = tx.created_at ? new Date(tx.created_at).toLocaleString('vi-VN') : '—';
            const shortId = tx.id ? tx.id.toString().substring(0, 8) + '...' : '—';

            return `
                <tr>
                    <td data-label="Mã GD" style="font-size:11px;font-family:monospace;color:#9ca3af;">${shortId}</td>
                    <td data-label="Đạo Hữu">
                        <div style="font-weight:600;color:#f1f5f9;font-size:13px;">${tx.display_name || 'Đạo Hữu'}</div>
                        <div style="font-size:10px;color:#6b7280;">${tx.email || ''}</div>
                    </td>
                    <td data-label="Số Tiền" style="font-weight:600;color:#fbbf24;">${formatCompact(amountVnd)}đ</td>
                    <td data-label="Kim Cương" style="font-weight:600;color:#c084fc;">${formatNumber(kimCuong)} KC</td>
                    <td data-label="Phương Thức" style="font-size:12px;">${tx.payment_method || '—'}</td>
                    <td data-label="Trạng Thái"><span class="badge ${statusClass}">${statusText}</span></td>
                    <td data-label="Thời Gian" style="font-size:11px;color:#6b7280;">${time}</td>
                    <td data-label="Hành Động">
                        ${status === 'PENDING' || !status
                            ? `<button class="action-btn approve" onclick="approveTransaction('${tx.id}')"><i class="fa-solid fa-check"></i> Duyệt</button>`
                            : `<span style="color:#6b7280;font-size:11px;">—</span>`
                        }
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Lỗi fetch transactions:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10">❌ Lỗi kết nối máy chủ</td></tr>';
    }
}

function applyTxFilters() {
    currentTxFilters.search = document.getElementById('tx-search')?.value || '';
    currentTxFilters.status = document.getElementById('tx-status-filter')?.value || '';
    currentTxPage = 1;
    fetchTransactions(1);
}

function resetTxFilters() {
    const searchInput = document.getElementById('tx-search');
    const statusFilter = document.getElementById('tx-status-filter');
    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = '';
    currentTxFilters = { search: '', status: '' };
    currentTxPage = 1;
    fetchTransactions(1);
}

function goToTxPage(page) {
    if (page < 1) return;
    fetchTransactions(page);
}

// =========================================================================
// APPROVE TRANSACTION
// =========================================================================

function approveTransaction(txId) {
    openModal(
        '✅ Duyệt giao dịch thủ công',
        'Xác nhận duyệt giao dịch này? Hệ thống sẽ cộng Kim Cương vào tài khoản người dùng.',
        'Duyệt',
        'primary',
        async () => {
            try {
                const response = await fetch(`${API_BASE}/admin/transactions/approve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transaction_id: txId })
                });
                const data = await response.json();
                if (data.success) {
                    showToast(data.message || '✅ Duyệt thành công!', 'success');
                    fetchTransactions(currentTxPage);
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
// FETCH PACKAGES
// =========================================================================

async function fetchPackages() {
    const tbody = document.getElementById('pkg-table-body');
    const countEl = document.getElementById('pkg-count');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang tải...</td></tr>';

    try {
        const response = await fetch(`${API_BASE}/admin/packages`);
        const data = await response.json();

        if (!data || !data.success) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-500 py-10">❌ Lỗi tải dữ liệu</td></tr>';
            return;
        }

        const packages = data.packages || [];
        if (countEl) countEl.textContent = `(${formatNumber(packages.length)} gói)`;

        if (packages.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-500 py-10"><i class="fa-solid fa-inbox text-2xl block mb-2 opacity-50"></i>Chưa có gói nạp nào</td></tr>';
            return;
        }

        tbody.innerHTML = packages.map(pkg => {
            const isActive = pkg.is_active === true || pkg.is_active === 'true' || pkg.is_active === 1;
            const typeLabel = pkg.type === 'vip' ? '👑 VIP' : '💎 Kim Cương';
            const valueLabel = pkg.type === 'vip' ? `${pkg.value} ngày` : `${formatNumber(pkg.value)} KC`;

            return `
                <tr>
                    <td data-label="ID" style="color:#6b7280;">${pkg.id}</td>
                    <td data-label="Tên Gói" style="font-weight:600;color:#f1f5f9;">${pkg.name || 'Không tên'}</td>
                    <td data-label="Loại">${typeLabel}</td>
                    <td data-label="Giá" style="font-weight:600;color:#fbbf24;">${formatCompact(pkg.price)}đ</td>
                    <td data-label="Giá Trị" style="font-weight:600;color:#c084fc;">${valueLabel}</td>
                    <td data-label="Trạng Thái">
                        <span class="badge ${isActive ? 'active' : 'inactive'}">
                            ${isActive ? '✅ Hoạt động' : '❌ Tắt'}
                        </span>
                    </td>
                    <td data-label="Hành Động">
                        <div class="action-btn-group">
                            <button class="action-btn edit" onclick="editPackage(${pkg.id})"><i class="fa-solid fa-pen"></i></button>
                            <button class="action-btn delete" onclick="deletePackage(${pkg.id})"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Lỗi fetch packages:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-500 py-10">❌ Lỗi kết nối máy chủ</td></tr>';
    }
}

// =========================================================================
// PACKAGE CRUD
// =========================================================================

function openAddPackageModal() {
    document.getElementById('pkg-modal-title').innerHTML = '<i class="fa-solid fa-plus text-emerald-400"></i> Thêm Gói Nạp Mới';
    document.getElementById('pkg-edit-id').value = '';
    document.getElementById('pkg-name').value = '';
    document.getElementById('pkg-type').value = 'kim_cuong';
    document.getElementById('pkg-active').value = 'true';
    document.getElementById('pkg-price').value = '';
    document.getElementById('pkg-value').value = '';
    document.getElementById('pkg-desc').value = '';
    document.getElementById('pkg-modal-overlay').style.display = 'block';
}

function closePkgModal() {
    document.getElementById('pkg-modal-overlay').style.display = 'none';
}

async function savePackage() {
    const editId = document.getElementById('pkg-edit-id').value;
    const name = document.getElementById('pkg-name').value.trim();
    const type = document.getElementById('pkg-type').value;
    const isActive = document.getElementById('pkg-active').value === 'true';
    const price = parseInt(document.getElementById('pkg-price').value);
    const value = parseInt(document.getElementById('pkg-value').value);
    const description = document.getElementById('pkg-desc').value.trim();

    if (!name) { showToast('❌ Vui lòng nhập tên gói!', 'error'); return; }
    if (!price || price < 0) { showToast('❌ Giá không hợp lệ!', 'error'); return; }
    if (!value || value < 0) { showToast('❌ Giá trị không hợp lệ!', 'error'); return; }

    try {
        let url, method, successMsg;

        if (editId) {
            url = `${API_BASE}/admin/packages/${editId}`;
            method = 'PUT';
            successMsg = '✅ Cập nhật gói thành công!';
        } else {
            url = `${API_BASE}/admin/packages`;
            method = 'POST';
            successMsg = '✅ Thêm gói thành công!';
        }

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, price, value, description, is_active: isActive })
        });

        const data = await response.json();
        if (data.success) {
            showToast(data.message || successMsg, 'success');
            closePkgModal();
            fetchPackages();
        } else {
            showToast(`❌ ${data.error || 'Lỗi!'}`, 'error');
        }
    } catch (error) {
        showToast('❌ Lỗi kết nối máy chủ!', 'error');
    }
}

async function editPackage(pkgId) {
    try {
        const response = await fetch(`${API_BASE}/admin/packages`);
        const data = await response.json();
        if (!data.success || !data.packages) { showToast('❌ Không thể tải thông tin gói!', 'error'); return; }

        const pkg = data.packages.find(p => p.id == pkgId);
        if (!pkg) { showToast('❌ Không tìm thấy gói!', 'error'); return; }

        document.getElementById('pkg-modal-title').innerHTML = '<i class="fa-solid fa-pen text-blue-400"></i> Chỉnh Sửa Gói Nạp';
        document.getElementById('pkg-edit-id').value = pkg.id;
        document.getElementById('pkg-name').value = pkg.name || '';
        document.getElementById('pkg-type').value = pkg.type || 'kim_cuong';
        document.getElementById('pkg-active').value = (pkg.is_active === true || pkg.is_active === 1 || pkg.is_active === 'true') ? 'true' : 'false';
        document.getElementById('pkg-price').value = pkg.price || 0;
        document.getElementById('pkg-value').value = pkg.value || 0;
        document.getElementById('pkg-desc').value = pkg.description || '';
        document.getElementById('pkg-modal-overlay').style.display = 'block';

    } catch (error) {
        showToast('❌ Lỗi kết nối máy chủ!', 'error');
    }
}

function deletePackage(pkgId) {
    openModal(
        '🗑️ Xóa gói nạp',
        'Bạn có chắc chắn muốn xóa gói nạp này?',
        'Xóa',
        'danger',
        async () => {
            try {
                const response = await fetch(`${API_BASE}/admin/packages/${pkgId}`, { method: 'DELETE' });
                const data = await response.json();
                if (data.success) {
                    showToast(data.message || '✅ Đã xóa gói!', 'success');
                    fetchPackages();
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
    const searchInput = document.getElementById('tx-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyTxFilters();
        });
    }

    fetchTransactions(1);
});