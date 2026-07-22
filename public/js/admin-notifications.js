/**
 * admin-notifications.js - Quản Lý Thông Báo & Phát Quà Hệ Thống
 * 
 * APIs:
 *   GET    /api/admin/notifications?page=&limit=
 *   POST   /api/admin/notifications/global
 *   POST   /api/admin/notifications/personal
 */

const API_BASE = '/api';

// =========================================================================
// UTILITIES
// =========================================================================
function showToast(message, type = 'success') {
    const container = document.getElementById('admin-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('show');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');
}

function openModalCreate(html) {
    document.getElementById('modal-create-body').innerHTML = html;
    document.getElementById('modal-create-overlay').style.display = 'block';
}
function closeModalCreate() {
    document.getElementById('modal-create-overlay').style.display = 'none';
}

function formatDate(dateStr) {
    if (!dateStr) return '---';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '---';
    return d.toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatShortDate(dateStr) {
    if (!dateStr) return '---';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '---';
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

// =========================================================================
// 1. FETCH & RENDER NOTIFICATIONS LIST
// =========================================================================
let currentPage = 1;
const LIMIT = 15;

async function fetchNotifications(page = 1) {
    const tbody = document.getElementById('notifications-table-body');
    const countEl = document.getElementById('notif-count');
    if (!tbody) return;

    currentPage = page;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang tải...</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/admin/notifications?page=${page}&limit=${LIMIT}`);
        const data = await res.json();

        if (!data.success) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-500 py-10">❌ Lỗi tải dữ liệu</td></tr>';
            return;
        }

        const notifs = data.notifications || [];
        const pagination = data.pagination || { total: 0, total_pages: 0 };

        if (countEl) countEl.textContent = `(${pagination.total} thông báo)`;

        if (notifs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-500 py-10">📭 Chưa có thông báo nào</td></tr>';
        } else {
            tbody.innerHTML = notifs.map(n => {
                const isGlobal = !n.user_id;
                const badge = isGlobal
                    ? '<span class="badge-global"><i class="fa-solid fa-globe"></i> Toàn server</span>'
                    : `<span class="badge-personal"><i class="fa-solid fa-user"></i> ${n.target_name || 'Cá nhân'}</span>`;
                const title = n.title || '—';
                const msg = (n.message || '').substring(0, 80) + ((n.message || '').length > 80 ? '...' : '');
                return `<tr>
                    <td style="font-weight:600;color:#f1f5f9;">${title}</td>
                    <td style="color:#9ca3af;font-size:12px;">${msg}</td>
                    <td>${badge}</td>
                    <td style="color:#6b7280;font-size:12px;">${formatDate(n.created_at)}</td>
                    <td>
                        <button onclick="openEditNotifModal('${n.id}')" style="padding:4px 8px;border-radius:6px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;font-size:10px;cursor:pointer;margin-right:4px;"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deleteNotif('${n.id}')" style="padding:4px 8px;border-radius:6px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;font-size:10px;cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>`;
            }).join('');
        }

        // Render pagination
        renderPagination(pagination);
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-500 py-10">❌ Lỗi kết nối</td></tr>';
    }
}

function renderPagination(pagination) {
    const container = document.getElementById('pagination');
    if (!container) return;

    const { page, total_pages } = pagination;
    if (!total_pages || total_pages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    // Prev
    if (page > 1) {
        html += `<button onclick="fetchNotifications(${page - 1})" style="padding:6px 12px;border-radius:6px;background:rgba(255,255,255,0.06);border:1px solid #374151;color:#9ca3af;font-size:12px;cursor:pointer;"><i class="fa-solid fa-chevron-left"></i></button>`;
    }

    for (let p = 1; p <= total_pages; p++) {
        if (p === 1 || p === total_pages || Math.abs(p - page) <= 1) {
            const active = p === page;
            html += `<button onclick="fetchNotifications(${p})" style="padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;${active ? 'background:#7c3aed;color:white;border:1px solid #7c3aed;' : 'background:rgba(255,255,255,0.06);color:#9ca3af;border:1px solid #374151;'}">${p}</button>`;
        } else if (Math.abs(p - page) === 2) {
            html += `<span style="color:#6b7280;padding:0 4px;font-size:11px;">...</span>`;
        }
    }

    // Next
    if (page < total_pages) {
        html += `<button onclick="fetchNotifications(${page + 1})" style="padding:6px 12px;border-radius:6px;background:rgba(255,255,255,0.06);border:1px solid #374151;color:#9ca3af;font-size:12px;cursor:pointer;"><i class="fa-solid fa-chevron-right"></i></button>`;
    }

    container.innerHTML = html;
}

// =========================================================================
// 2. MODAL: TẠO THÔNG BÁO TOÀN SERVER
// =========================================================================
function openCreateGlobalModal() {
    openModalCreate(`
        <h3><i class="fa-solid fa-bullhorn text-emerald-400"></i> Gửi Thông Báo Toàn Server</h3>

        <div class="form-group">
            <label><i class="fa-solid fa-heading"></i> Tiêu Đề</label>
            <input type="text" id="notif-title" placeholder="VD: Bảo trì hệ thống hoàn tất" />
        </div>

        <div class="form-group">
            <label><i class="fa-solid fa-align-left"></i> Nội Dung</label>
            <textarea id="notif-msg" rows="3" placeholder="Nội dung thông báo..."></textarea>
        </div>

        <div class="form-group">
            <label><i class="fa-solid fa-link"></i> Đường Dẫn (tùy chọn)</label>
            <input type="text" id="notif-link" placeholder="VD: /su-kien-mua-thu" />
        </div>

        <!-- KHU VỰC ĐÍNH KÈM QUÀ -->
        <div class="reward-section">
            <div class="title"><i class="fa-solid fa-gift"></i> 🎁 Đính Kèm Quà (Tùy chọn)</div>
            <div class="form-row">
                <div class="form-group">
                    <label><i class="fa-solid fa-coins text-yellow-400"></i> Linh Thạch</label>
                    <input type="number" id="notif-lt" min="0" value="0" placeholder="Số LT mỗi user" />
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-gem text-purple-400"></i> Kim Cương</label>
                    <input type="number" id="notif-kc" min="0" value="0" placeholder="Số KC mỗi user" />
                </div>
            </div>
            <div style="font-size:11px;color:#fcd34d;margin-top:6px;">
                ⚠️ Cộng trực tiếp vào tài khoản <strong>TOÀN BỘ ĐẠO HỮU</strong> trong hệ thống!
            </div>
        </div>

        <div class="modal-actions">
            <button class="modal-btn cancel" onclick="closeModalCreate()">Hủy</button>
            <button class="modal-btn primary" onclick="submitGlobalNotif()"><i class="fa-solid fa-paper-plane"></i> Gửi Thông Báo</button>
        </div>
    `);
}

async function submitGlobalNotif() {
    const title = document.getElementById('notif-title').value.trim();
    const message = document.getElementById('notif-msg').value.trim();
    const link_url = document.getElementById('notif-link').value.trim() || null;
    const linh_thach = parseInt(document.getElementById('notif-lt').value) || 0;
    const kim_cuong = parseInt(document.getElementById('notif-kc').value) || 0;

    if (!title) { showToast('❌ Nhập tiêu đề thông báo!', 'error'); return; }
    if (!message) { showToast('❌ Nhập nội dung thông báo!', 'error'); return; }

    try {
        const res = await fetch(`${API_BASE}/admin/notifications/global`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, message, link_url, linh_thach, kim_cuong })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            closeModalCreate();
            fetchNotifications(1);
        } else {
            showToast(`❌ ${data.error}`, 'error');
        }
    } catch (e) {
        showToast('❌ Lỗi kết nối!', 'error');
    }
}

// =========================================================================
// 3. MODAL: TẠO THÔNG BÁO CÁ NHÂN
// =========================================================================
function openCreatePersonalModal() {
    openModalCreate(`
        <h3><i class="fa-solid fa-user-plus text-blue-400"></i> Gửi Thông Báo Cá Nhân</h3>

        <div class="warning-box" style="display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:8px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.15);margin-bottom:14px;">
            <i class="fa-solid fa-circle-info" style="color:#60a5fa;font-size:16px;margin-top:1px;"></i>
            <div style="font-size:12px;color:#93c5fd;line-height:1.5;">
                Gửi thông báo riêng đến <strong>1 Đạo Hữu</strong> kèm quà tặng (nếu muốn).
                Dùng cho trúng thưởng sự kiện, đền bù, hoặc trao thưởng cá nhân.
            </div>
        </div>

        <div class="form-group">
            <label><i class="fa-solid fa-id-card text-blue-400"></i> ID Đạo Hữu (UUID)</label>
            <input type="text" id="notif-user-id" placeholder="VD: 123e4567-e89b-12d3-a456-426614174000" />
            <div style="font-size:10px;color:#6b7280;margin-top:4px;">💡 Tìm ID tại menu <strong>Quản Lý Đạo Hữu</strong></div>
        </div>

        <div class="form-group">
            <label><i class="fa-solid fa-heading"></i> Tiêu Đề</label>
            <input type="text" id="notif-title-personal" placeholder="VD: Chúc mừng bạn trúng thưởng!" />
        </div>

        <div class="form-group">
            <label><i class="fa-solid fa-align-left"></i> Nội Dung</label>
            <textarea id="notif-msg-personal" rows="2" placeholder="Nội dung thông báo riêng..."></textarea>
        </div>

        <div class="form-group">
            <label><i class="fa-solid fa-link"></i> Đường Dẫn (tùy chọn)</label>
            <input type="text" id="notif-link-personal" placeholder="VD: /chi-tiet-truyen/..." />
        </div>

        <!-- KHU VỰC ĐÍNH KÈM QUÀ -->
        <div class="reward-section">
            <div class="title"><i class="fa-solid fa-gift"></i> 🎁 Đính Kèm Quà Riêng (Tùy chọn)</div>
            <div class="form-row">
                <div class="form-group">
                    <label><i class="fa-solid fa-coins text-yellow-400"></i> Linh Thạch</label>
                    <input type="number" id="notif-lt-personal" min="0" value="0" placeholder="Số LT tặng" />
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-gem text-purple-400"></i> Kim Cương</label>
                    <input type="number" id="notif-kc-personal" min="0" value="0" placeholder="Số KC tặng" />
                </div>
            </div>
        </div>

        <div class="modal-actions">
            <button class="modal-btn cancel" onclick="closeModalCreate()">Hủy</button>
            <button class="modal-btn primary" onclick="submitPersonalNotif()"><i class="fa-solid fa-paper-plane"></i> Gửi Riêng</button>
        </div>
    `);
}

async function submitPersonalNotif() {
    const user_id = document.getElementById('notif-user-id').value.trim();
    const title = document.getElementById('notif-title-personal').value.trim();
    const message = document.getElementById('notif-msg-personal').value.trim();
    const link_url = document.getElementById('notif-link-personal').value.trim() || null;
    const linh_thach = parseInt(document.getElementById('notif-lt-personal').value) || 0;
    const kim_cuong = parseInt(document.getElementById('notif-kc-personal').value) || 0;

    if (!user_id) { showToast('❌ Nhập ID Đạo Hữu!', 'error'); return; }
    if (!title) { showToast('❌ Nhập tiêu đề!', 'error'); return; }
    if (!message) { showToast('❌ Nhập nội dung!', 'error'); return; }

    try {
        const res = await fetch(`${API_BASE}/admin/notifications/personal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id, title, message, link_url, linh_thach, kim_cuong })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            closeModalCreate();
            fetchNotifications(1);
        } else {
            showToast(`❌ ${data.error}`, 'error');
        }
    } catch (e) {
        showToast('❌ Lỗi kết nối!', 'error');
    }
}

