/**
 * rpg-system.js - Hệ Thống Tu Tiên (Missions, Items, Notifications)
 * Nhúng vào mọi trang để chạy ngầm
 */
const RPG_API = '/api';

// ===================================================================
// 1. HỆ THỐNG TOAST THÔNG BÁO KIỂU TU TIÊN
// ===================================================================
function showTuTienToast(title, message, type = 'success') {
    const container = document.getElementById('rpg-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
        success: { border: '#34d399', bg: 'rgba(6,78,59,0.95)', icon: 'fa-check-circle', iconColor: '#34d399' },
        mission: { border: '#c084fc', bg: 'rgba(88,28,135,0.95)', icon: 'fa-scroll', iconColor: '#c084fc' },
        item: { border: '#fbbf24', bg: 'rgba(120,53,15,0.95)', icon: 'fa-gem', iconColor: '#fbbf24' },
        error: { border: '#f87171', bg: 'rgba(127,29,29,0.95)', icon: 'fa-exclamation-circle', iconColor: '#f87171' }
    };
    const cfg = colors[type] || colors.success;

    toast.className = 'rpg-toast';
    toast.style.cssText = `
        background: ${cfg.bg};
        border: 1px solid ${cfg.border};
        border-radius: 12px;
        padding: 14px 18px;
        margin-bottom: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${cfg.border}33;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        color: #f1f5f9;
        font-family: 'Inter', sans-serif;
        transform: translateX(120%);
        opacity: 0;
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        max-width: 380px;
        backdrop-filter: blur(8px);
    `;
    toast.innerHTML = `
        <i class="fa-solid ${cfg.icon}" style="color:${cfg.iconColor};font-size:20px;margin-top:2px;"></i>
        <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${title}</div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.4;">${message}</div>
        </div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#6b7280;cursor:pointer;font-size:14px;padding:0 4px;">&times;</button>
    `;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    });

    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ===================================================================
// 2. HÀM XỬ LÝ RESPONSE API - TỰ ĐỘNG CHECK MISSION COMPLETED
// ===================================================================
function handleRpgResponse(responseData) {
    if (!responseData) return;
    if (responseData.missions_completed && Array.isArray(responseData.missions_completed)) {
        responseData.missions_completed.forEach(m => {
            const name = m.name || 'Nhiệm vụ';
            const lt = m.reward_lt || 0;
            const exp = m.reward_exp || 0;
            let msg = `Hoàn thành: ${name}`;
            if (lt > 0 || exp > 0) {
                msg += `\nNhận: ${lt > 0 ? '+' + lt + ' LT' : ''}${lt > 0 && exp > 0 ? ' | ' : ''}${exp > 0 ? '+' + exp + ' EXP' : ''}`;
            }
            showTuTienToast('⚡ Vừa hoàn thành nhiệm vụ!', msg, 'mission');
        });
    }
    // Check quà từ thông báo
    if (responseData.claimed_reward) {
        showTuTienToast('🎁 Nhận quà thành công!', responseData.claimed_reward, 'item');
    }
}

// ===================================================================
// 3. THEO DÕI THÔNG BÁO - BADGE TRÊN CHUÔNG
// ===================================================================
async function fetchUnreadNotifications() {
    try {
        const db = getDbProfile();
        if (!db || !db.id) return;

        const res = await fetch(`${RPG_API}/notifications/unread?user_id=${db.id}`);
        const data = await res.json();
        if (data.success) {
            const badge = document.getElementById('notif-badge');
            const count = data.count || 0;
            if (badge) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = count > 0 ? 'flex' : 'none';
            }
            // Lưu để popup dùng
            window._unreadNotifications = data.notifications || [];
        }
    } catch (e) {
        console.error('[RPG] Fetch notifs error:', e);
    }
}

