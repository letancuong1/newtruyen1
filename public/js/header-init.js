// ===== HEADER INIT - TỰ ĐỘNG LOAD DỮ LIỆU USER =====
(function() {
    // Hàm tiện ích
    function getDbProfile() { try { const s=localStorage.getItem('user_data'); return s?JSON.parse(s):null; } catch(e){ return null; } }
    function saveDbProfile(p) { localStorage.setItem('user_data', JSON.stringify(p)); }

    const levelThresholds = [0,100,300,600,1000,1500,2100,2800,3600,4500,5500];
    const levelNames = ["Phàm Nhân","Luyện Khí","Trúc Cơ","Kết Đan","Nguyên Anh","Hóa Thần","Luyện Hư","Hợp Thể","Đại Thừa","Độ Kiếp","Chân Tiên"];

    function calculateLevelData(totalExp) {
        let lv=0;
        for (let i=0;i<levelThresholds.length;i++) if(totalExp>=levelThresholds[i]) lv=i; else break;
        const b=levelThresholds[lv]||0;
        const n=levelThresholds[lv+1]||(b+99999);
        const eIn=totalExp-b;
        const eTo=n-b;
        const pct=Math.min((eIn/eTo)*100,100);
        return {level:lv+1, name:levelNames[lv]||"Chân Tiên", expInLevel:eIn, expToNextLevel:eTo, progressPercent:pct};
    }

    function updateHeaderUI(db, cultivation, currentLevel) {
        const showUser = function() {
            const gu = document.getElementById('guest-ui');
            const uu = document.getElementById('user-ui');
            if (gu && uu) {
                if (db) {
                    gu.classList.add('hidden');
                    uu.classList.remove('hidden');
                    uu.classList.add('flex');
                } else {
                    gu.classList.remove('hidden');
                    uu.classList.add('hidden');
                    uu.classList.remove('flex');
                }
            }
        };
        showUser();
        if (!db) return;

        const cgId = parseInt(cultivation ? cultivation.canh_gioi_id : (db.canh_gioi_id || 1)) || 1;
        const totalExp = parseInt(cultivation ? cultivation.tu_vi_exp : (db.exp || 0)) || 0;
        const linhThach = parseInt(cultivation ? cultivation.linh_thach : (db.linh_thach || 0)) || 0;
        const kimCuong = parseInt(cultivation ? cultivation.kim_cuong : (db.kim_cuong || 0)) || 0;
        const levelData = calculateLevelData(totalExp);
        const lvName = currentLevel ? currentLevel.ten_canh_gioi : levelData.name;

        const elKC = document.getElementById('header-kim-cuong');
        const elLT = document.getElementById('header-linh-thach');
        const elPDC = document.getElementById('header-phieu-de-cu');
        const elName = document.getElementById('user-display-name');
        const elLevel = document.getElementById('user-level');
        const elExpBar = document.getElementById('header-exp-bar');
        const elAvatar = document.getElementById('header-avatar');
        const displayName = db.display_name || db.dao_hieu || 'Đạo Hữu';

        if (elKC) elKC.textContent = kimCuong.toLocaleString('vi-VN');
        if (elLT) elLT.textContent = linhThach.toLocaleString('vi-VN');
        if (elPDC) {
            const items = cultivation ? (cultivation.items || []) : [];
            const pi = items.find(i => i.item_name === 'Phiếu Đề Cử');
            elPDC.textContent = pi ? pi.so_luong : 0;
        }
        if (elName) elName.textContent = displayName;
        if (elLevel) elLevel.textContent = 'Lv.' + cgId + ' - ' + lvName;
        if (elExpBar) elExpBar.style.width = levelData.progressPercent + '%';
        if (elAvatar) elAvatar.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(displayName) + '&backgroundColor=140d2e';
    }

    function loadUserData() {
        const db = getDbProfile();
        // Hiển thị tạm từ localStorage
        updateHeaderUI(db, null, null);

        // Gọi API để lấy dữ liệu thật
        if (db && db.id) {
            fetch('/api/get_cultivation?user_id=' + db.id)
                .then(r => r.json())
                .then(d => {
                    if (d.success && d.cultivation) {
                        Object.assign(db, {
                            tu_vi_exp: d.cultivation.tu_vi_exp,
                            linh_thach: d.cultivation.linh_thach,
                            kim_cuong: d.cultivation.kim_cuong,
                            canh_gioi_id: d.cultivation.canh_gioi_id,
                            kinh_mach: d.cultivation.kinh_mach,
                            than_thuc: d.cultivation.than_thuc,
                            than_the: d.cultivation.than_the,
                            ngo_tinh: d.cultivation.ngo_tinh
                        });
                        d.cultivation.items = d.items || [];
                        saveDbProfile(db);
                        updateHeaderUI(db, d.cultivation, d.current_level);
                    }
                })
                .catch(e => console.error('Header load user data error:', e));
        }
    }

    // Xử lý logout (global)
    window.handleLogout = function() {
        localStorage.removeItem('user_data');
        localStorage.removeItem('user_session');
        window.location.reload();
    };

    // Chạy khi DOM sẵn sàng
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadUserData);
    } else {
        loadUserData();
    }
})();

// ===== MOBILE MENU FUNCTIONS (global, fallback for onclick attributes) =====
function _toggleMobileMenu() {
    const overlay = document.getElementById('mobile-menu-overlay');
    const panel = document.getElementById('mobile-menu-panel');
    const bg = document.getElementById('mobile-menu-bg');
    const btn = document.getElementById('mobile-menu-btn');
    if (!overlay || !panel || !bg) return;
    const isOpen = !overlay.classList.contains('hidden');
    if (isOpen) {
        panel.style.transform = 'translateX(100%)';
        bg.style.opacity = '0';
        if (btn) btn.style.pointerEvents = 'none';
        setTimeout(function() { overlay.classList.add('hidden'); if (btn) { btn.style.pointerEvents = ''; btn.style.opacity = ''; } }, 400);
    } else {
        overlay.classList.remove('hidden');
        void panel.offsetWidth;
        panel.style.transform = 'translateX(0)';
        bg.style.opacity = '1';
        if (btn) btn.style.opacity = '0.6';
    }
}

function _closeMobileMenu() {
    const overlay = document.getElementById('mobile-menu-overlay');
    const panel = document.getElementById('mobile-menu-panel');
    const bg = document.getElementById('mobile-menu-bg');
    const btn = document.getElementById('mobile-menu-btn');
    if (!overlay || !panel || !bg) return;
    panel.style.transform = 'translateX(100%)';
    bg.style.opacity = '0';
    if (btn) { btn.style.pointerEvents = 'none'; btn.style.opacity = ''; }
    setTimeout(function() { overlay.classList.add('hidden'); if (btn) btn.style.pointerEvents = ''; }, 400);
}

window.toggleMobileMenu = _toggleMobileMenu;
window.closeMobileMenu = _closeMobileMenu;

// ===== EVENT DELEGATION - works even if header loads later =====
// Bắt các phần tử có data-header-action được click
document.addEventListener('click', function(e) {
    var target = e.target;
    var el = target.closest ? target.closest('[data-header-action]') : null;
    if (!el) {
        // Fallback: check if click on background overlay
        var overlay = document.getElementById('mobile-menu-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            var panel = document.getElementById('mobile-menu-panel');
            if (panel && !panel.contains(target) && !target.closest('#mobile-menu-btn')) {
                _closeMobileMenu();
                return;
            }
        }
        return;
    }
    var action = el.getAttribute('data-header-action');
    if (action === 'toggle-menu') _toggleMobileMenu();
    else if (action === 'close-menu') _closeMobileMenu();
});
