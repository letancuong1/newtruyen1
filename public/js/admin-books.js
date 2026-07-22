/**
 * admin-books.js - Quản Lý Truyện (Book Management)
 * 
 * Kết nối API backend:
 *   GET  /api/admin/books?search=&status=&is_vip=&page=&limit=
 *   POST /api/admin/books/update-status
 *   POST /api/admin/books/toggle-vip
 *   POST /api/admin/books/delete
 */

const API_BASE = '/api';
let currentPage = 1;
let currentFilters = { search: '', status: '', is_vip: '' };
let pendingModalAction = null; // Holds the function to execute on modal confirm

// =========================================================================
// UTILITY FUNCTIONS
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

function getStatusBadgeClass(status) {
    if (!status) return 'default';
    const s = status.toLowerCase();
    if (s.includes('chờ') || s.includes('pending')) return 'pending';
    if (s.includes('duyệt') && !s.includes('từ chối')) return 'active';
    if (s.includes('từ chối') || s.includes('reject')) return 'rejected';
    if (s.includes('xóa') || s.includes('delete')) return 'deleted';
    if (s.includes('hoàn thành') || s.includes('full') || s.includes('completed')) return 'completed';
    return 'default';
}

function getStatusIcon(status) {
    if (!status) return 'fa-circle';
    const s = status.toLowerCase();
    if (s.includes('chờ') || s.includes('pending')) return 'fa-clock';
    if (s.includes('duyệt') && !s.includes('từ chối')) return 'fa-check-circle';
    if (s.includes('từ chối') || s.includes('reject')) return 'fa-times-circle';
    if (s.includes('xóa') || s.includes('delete')) return 'fa-trash';
    if (s.includes('hoàn thành') || s.includes('full') || s.includes('completed')) return 'fa-trophy';
    return 'fa-circle';
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
    if (typeof pendingModalAction === 'function') {
        pendingModalAction();
    }
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
// FETCH BOOKS
// =========================================================================

async function fetchBooks(page = 1) {
    const tbody = document.getElementById('books-table-body');
    const countEl = document.getElementById('books-count');
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (!tbody) return;

    // Show loading
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang tải dữ liệu...</td></tr>';

    try {
        const params = new URLSearchParams();
        params.set('page', page);
        params.set('limit', '20');
        if (currentFilters.search) params.set('search', currentFilters.search);
        if (currentFilters.status) params.set('status', currentFilters.status);
        if (currentFilters.is_vip) params.set('is_vip', currentFilters.is_vip);

        const response = await fetch(`${API_BASE}/admin/books?${params.toString()}`);
        const data = await response.json();

        if (!data || !data.success) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10">❌ Lỗi tải dữ liệu</td></tr>';
            return;
        }

        const books = data.books || [];
        const pagination = data.pagination || { page: 1, total: 0, total_pages: 1 };

        // Update count
        if (countEl) countEl.textContent = `(${formatNumber(pagination.total)} truyện)`;

        // Update pagination info
        currentPage = pagination.page;
        if (pageInfo) pageInfo.textContent = `Trang ${pagination.page} / ${pagination.total_pages || 1}`;
        if (prevBtn) prevBtn.disabled = pagination.page <= 1;
        if (nextBtn) nextBtn.disabled = pagination.page >= pagination.total_pages;

        if (books.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10"><i class="fa-solid fa-inbox text-2xl block mb-2 opacity-50"></i>Không tìm thấy truyện nào</td></tr>';
            return;
        }

        // Render rows
        tbody.innerHTML = books.map(book => {
            const statusClass = getStatusBadgeClass(book.trang_thai);
            const statusIcon = getStatusIcon(book.trang_thai);
            const displayStatus = book.trang_thai || 'Chưa xác định';
            const isVip = book.is_vip === true || book.is_vip === 'true' || book.is_vip === 1;
            const coverImg = book.anh_bia || 'https://via.placeholder.com/36x48/1a1635/6b7280?text=N/A';
            const slug = book.slug || book.id;

            return `
                <tr>
                    <td data-label="Ảnh">
                        <img class="book-cover" src="${coverImg}" alt="${book.ten_truyen}" loading="lazy" onerror="this.src='https://via.placeholder.com/36x48/1a1635/6b7280?text=N/A'" />
                    </td>
                    <td data-label="Truyện">
                        <div class="book-info">
                            <div>
                                <a href="/chi-tiet-truyen.html?slug=${slug}" target="_blank" class="book-title-link">${book.ten_truyen || 'Vô Danh'}</a>
                            </div>
                        </div>
                    </td>
                    <td data-label="Tác Giả">${book.tac_gia || 'Khuyết Danh'}</td>
                    <td data-label="Trạng Thái">
                        <span class="badge-status ${statusClass}">
                            <i class="fa-regular ${statusIcon}"></i> ${displayStatus}
                        </span>
                    </td>
                    <td data-label="VIP">
                        <span class="badge-vip ${isVip ? '' : 'off'}">
                            <i class="fa-solid fa-crown"></i> ${isVip ? 'VIP' : 'Thường'}
                        </span>
                    </td>
                    <td data-label="Số Chương">${formatNumber(book.so_chuong)}</td>
                    <td data-label="Lượt Xem">${formatCompact(book.luot_xem)}</td>
                    <td data-label="Hành Động">
                        <div class="action-btn-group">
                            <button class="action-btn edit" onclick="editBook('${book.id}')" title="Sửa thông tin">
                                <i class="fa-solid fa-pen"></i> Sửa
                            </button>
                            <button class="action-btn chapters" onclick="manageChapters('${book.id}')" title="Quản lý chương">
                                <i class="fa-solid fa-list"></i> Chương
                            </button>
                            <button class="action-btn vip-toggle" onclick="toggleVip('${book.id}', ${isVip})" title="${isVip ? 'Tắt VIP' : 'Bật VIP'}">
                                <i class="fa-solid fa-crown"></i>
                            </button>
                            <button class="action-btn delete" onclick="deleteBook('${book.id}')" title="Xóa truyện">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Lỗi fetch books:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10">❌ Lỗi kết nối máy chủ</td></tr>';
    }
}

// =========================================================================
// FILTERS
// =========================================================================

function applyFilters() {
    currentFilters.search = document.getElementById('search-input')?.value || '';
    currentFilters.status = document.getElementById('status-filter')?.value || '';
    currentFilters.is_vip = document.getElementById('vip-filter')?.value || '';
    currentPage = 1;
    fetchBooks(1);
}

function resetFilters() {
    const searchInput = document.getElementById('search-input');
    const statusFilter = document.getElementById('status-filter');
    const vipFilter = document.getElementById('vip-filter');
    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = '';
    if (vipFilter) vipFilter.value = '';
    currentFilters = { search: '', status: '', is_vip: '' };
    currentPage = 1;
    fetchBooks(1);
}

function goToPage(page) {
    if (page < 1) return;
    fetchBooks(page);
}

// =========================================================================
// ACTIONS
// =========================================================================

async function editBook(bookId) {
    try {
        // Fetch full book details
        const response = await fetch(`${API_BASE}/get_book_detail?id=${bookId}`);
        const data = await response.json();

        if (!data || !data.success || !data.book) {
            showToast('❌ Không thể tải thông tin truyện!', 'error');
            return;
        }

        const book = data.book;

        // Fill form
        document.getElementById('edit-book-id').value = book.id;
        document.getElementById('edit-book-name').value = book.ten_truyen || '';
        document.getElementById('edit-book-author').value = book.tac_gia || '';
        document.getElementById('edit-book-cover').value = book.anh_bia || '';
        document.getElementById('edit-book-slug').value = book.slug || '';
        document.getElementById('edit-book-source').value = book.nguon || '';
        document.getElementById('edit-book-link').value = book.link_goc || '';
        document.getElementById('edit-book-desc').value = book.gioi_thieu || '';

        // Status
        const statusSelect = document.getElementById('edit-book-status');
        const statusMap = {
            'chờ': 'chờ',
            'đã duyệt': 'đã duyệt',
            'đã từ chối': 'đã từ chối',
            'đã xóa': 'đã xóa',
            'hoàn thành': 'hoàn thành'
        };
        const currentStatus = (book.trang_thai || '').toLowerCase();
        const matchedValue = Object.keys(statusMap).find(k => currentStatus.includes(k));
        if (matchedValue) {
            statusSelect.value = matchedValue;
        }

        // Categories (the_loai is an array)
        const categoriesInput = document.getElementById('edit-book-categories');
        if (Array.isArray(book.the_loai)) {
            categoriesInput.value = book.the_loai.join(', ');
        } else if (typeof book.the_loai === 'string') {
            categoriesInput.value = book.the_loai;
        }

        // Show modal
        document.getElementById('edit-modal-overlay').style.display = 'block';

    } catch (error) {
        console.error('Lỗi tải thông tin truyện:', error);
        showToast('❌ Lỗi kết nối máy chủ!', 'error');
    }
}

function closeEditModal() {
    document.getElementById('edit-modal-overlay').style.display = 'none';
}

async function saveBookEdit() {
    const bookId = document.getElementById('edit-book-id').value;
    const ten_truyen = document.getElementById('edit-book-name').value.trim();
    const tac_gia = document.getElementById('edit-book-author').value.trim();
    const anh_bia = document.getElementById('edit-book-cover').value.trim();
    const slug = document.getElementById('edit-book-slug').value.trim();
    const trang_thai = document.getElementById('edit-book-status').value;
    const categoriesStr = document.getElementById('edit-book-categories').value.trim();
    const nguon = document.getElementById('edit-book-source').value.trim();
    const link_goc = document.getElementById('edit-book-link').value.trim();
    const gioi_thieu = document.getElementById('edit-book-desc').value.trim();

    if (!ten_truyen) {
        showToast('❌ Vui lòng nhập tên truyện!', 'error');
        return;
    }

    // Parse categories into array
    const the_loai = categoriesStr ? categoriesStr.split(',').map(s => s.trim()).filter(s => s) : [];

    try {
        const response = await fetch(`${API_BASE}/admin/books/${bookId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ten_truyen,
                tac_gia: tac_gia || 'Khuyết Danh',
                anh_bia,
                slug,
                trang_thai,
                the_loai,
                nguon,
                link_goc,
                gioi_thieu
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(data.message || '✅ Cập nhật truyện thành công!', 'success');
            closeEditModal();
            fetchBooks(currentPage);
        } else {
            showToast(`❌ ${data.error || 'Lỗi!'}`, 'error');
        }
    } catch (error) {
        showToast('❌ Lỗi kết nối máy chủ!', 'error');
    }
}

function manageChapters(bookId) {
    window.location.href = `admin-chapters.html?book_id=${bookId}`;
}

function toggleVip(bookId, currentVip) {
    const newVip = !currentVip;
    const actionText = newVip ? 'bật VIP' : 'tắt VIP';

    openModal(
        `Xác nhận ${actionText}`,
        `Bạn có chắc chắn muốn ${actionText} cho truyện này?`,
        'Xác nhận',
        'primary',
        async () => {
            try {
                const response = await fetch(`${API_BASE}/admin/books/toggle-vip`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ book_id: bookId, is_vip: newVip })
                });
                const data = await response.json();
                if (data.success) {
                    showToast(data.message || `✅ ${actionText} thành công!`, 'success');
                    fetchBooks(currentPage);
                } else {
                    showToast(`❌ ${data.error || 'Lỗi!'}`, 'error');
                }
            } catch (error) {
                showToast('❌ Lỗi kết nối máy chủ!', 'error');
            }
        }
    );
}

function deleteBook(bookId) {
    openModal(
        '🗑️ Xóa truyện',
        'Bạn có chắc chắn muốn xóa truyện này? Hành động này sẽ đánh dấu truyện là "Đã xóa" và không hiển thị trên trang chủ.',
        'Xóa',
        'danger',
        async () => {
            try {
                const response = await fetch(`${API_BASE}/admin/books/delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ book_id: bookId, hard_delete: false })
                });
                const data = await response.json();
                if (data.success) {
                    showToast(data.message || '✅ Đã xóa truyện!', 'success');
                    fetchBooks(currentPage);
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
// KEYBOARD SHORTCUT: Enter to search
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                applyFilters();
            }
        });
    }

    // Initial load
    fetchBooks(1);
});