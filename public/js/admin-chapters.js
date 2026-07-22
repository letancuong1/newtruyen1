/**
 * admin-chapters.js - Quản Lý Chương (Chapter Management)
 * 
 * APIs:
 *   GET    /api/admin/chapters/suggest-number?book_id=
 *   GET    /api/admin/chapters?book_id=&search=&page=&limit=
 *   GET    /api/admin/chapters/:id
 *   POST   /api/admin/chapters
 *   PUT    /api/admin/chapters/:id
 *   POST   /api/admin/chapters/delete
 */

const API_BASE = '/api';
let currentPage = 1;
let currentBookId = null;
let currentBookTitle = '';
let currentFilters = { search: '' };
let pendingModalAction = null;
let selectedIds = new Set();

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
// WORD COUNT
// =========================================================================

function updateWordCount() {
    const content = document.getElementById('chapter-content')?.value || '';
    const charCount = content.length;
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    document.getElementById('word-count-display').textContent = formatNumber(wordCount);
    document.getElementById('char-count-display').textContent = formatNumber(charCount);
}

// =========================================================================
// GET BOOK INFO FROM URL
// =========================================================================

function getBookIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('book_id');
}

// =========================================================================
// FETCH BOOK INFO
// =========================================================================

async function fetchBookInfo() {
    if (!currentBookId) return;
    try {
        const response = await fetch(`${API_BASE}/get_book_detail?id=${currentBookId}`);
        const data = await response.json();
        if (data && data.success && data.book) {
            currentBookTitle = data.book.ten_truyen || 'Không rõ';
            document.getElementById('book-title-header').textContent = `› ${currentBookTitle}`;
            document.getElementById('chapter-total-count').textContent = `(${formatNumber(data.book.so_chuong || 0)} chương)`;
        }
    } catch (e) {
        document.getElementById('book-title-header').textContent = '› Không thể tải thông tin truyện';
    }
}

// =========================================================================
// FETCH SUGGESTED CHAPTER NUMBER
// =========================================================================

async function fetchSuggestedNumber() {
    if (!currentBookId) return;
    try {
        const response = await fetch(`${API_BASE}/admin/chapters/suggest-number?book_id=${currentBookId}`);
        const data = await response.json();
        if (data && data.success && data.next_chapter_number) {
            const numInput = document.getElementById('chapter-number');
            if (numInput && !numInput.value) {
                numInput.value = data.next_chapter_number;
            }
        }
    } catch (e) {}
}

// =========================================================================
// FETCH CHAPTERS LIST
// =========================================================================

