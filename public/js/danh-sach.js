/**
 * Danh sách truyện - Logic xử lý cho trang danh-sach.html
 * Hỗ trợ tabs, sort, phân trang, lấy params từ URL
 */

const API_BASE = '/api';
let currentTab = 'top-view';
let currentSort = 'new';
let currentPage = 1;
const LIMIT = 24;

// ===== UTILITY =====
function cleanTrashChars(str) { if (!str) return ""; return String(str).replace(/[\{\}\[\]"']/g,'').trim(); }

function generateStarsHtml(avg, count) {
    const score = parseFloat(avg) || 0;
    let h = '<div class="flex items-center gap-0.5">';
    const active = Math.round(score);
    for (let i = 1; i <= 5; i++) h += i <= active ? '<i class="fa-solid fa-star text-amber-400 text-[10px] drop-shadow-[0_0_3px_#f59e0b]"></i>' : '<i class="fa-solid fa-star text-gray-300 text-[10px]"></i>';
    h += `<span class="text-[9px] text-slate-400 ml-0.5">(${count||0})</span>`;
    return h + '</div>';
}

function isDeletedBook(book) {
    const s = (book.trang_thai || book.status || '').toLowerCase();
    return s.includes('đã xóa') || s.includes('đa xoa') || s === 'deleted';
}

// ===== PARSE URL PARAMS =====
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) currentTab = tab;
}

// ===== TAB SWITCHING =====
function switchTab(tab) {
    currentTab = tab;
    currentPage = 1;
    // Update active tab UI
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('tab-' + tab);
    if (activeBtn) activeBtn.classList.add('active');
    // Reset sort select về giá trị mặc định "new" khi đổi tab
    document.getElementById('sort-select').value = 'new';
    currentSort = 'new';
    fetchBooksList();
}

// ===== SORT SWITCHING =====
function switchSort(sort) {
    currentSort = sort;
    currentPage = 1;
    fetchBooksList();
}

// ===== FETCH & RENDER =====
async function fetchBooksList() {
    const container = document.getElementById('list-container');
    const paginationContainer = document.getElementById('pagination-container');
    const resultCount = document.getElementById('result-count');

    if (!container) return;
    container.innerHTML = '<div class="col-span-full text-center py-12 text-slate-400 text-xs italic">Đang tải dữ liệu...</div>';
    paginationContainer.innerHTML = '';

    try {
        const url = `${API_BASE}/books/list?type=${currentTab}&sort=${currentSort}&page=${currentPage}&limit=${LIMIT}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.success) {
            container.innerHTML = '<div class="col-span-full text-center py-12 text-red-400 text-xs">Lỗi tải dữ liệu</div>';
            return;
        }

        const books = (data.data || []).filter(b => !isDeletedBook(b));
        const totalPages = data.totalPages || 1;

        // Update result count
        if (resultCount) {
            const total = data.total || books.length;
            resultCount.innerText = `Tìm thấy ${total} truyện`;
        }

        if (books.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center py-12 text-slate-400 text-xs italic">Không có truyện nào</div>';
            renderPagination(totalPages);
            return;
        }

        container.innerHTML = books.map(b => renderBookCard(b)).join('');
        renderPagination(totalPages);

    } catch (e) {
        console.error('Fetch error:', e);
        container.innerHTML = '<div class="col-span-full text-center py-12 text-red-400 text-xs">Lỗi kết nối máy chủ</div>';
    }
}

function renderBookCard(b) {
    const title = cleanTrashChars(b.ten_truyen || b.title || 'Vô Danh');
    const author = cleanTrashChars(b.tac_gia || b.author || 'Khuyết Danh');
    const cover = b.anh_bia || b.cover_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=250&auto=format&fit=crop';
    const views = parseInt(b.luot_xem || b.views || 0);
    const chapters = parseInt(b.so_chuong || b.chapters_count || 0);
    const avg = parseFloat(b.rating_avg || b.rating || 0);
    const count = parseInt(b.rating_count || 0);
    const isVip = b.is_vip === true || b.is_vip === 'true';
    const vipTag = isVip ? '<span class="text-[9px] bg-red-100 text-red-500 border border-red-200 px-1.5 py-0.5 rounded font-bold absolute top-2 right-2 z-10">VIP</span>' : '';

    return `<div class="book-card rounded-2xl overflow-hidden cursor-pointer flex flex-col" onclick="openBookDetail(${b.id})">
        <div class="relative aspect-[2/3] overflow-hidden bg-gray-100">
            <img src="${cover}" alt="${title}" class="w-full h-full object-cover" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=250&auto=format&fit=crop'">
            ${vipTag}
            <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <div class="flex items-center gap-2 text-[10px] text-white">
                    <span class="flex items-center gap-1"><i class="fa-solid fa-eye"></i> ${views.toLocaleString('vi-VN')}</span>
                    <span class="flex items-center gap-1"><i class="fa-solid fa-scroll"></i> ${chapters}</span>
                </div>
            </div>
        </div>
        <div class="p-3 flex flex-col gap-1 flex-1">
            <h3 class="text-sm font-bold text-slate-800 line-clamp-2 leading-tight">${title}</h3>
            <p class="text-[11px] text-slate-500 truncate"><i class="fa-solid fa-pen-nib mr-1 text-[9px]"></i>${author}</p>
            <div class="mt-auto pt-1">${generateStarsHtml(avg, count)}</div>
        </div>
    </div>`;
}

// ===== PAGINATION =====
function renderPagination(totalPages) {
    const container = document.getElementById('pagination-container');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    if (currentPage > 1) {
        html += `<button onclick="goToPage(${currentPage - 1})" class="px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-bold text-brandCyan hover:border-brandCyan transition-all shadow-sm"><i class="fa-solid fa-chevron-left"></i></button>`;
    }

    for (let p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) {
            html += `<button onclick="goToPage(${p})" class="pagination-btn w-9 h-9 rounded-xl text-xs font-bold transition-all shadow-sm ${p === currentPage ? 'active' : 'bg-white text-slate-600 border border-gray-200 hover:border-brandCyan'}">${p}</button>`;
        } else if (Math.abs(p - currentPage) === 2) {
            html += `<span class="text-slate-400 text-[10px]">...</span>`;
        }
    }

    if (currentPage < totalPages) {
        html += `<button onclick="goToPage(${currentPage + 1})" class="px-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-bold text-brandCyan hover:border-brandCyan transition-all shadow-sm"><i class="fa-solid fa-chevron-right"></i></button>`;
    }

    container.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    fetchBooksList();
    document.getElementById('list-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== OPEN BOOK DETAIL =====
function openBookDetail(bookId) {
    if (!bookId) return;
    // Store book data from current page for fast hydration
    try {
        // Find the book card in DOM and extract minimal data if needed
        sessionStorage.removeItem('preload_book');
    } catch (e) { /* ignore */ }
    window.location.href = `chi-tiet-truyen.html?id=${bookId}`;
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
    getUrlParams();
    // Activate correct tab from URL
    const tabBtn = document.getElementById('tab-' + currentTab);
    if (tabBtn) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        tabBtn.classList.add('active');
    }
    fetchBooksList();
});