function getDbProfile() {
    try {
        const s = localStorage.getItem('user_data');
        return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
}

// ===================================================================
// 4. POPUP DANH SÁCH THÔNG BÁO
// ===================================================================
function toggleNotifPopup() {
    let popup = document.getElementById('notif-popup');
    if (popup) { popup.remove(); return; }

    const notifs = window._unreadNotifications || [];
    popup = document.createElement('div');
    popup.id = 'notif-popup';
    popup.style.cssText = `
        position: fixed; top: 70px; right: 20px; z-index: 99999;
        background: #1a1a2e; border: 1px solid rgba(0,210,255,0.3);
        border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        width: 360px; max-height: 480px; overflow-y: auto;
        color: #e2e8f0; font-family: 'Inter', sans-serif;
    `;
    popup.innerHTML = `
        <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:700;font-size:14px;color:#00d2ff;"><i class="fa-solid fa-bell mr-2"></i> Truyền Âm Các</span>
            <button onclick="this.closest('#notif-popup').remove()" style="background:none;border:none;color:#6b7280;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:8px;">
            ${notifs.length === 0 ? '<div style="padding:24px;text-align:center;color:#6b7280;font-size:12px;">📭 Không có thông báo mới</div>' :
            notifs.map(n => `
                <div style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <div style="font-weight:600;font-size:12px;color:#f1f5f9;">${n.title || 'Thông báo'}</div>
                    <div style="font-size:11px;color:#9ca3af;margin-top:4px;">${n.message || ''}</div>
                    <div style="display:flex;gap:8px;margin-top:8px;">
                        ${n.linh_thach > 0 || n.kim_cuong > 0 ? `
                            <button onclick="claimNotifReward('${n.id}')" style="padding:4px 12px;border-radius:6px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:#fbbf24;font-size:10px;font-weight:600;cursor:pointer;">
                                🎁 Nhận quà ${n.linh_thach > 0 ? n.linh_thach + ' LT' : ''}${n.linh_thach > 0 && n.kim_cuong > 0 ? ' + ' : ''}${n.kim_cuong > 0 ? n.kim_cuong + ' KC' : ''}
                            </button>
                        ` : ''}
                        ${n.link_url ? `<a href="${n.link_url}" style="padding:4px 12px;border-radius:6px;background:rgba(0,210,255,0.1);border:1px solid rgba(0,210,255,0.2);color:#00d2ff;font-size:10px;text-decoration:none;">Xem</a>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    document.body.appendChild(popup);
}

async function claimNotifReward(notifId) {
    try {
        const db = getDbProfile();
        if (!db || !db.id) return;
        const res = await fetch(`${RPG_API}/notifications/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notification_id: notifId, user_id: db.id })
        });
        const data = await res.json();
        if (data.success) {
            showTuTienToast('🎁 Nhận quà!', data.message || 'Đã nhận quà thành công!', 'item');
            // Refresh user data
            if (data.user) {
                Object.assign(db, data.user);
                localStorage.setItem('user_data', JSON.stringify(db));
            }
            fetchUnreadNotifications();
            document.getElementById('notif-popup')?.remove();
        } else {
            showTuTienToast('Lỗi', data.error || 'Không thể nhận quà', 'error');
        }
    } catch (e) {
        showTuTienToast('Lỗi', 'Kết nối thất bại', 'error');
    }
}

// ===================================================================
// 5. KHỞI TẠO - TẠO TOAST CONTAINER
// ===================================================================
(function initRpgSystem() {
    // Tạo container cho toast nếu chưa có
    if (!document.getElementById('rpg-toast-container')) {
        const container = document.createElement('div');
        container.id = 'rpg-toast-container';
        container.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 999999;
            display: flex; flex-direction: column; align-items: flex-end;
            pointer-events: none;
        `;
        // pointer-events none trên container, nhưng toast có pointer-events auto
        document.body.appendChild(container);
        // Fix pointer events cho từng toast
        const style = document.createElement('style');
        style.textContent = '.rpg-toast { pointer-events: auto; }';
        document.head.appendChild(style);
    }

    // Theo dõi thông báo sau khi DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(fetchUnreadNotifications, 1500);
            // Refresh mỗi 60s
            setInterval(fetchUnreadNotifications, 60000);
        });
    } else {
        setTimeout(fetchUnreadNotifications, 1500);
        setInterval(fetchUnreadNotifications, 60000);
    }
})();