// =========================================================================
// 4. SỬA THÔNG BÁO
// =========================================================================
function openEditNotifModal(notifId) {
    // Fetch current notification data
    fetch(`${API_BASE}/admin/notifications?page=1&limit=100`)
        .then(r => r.json())
        .then(data => {
            if (!data.success) { showToast('❌ Không thể tải thông tin!', 'error'); return; }
            const notif = data.notifications.find(n => n.id === notifId);
            if (!notif) { showToast('❌ Không tìm thấy thông báo!', 'error'); return; }
            openModalCreate(`
                <h3><i class="fa-solid fa-pen text-blue-400"></i> Sửa Thông Báo</h3>
                <input type="hidden" id="edit-notif-id" value="${notif.id}" />
                <div class="form-group">
                    <label><i class="fa-solid fa-heading"></i> Tiêu Đề</label>
                    <input type="text" id="edit-notif-title" value="${notif.title || ''}" />
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-align-left"></i> Nội Dung</label>
                    <textarea id="edit-notif-msg" rows="3">${notif.message || ''}</textarea>
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-link"></i> Đường Dẫn</label>
                    <input type="text" id="edit-notif-link" value="${notif.link_url || ''}" />
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel" onclick="closeModalCreate()">Hủy</button>
                    <button class="modal-btn primary" onclick="submitEditNotif()"><i class="fa-solid fa-floppy-disk"></i> Lưu</button>
                </div>
            `);
        })
        .catch(e => showToast('❌ Lỗi kết nối!', 'error'));
}