async function fetchChapters(page = 1) {
    const tbody = document.getElementById('chapters-table-body');
    const countEl = document.getElementById('chapters-count');
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (!tbody || !currentBookId) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang tải dữ liệu...</td></tr>';

    try {
        const params = new URLSearchParams();
        params.set('book_id', currentBookId);
        params.set('page', page);
        params.set('limit', '30');
        if (currentFilters.search) params.set('search', currentFilters.search);

        const response = await fetch(`${API_BASE}/admin/chapters?${params.toString()}`);
        const data = await response.json();

        if (!data || !data.success) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-10">❌ Lỗi tải dữ liệu</td></tr>';
            return;
        }

        const chapters = data.chapters || [];
        const pagination = data.pagination || { page: 1, total: 0, total_pages: 1 };

        if (countEl) countEl.textContent = `(${formatNumber(pagination.total)} chương)`;
        document.getElementById('chapter-total-count').textContent = `(${formatNumber(pagination.total)} chương)`;

        currentPage = pagination.page;
        if (pageInfo) pageInfo.textContent = `Trang ${pagination.page} / ${pagination.total_pages || 1}`;
        if (prevBtn) prevBtn.disabled = pagination.page <= 1;
        if (nextBtn) nextBtn.disabled = pagination.page >= pagination.total_pages;

        if (chapters.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-10"><i class="fa-solid fa-inbox text-2xl block mb-2 opacity-50"></i>Chưa có chương nào</td></tr>';
            return;
        }

        selectedIds.clear();
        updateBatchDeleteBtn();
        document.getElementById('select-all').checked = false;

        tbody.innerHTML = chapters.map(ch => {
            const checked = selectedIds.has(ch.id) ? 'checked' : '';
            const price = parseInt(ch.price) || 0;
            const priceClass = price === 0 ? 'free' : 'paid';
            const priceText = price === 0 ? 'Miễn phí' : `${formatNumber(price)} LT`;
            const totalChars = formatCompact(ch.total_chars || 0);
            const chNum = ch.chapter_number;

            return `
                <tr>
                    <td data-label="Chọn"><input type="checkbox" class="chapter-checkbox" value="${ch.id}" ${checked} onchange="onCheckboxChange()" /></td>
                    <td data-label="Số"><span class="ch-number">#${chNum}</span></td>
                    <td data-label="Tiêu Đề"><span class="ch-title">${ch.title || 'Không tiêu đề'}</span></td>
                    <td data-label="Độ Dài">${totalChars} ký tự</td>
                    <td data-label="Giá"><span class="ch-price ${priceClass}">${priceText}</span></td>
                    <td data-label="Hành Động">
                        <div class="action-btn-group">
                            <button class="action-btn edit" onclick="editChapter(${ch.id})" title="Sửa chương">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="action-btn delete" onclick="deleteChapter(${ch.id})" title="Xóa chương">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Lỗi fetch chapters:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-10">❌ Lỗi kết nối máy chủ</td></tr>';
    }
}

// =========================================================================
// CHECKBOX HANDLING
// =========================================================================

function toggleSelectAll() {
    const selectAll = document.getElementById('select-all').checked;
    const checkboxes = document.querySelectorAll('.chapter-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = selectAll;
        if (selectAll) {
            selectedIds.add(parseInt(cb.value));
        } else {
            selectedIds.delete(parseInt(cb.value));
        }
    });
    updateBatchDeleteBtn();
}

function onCheckboxChange() {
    selectedIds.clear();
    document.querySelectorAll('.chapter-checkbox').forEach(cb => {
        if (cb.checked) selectedIds.add(parseInt(cb.value));
    });
    const selectAll = document.getElementById('select-all');
    if (selectAll) {
        const allVisible = document.querySelectorAll('.chapter-checkbox');
        selectAll.checked = allVisible.length > 0 && allVisible.length === selectedIds.size;
    }
    updateBatchDeleteBtn();
}

function updateBatchDeleteBtn() {
    const btn = document.getElementById('batch-delete-btn');
    if (btn) {
        btn.disabled = selectedIds.size === 0;
        btn.style.opacity = selectedIds.size === 0 ? '0.4' : '1';
        btn.innerHTML = `<i class="fa-solid fa-trash"></i> Xóa (${selectedIds.size})`;
    }
}

// =========================================================================
// SAVE CHAPTER (ADD / UPDATE)
// =========================================================================

async function saveChapter() {
    const editId = document.getElementById('edit-chapter-id').value;
    const chapterNumber = parseInt(document.getElementById('chapter-number').value);
    const title = document.getElementById('chapter-title').value.trim();
    const content = document.getElementById('chapter-content').value.trim();
    const price = parseInt(document.getElementById('chapter-price').value) || 0;

    if (!chapterNumber || chapterNumber < 1) {
        showToast('❌ Vui lòng nhập số chương hợp lệ!', 'error');
        return;
    }
    if (!title) {
        showToast('❌ Vui lòng nhập tiêu đề chương!', 'error');
        return;
    }
    if (!content) {
        showToast('❌ Vui lòng nhập nội dung chương!', 'error');
        return;
    }

    try {
        let url, method, successMsg;
        const bodyData = {
            book_id: currentBookId,
            chapter_number: chapterNumber,
            title: title,
            content: content,
            price: price
        };

        if (editId) {
            // UPDATE - always send book_id for duplicate check
            url = `${API_BASE}/admin/chapters/${editId}`;
            method = 'PUT';
            successMsg = '✅ Cập nhật chương thành công!';
            // book_id is already included in bodyData
        } else {
            // CREATE
            url = `${API_BASE}/admin/chapters`;
            method = 'POST';
            successMsg = '✅ Thêm chương mới thành công!';
        }

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });

        const data = await response.json();

        if (data.success) {
            showToast(data.message || successMsg, 'success');
            resetForm();
            fetchChapters(1);
            fetchSuggestedNumber();
            fetchBookInfo();
        } else {
            showToast(`❌ ${data.error || 'Lỗi!'}`, 'error');
        }
    } catch (error) {
        showToast('❌ Lỗi kết nối máy chủ!', 'error');
    }
}

// =========================================================================
// EDIT CHAPTER (LOAD INTO FORM)
// =========================================================================

async function editChapter(chapterId) {
    try {
        const response = await fetch(`${API_BASE}/admin/chapters/${chapterId}`);
        const data = await response.json();

        if (!data || !data.success || !data.chapter) {
            showToast('❌ Không thể tải thông tin chương!', 'error');
            return;
        }

        const ch = data.chapter;

        // Fill form
        document.getElementById('edit-chapter-id').value = ch.id;
        document.getElementById('chapter-number').value = ch.chapter_number;
        document.getElementById('chapter-title').value = ch.title || '';
        document.getElementById('chapter-content').value = ch.content || '';
        document.getElementById('chapter-price').value = ch.price || 0;

        // Update UI
        document.getElementById('editor-title').innerHTML = '<i class="fa-solid fa-pen text-blue-400"></i> Chỉnh Sửa Chương #' + ch.chapter_number;
        document.getElementById('save-btn-text').textContent = 'Cập Nhật';
        document.getElementById('cancel-edit-btn').style.display = 'inline-flex';

        // Update word count
        updateWordCount();

        // Scroll to form
        document.getElementById('editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
        showToast('❌ Lỗi kết nối máy chủ!', 'error');
    }
}

// =========================================================================
// DELETE SINGLE CHAPTER
// =========================================================================

function deleteChapter(chapterId) {
    openModal(
        '🗑️ Xóa chương',
        'Bạn có chắc chắn muốn xóa chương này? Hành động này không thể hoàn tác.',
        'Xóa',
        'danger',
        async () => {
            try {
                const response = await fetch(`${API_BASE}/admin/chapters/delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ book_id: currentBookId, chapter_ids: [chapterId] })
                });
                const data = await response.json();
                if (data.success) {
                    showToast(data.message || '✅ Đã xóa chương!', 'success');
                    fetchChapters(currentPage);
                    fetchBookInfo();
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
// BATCH DELETE
// =========================================================================

function batchDeleteChapters() {
    if (selectedIds.size === 0) return;

    openModal(
        '🗑️ Xóa nhiều chương',
        `Bạn có chắc chắn muốn xóa ${selectedIds.size} chương đã chọn? Hành động này không thể hoàn tác.`,
        `Xóa ${selectedIds.size} chương`,
        'danger',
        async () => {
            try {
                const response = await fetch(`${API_BASE}/admin/chapters/delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        book_id: currentBookId,
                        chapter_ids: Array.from(selectedIds)
                    })
                });
                const data = await response.json();
                if (data.success) {
                    showToast(data.message || '✅ Đã xóa các chương!', 'success');
                    selectedIds.clear();
                    updateBatchDeleteBtn();
                    fetchChapters(1);
                    fetchBookInfo();
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
// FORM RESET
// =========================================================================

function resetForm() {
    document.getElementById('edit-chapter-id').value = '';
    document.getElementById('chapter-number').value = '';
    document.getElementById('chapter-title').value = '';
    document.getElementById('chapter-content').value = '';
    document.getElementById('chapter-price').value = '0';
    document.getElementById('editor-title').innerHTML = '<i class="fa-solid fa-plus-circle text-emerald-400"></i> Thêm Chương Mới';
    document.getElementById('save-btn-text').textContent = 'Lưu Chương';
    document.getElementById('cancel-edit-btn').style.display = 'none';
    updateWordCount();
    fetchSuggestedNumber();
}

// =========================================================================
// FILTERS & PAGINATION
// =========================================================================

function applyFilters() {
    currentFilters.search = document.getElementById('search-input')?.value || '';
    currentPage = 1;
    fetchChapters(1);
}

function resetFilters() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    currentFilters = { search: '' };
    currentPage = 1;
    fetchChapters(1);
}

function goToPage(page) {
    if (page < 1) return;
    fetchChapters(page);
}

// =========================================================================
// KEYBOARD SHORTCUTS
// =========================================================================

// =========================================================================
// LOAD DANH SÁCH TRUYỆN KHI KHÔNG CÓ BOOK_ID
// =========================================================================

async function loadBookSelector() {
    const container = document.getElementById('book-selector-container');
    if (!container) return;

    container.innerHTML = '<div class="text-gray-500 text-sm text-center py-8"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang tải danh sách truyện...</div>';

    try {
        const response = await fetch(`${API_BASE}/admin/books?limit=100`);
        const data = await response.json();

        if (!data || !data.success || !data.books || data.books.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-sm text-center py-8">Không có truyện nào!</div>';
            return;
        }

        container.innerHTML = `
            <div class="filter-bar" style="margin-bottom:16px;">
                <input type="text" id="book-selector-search" placeholder="🔍 Tìm truyện..." style="flex:1;min-width:200px;" />
            </div>
            <div id="book-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
                ${data.books.map(book => `
                    <div class="book-select-item" onclick="goToChapters('${book.id}')" 
                         style="display:flex;align-items:center;gap:12px;padding:12px 16px;
                                background:rgba(255,255,255,0.03);border:1px solid #374151;
                                border-radius:10px;cursor:pointer;transition:0.15s;
                                hover:background:rgba(255,255,255,0.06);">
                        <img src="${book.anh_bia || 'https://via.placeholder.com/32x44/1a1635/6b7280?text=N/A'}" 
                             style="width:32px;height:44px;border-radius:4px;object-fit:cover;
                                    background:rgba(255,255,255,0.06);" 
                             onerror="this.src='https://via.placeholder.com/32x44/1a1635/6b7280?text=N/A'" />
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:600;color:#f1f5f9;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                ${book.ten_truyen || 'Vô Danh'}
                            </div>
                            <div style="font-size:11px;color:#6b7280;">
                                ${book.tac_gia || 'Khuyết Danh'} · ${book.so_chuong || 0} chương
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-right" style="color:#6b7280;font-size:12px;"></i>
                    </div>
                `).join('')}
            </div>
        `;

        // Search filter
        const searchInput = document.getElementById('book-selector-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const q = e.target.value.toLowerCase();
                document.querySelectorAll('.book-select-item').forEach(item => {
                    const text = item.textContent.toLowerCase();
                    item.style.display = text.includes(q) ? 'flex' : 'none';
                });
            });
        }

    } catch (error) {
        container.innerHTML = '<div class="text-gray-500 text-sm text-center py-8">❌ Lỗi tải dữ liệu</div>';
    }
}

function goToChapters(bookId) {
    window.location.href = `admin-chapters.html?book_id=${bookId}`;
}

document.addEventListener('DOMContentLoaded', () => {
    // Get book_id from URL
    currentBookId = getBookIdFromUrl();

    if (!currentBookId) {
        // Không có book_id → hiển thị giao diện chọn truyện
        document.getElementById('book-title-header').textContent = '› Chọn truyện để quản lý chương';
        document.getElementById('chapter-total-count').textContent = '';
        document.getElementById('editor-panel').style.display = 'none';
        document.getElementById('chapters-table').style.display = 'none';
        document.getElementById('pagination').style.display = 'none';
        document.getElementById('book-selector-container').style.display = 'block';
        loadBookSelector();
        return;
    }

    // Fetch book info and chapters
    fetchBookInfo();
    fetchChapters(1);
    fetchSuggestedNumber();

    // Word count on content input
    const contentInput = document.getElementById('chapter-content');
    if (contentInput) {
        contentInput.addEventListener('input', updateWordCount);
    }

    // Enter to search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyFilters();
        });
    }
});