async function submitEditNotif() {
    const id = document.getElementById('edit-notif-id').value;
    const title = document.getElementById('edit-notif-title').value.trim();
    const message = document.getElementById('edit-notif-msg').value.trim();
    const link_url = document.getElementById('edit-notif-link').value.trim() || null;
    if (!title || !message) { showToast('❌ Nhập tiêu đề và nội dung!', 'error'); return; }
    try {
        const res = await fetch(`${API_BASE}/admin/notifications/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, message, link_url })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            closeModalCreate();
            fetchNotifications(currentPage);
        } else {
            showToast(`❌ ${data.error}`, 'error');
        }
    } catch (e) {
        showToast('❌ Lỗi kết nối!', 'error');
    }
}

// =========================================================================
// 5. XÓA THÔNG BÁO
// =========================================================================
async function deleteNotif(notifId) {
    if (!confirm('Bạn có chắc muốn xóa thông báo này?')) return;
    try {
        const res = await fetch(`${API_BASE}/admin/notifications/${notifId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            fetchNotifications(currentPage);
        } else {
            showToast(`❌ ${data.error}`, 'error');
        }
    } catch (e) {
        showToast('❌ Lỗi kết nối!', 'error');
    }
}

// =========================================================================
// INIT
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    fetchNotifications(1);
});
