/**
 * admin-rpg.js - Cấu Hình RPG & Nhiệm Vụ Động (CRUD Động)
 */

const API_BASE = '/api';
let pendingModalAction = null;

// =========================================================================
// UTILITY
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

function openEditModal(html) {
    document.getElementById('edit-modal-body').innerHTML = html;
    document.getElementById('edit-modal-overlay').style.display = 'block';
}
function closeEditModal() {
    document.getElementById('edit-modal-overlay').style.display = 'none';
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab-btn[onclick*="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    if (tab === 'shop') fetchShopItems();
    if (tab === 'missions') fetchMissions();
}

// =========================================================================
// TAB 1: LEVELS CONFIG
// =========================================================================
async function fetchLevels() {
    const tbody = document.getElementById('levels-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang tải...</td></tr>';
    try {
        const res = await fetch(`${API_BASE}/admin/levels-config`);
        const data = await res.json();
        if (!data.success) { tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-500 py-10">❌ Lỗi tải dữ liệu</td></tr>'; return; }
        const levels = data.levels || [];
        if (levels.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-500 py-10">Không có dữ liệu</td></tr>'; return; }
        tbody.innerHTML = levels.map(l => `<tr>
            <td style="color:#6b7280;">${l.id}</td>
            <td style="font-weight:600;color:#fbbf24;">${l.ten_canh_gioi || '—'}</td>
            <td style="color:#60a5fa;">${Number(l.exp_yeu_cau).toLocaleString()}</td>
            <td>${Number(l.than_luc_yeu_cau).toLocaleString()}</td>
            <td style="font-weight:600;color:#34d399;">${l.ty_le_thanh_cong}%</td>
            <td style="color:#fbbf24;">${Number(l.linh_thach_phuc_hoi).toLocaleString()} LT</td>
            <td><div class="action-btn-group">
                <button class="action-btn edit" onclick="editLevel(${l.id})"><i class="fa-solid fa-pen"></i></button>
                <button class="action-btn delete" onclick="deleteLevel(${l.id})"><i class="fa-solid fa-trash"></i></button>
            </div></td>
        </tr>`).join('');
    } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-500 py-10">❌ Lỗi kết nối</td></tr>'; }
}

function openAddLevelModal() {
    openEditModal(`
        <h3><i class="fa-solid fa-plus text-emerald-400"></i> Thêm Cảnh Giới Mới</h3>
        <input type="hidden" id="lv-id" value="" />
        <div class="form-group"><label><i class="fa-solid fa-mountain text-yellow-400"></i> Tên Cảnh Giới</label><input type="text" id="lv-name" placeholder="VD: Luyện Khí" /></div>
        <div class="form-row">
            <div class="form-group"><label><i class="fa-solid fa-star text-blue-400"></i> EXP Yêu Cầu</label><input type="number" id="lv-exp" min="0" value="0" /></div>
            <div class="form-group"><label><i class="fa-solid fa-dumbbell text-green-400"></i> Thần Lực</label><input type="number" id="lv-than-luc" min="0" value="0" /></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label><i class="fa-solid fa-percent text-emerald-400"></i> Tỷ Lệ (%)</label><input type="number" id="lv-ty-le" min="1" max="100" value="50" /></div>
            <div class="form-group"><label><i class="fa-solid fa-coins text-yellow-400"></i> Phí Hồi Phục (LT)</label><input type="number" id="lv-phi" min="0" value="0" /></div>
        </div>
        <div class="modal-actions">
            <button class="modal-btn cancel" onclick="closeEditModal()">Hủy</button>
            <button class="modal-btn primary" onclick="saveLevel()"><i class="fa-solid fa-floppy-disk"></i> Lưu</button>
        </div>
    `);
}

async function editLevel(id) {
    try {
        const res = await fetch(`${API_BASE}/admin/levels-config`);
        const data = await res.json();
        if (!data.success) { showToast('❌ Lỗi tải!', 'error'); return; }
        const lv = data.levels.find(l => l.id == id);
        if (!lv) { showToast('❌ Không tìm thấy!', 'error'); return; }
        openEditModal(`
            <h3><i class="fa-solid fa-pen text-blue-400"></i> Chỉnh Sửa: ${lv.ten_canh_gioi}</h3>
            <input type="hidden" id="lv-id" value="${lv.id}" />
            <input type="hidden" id="lv-name" value="${lv.ten_canh_gioi}" />
            <div class="form-row">
                <div class="form-group"><label><i class="fa-solid fa-star text-blue-400"></i> EXP Yêu Cầu</label><input type="number" id="lv-exp" min="0" value="${lv.exp_yeu_cau}" /></div>
                <div class="form-group"><label><i class="fa-solid fa-dumbbell text-green-400"></i> Thần Lực</label><input type="number" id="lv-than-luc" min="0" value="${lv.than_luc_yeu_cau}" /></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label><i class="fa-solid fa-percent text-emerald-400"></i> Tỷ Lệ (%)</label><input type="number" id="lv-ty-le" min="1" max="100" value="${lv.ty_le_thanh_cong}" /></div>
                <div class="form-group"><label><i class="fa-solid fa-coins text-yellow-400"></i> Phí Hồi Phục (LT)</label><input type="number" id="lv-phi" min="0" value="${lv.linh_thach_phuc_hoi}" /></div>
            </div>
            <div class="modal-actions">
                <button class="modal-btn cancel" onclick="closeEditModal()">Hủy</button>
                <button class="modal-btn primary" onclick="saveLevel()"><i class="fa-solid fa-floppy-disk"></i> Lưu</button>
            </div>
        `);
    } catch (e) { showToast('❌ Lỗi kết nối!', 'error'); }
}

async function saveLevel() {
    const id = document.getElementById('lv-id').value;
    const ten_canh_gioi = document.getElementById('lv-name')?.value?.trim();
    const exp = parseInt(document.getElementById('lv-exp').value);
    const thanLuc = parseInt(document.getElementById('lv-than-luc').value);
    const tyLe = parseInt(document.getElementById('lv-ty-le').value);
    const phi = parseInt(document.getElementById('lv-phi').value);

    if (!id && !ten_canh_gioi) { showToast('❌ Nhập tên cảnh giới!', 'error'); return; }
    if (exp < 0 || thanLuc < 0 || phi < 0) { showToast('❌ Giá trị không được âm!', 'error'); return; }
    if (isNaN(tyLe) || tyLe < 1 || tyLe > 100) { showToast('❌ Tỷ lệ phải từ 1-100%!', 'error'); return; }

    try {
        let url, method, successMsg;
        if (id) {
            url = `${API_BASE}/admin/levels-config/${id}`;
            method = 'PUT';
            successMsg = '✅ Cập nhật cảnh giới thành công!';
        } else {
            url = `${API_BASE}/admin/levels-config`;
            method = 'POST';
            successMsg = '✅ Thêm cảnh giới thành công!';
        }
        const body = { exp_yeu_cau: exp, than_luc_yeu_cau: thanLuc, ty_le_thanh_cong: tyLe, linh_thach_phuc_hoi: phi };
        if (!id) body.ten_canh_gioi = ten_canh_gioi;

        const res = await fetch(url, {
            method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) { showToast(data.message || successMsg, 'success'); closeEditModal(); fetchLevels(); }
        else { showToast(`❌ ${data.error}`, 'error'); }
    } catch (e) { showToast('❌ Lỗi kết nối!', 'error'); }
}

function deleteLevel(id) {
    openModal('🗑️ Xóa cảnh giới', 'Bạn chắc chắn muốn xóa cảnh giới này? Người dùng đang ở cảnh giới này sẽ bị lỗi!', 'Xóa', 'danger', async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/levels-config/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) { showToast(data.message, 'success'); fetchLevels(); }
            else { showToast(`❌ ${data.error}`, 'error'); }
        } catch (e) { showToast('❌ Lỗi!', 'error'); }
    });
}

// =========================================================================
// TAB 2: SHOP ITEMS
// =========================================================================
async function fetchShopItems() {
    const tbody = document.getElementById('shop-table-body');
    const countEl = document.getElementById('shop-count');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang tải...</td></tr>';
    try {
        const res = await fetch(`${API_BASE}/admin/shop-items`);
        const data = await res.json();
        if (!data.success) { tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10">❌ Lỗi</td></tr>'; return; }
        const items = data.items || [];
        if (countEl) countEl.textContent = `(${items.length} vật phẩm)`;
        if (items.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10">Chưa có vật phẩm</td></tr>'; return; }
        tbody.innerHTML = items.map(item => {
            const isActive = item.is_active === true || item.is_active === 1;
            const effectLabel = item.effect_type === 'ADD_EXP' ? '📈 Tăng EXP' : '💚 Trị thương';
            return `<tr>
                <td style="color:#6b7280;">${item.id}</td>
                <td style="font-weight:600;color:#f1f5f9;">${item.name || '—'}</td>
                <td>${effectLabel}</td>
                <td>${Number(item.effect_value).toLocaleString()}</td>
                <td style="color:#fbbf24;">${Number(item.price_linh_thach).toLocaleString()} LT</td>
                <td style="color:#c084fc;">${Number(item.price_kim_cuong).toLocaleString()} KC</td>
                <td><span class="badge ${isActive ? 'active' : 'inactive'}">${isActive ? '✅ Bật' : '❌ Tắt'}</span></td>
                <td><div class="action-btn-group"><button class="action-btn edit" onclick="editShopItem(${item.id})"><i class="fa-solid fa-pen"></i></button><button class="action-btn delete" onclick="deleteShopItem(${item.id})"><i class="fa-solid fa-trash"></i></button></div></td>
            </tr>`;
        }).join('');
    } catch (e) { tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10">❌ Lỗi</td></tr>'; }
}

function openAddShopItemModal() {
    openEditModal(`<h3><i class="fa-solid fa-plus text-emerald-400"></i> Thêm Vật Phẩm Mới</h3>
        <input type="hidden" id="shop-id" value="" />
        <div class="form-group"><label>Tên Vật Phẩm</label><input type="text" id="shop-name" placeholder="VD: Tụ Khí Đan" /></div>
        <div class="form-row"><div class="form-group"><label>Loại Hiệu Ứng</label><select id="shop-effect-type"><option value="ADD_EXP">📈 Tăng EXP</option><option value="HEAL_INJURY">💚 Trị thương</option></select></div>
        <div class="form-group"><label>Giá Trị</label><input type="number" id="shop-effect-value" min="0" value="0" /></div></div>
        <div class="form-row"><div class="form-group"><label><i class="fa-solid fa-coins text-yellow-400"></i> Giá LT</label><input type="number" id="shop-price-lt" min="0" value="0" /></div>
        <div class="form-group"><label><i class="fa-solid fa-gem text-purple-400"></i> Giá KC</label><input type="number" id="shop-price-kc" min="0" value="0" /></div></div>
        <div class="form-group"><label>Mô Tả</label><textarea id="shop-desc" rows="2"></textarea></div>
        <div class="form-group"><label>Trạng Thái</label><select id="shop-active"><option value="true">✅ Hoạt động</option><option value="false">❌ Tắt</option></select></div>
        <div class="modal-actions"><button class="modal-btn cancel" onclick="closeEditModal()">Hủy</button><button class="modal-btn primary" onclick="saveShopItem()"><i class="fa-solid fa-floppy-disk"></i> Lưu</button></div>`);
}

async function editShopItem(id) {
    try {
        const res = await fetch(`${API_BASE}/admin/shop-items`);
        const data = await res.json();
        if (!data.success) { showToast('❌ Lỗi tải!', 'error'); return; }
        const item = data.items.find(i => i.id == id);
        if (!item) { showToast('❌ Không tìm thấy!', 'error'); return; }
        openEditModal(`<h3><i class="fa-solid fa-pen text-blue-400"></i> Chỉnh Sửa: ${item.name}</h3>
            <input type="hidden" id="shop-id" value="${item.id}" />
            <div class="form-group"><label>Tên</label><input type="text" id="shop-name" value="${item.name || ''}" /></div>
            <div class="form-row"><div class="form-group"><label>Loại</label><select id="shop-effect-type"><option value="ADD_EXP" ${item.effect_type === 'ADD_EXP' ? 'selected' : ''}>📈 Tăng EXP</option><option value="HEAL_INJURY" ${item.effect_type === 'HEAL_INJURY' ? 'selected' : ''}>💚 Trị thương</option></select></div>
            <div class="form-group"><label>Giá Trị</label><input type="number" id="shop-effect-value" min="0" value="${item.effect_value || 0}" /></div></div>
            <div class="form-row"><div class="form-group"><label>Giá LT</label><input type="number" id="shop-price-lt" min="0" value="${item.price_linh_thach || 0}" /></div>
            <div class="form-group"><label>Giá KC</label><input type="number" id="shop-price-kc" min="0" value="${item.price_kim_cuong || 0}" /></div></div>
            <div class="form-group"><label>Mô Tả</label><textarea id="shop-desc" rows="2">${item.description || ''}</textarea></div>
            <div class="form-group"><label>Trạng Thái</label><select id="shop-active"><option value="true" ${item.is_active ? 'selected' : ''}>✅ Hoạt động</option><option value="false" ${!item.is_active ? 'selected' : ''}>❌ Tắt</option></select></div>
            <div class="modal-actions"><button class="modal-btn cancel" onclick="closeEditModal()">Hủy</button><button class="modal-btn primary" onclick="saveShopItem()"><i class="fa-solid fa-floppy-disk"></i> Lưu</button></div>`);
    } catch (e) { showToast('❌ Lỗi!', 'error'); }
}

async function saveShopItem() {
    const id = document.getElementById('shop-id').value;
    const name = document.getElementById('shop-name').value.trim();
    const effectType = document.getElementById('shop-effect-type').value;
    const effectValue = parseInt(document.getElementById('shop-effect-value').value) || 0;
    const priceLT = parseInt(document.getElementById('shop-price-lt').value) || 0;
    const priceKC = parseInt(document.getElementById('shop-price-kc').value) || 0;
    const desc = document.getElementById('shop-desc').value.trim();
    const isActive = document.getElementById('shop-active').value === 'true';
    if (!name) { showToast('❌ Nhập tên vật phẩm!', 'error'); return; }
    if (priceLT === 0 && priceKC === 0) { showToast('❌ Phải có giá LT hoặc KC!', 'error'); return; }
    try {
        let url, method, successMsg;
        if (id) { url = `${API_BASE}/admin/shop-items/${id}`; method = 'PUT'; successMsg = '✅ Cập nhật thành công!'; }
        else { url = `${API_BASE}/admin/shop-items`; method = 'POST'; successMsg = '✅ Thêm thành công!'; }
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, effect_type: effectType, effect_value: effectValue, price_linh_thach: priceLT, price_kim_cuong: priceKC, description: desc, is_active: isActive }) });
        const data = await res.json();
        if (data.success) { showToast(data.message || successMsg, 'success'); closeEditModal(); fetchShopItems(); }
        else { showToast(`❌ ${data.error}`, 'error'); }
    } catch (e) { showToast('❌ Lỗi kết nối!', 'error'); }
}

function deleteShopItem(id) {
    openModal('🗑️ Xóa vật phẩm', 'Bạn chắc chắn muốn xóa vật phẩm này?', 'Xóa', 'danger', async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/shop-items/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) { showToast(data.message, 'success'); fetchShopItems(); }
            else { showToast(`❌ ${data.error}`, 'error'); }
        } catch (e) { showToast('❌ Lỗi!', 'error'); }
    });
}

// =========================================================================
// TAB 3: MISSIONS CONFIG ĐỘNG
// =========================================================================
const ACTION_TYPES = {
    READ_CHAPTER: '📖 Đọc chương',
    COMMENT: '💬 Bình luận',
    LOGIN: '🔑 Đăng nhập',
    NOMINATE: '⭐ Đề cử',
    TOPUP: '💎 Nạp thẻ'
};

async function fetchMissions() {
    const tbody = document.getElementById('missions-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-500 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Đang tải...</td></tr>';
    try {
        const res = await fetch(`${API_BASE}/admin/missions-config`);
        const data = await res.json();
        if (!data.success) { tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-500 py-10">❌ Lỗi</td></tr>'; return; }
        const missions = data.missions || [];
        if (missions.length === 0) { tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-500 py-10">Không có nhiệm vụ</td></tr>'; return; }
        tbody.innerHTML = missions.map(m => {
            const actionLabel = ACTION_TYPES[m.action_type] || m.action_type || '—';
            const cycleLabel = m.cycle === 'DAILY' ? '🔄 Hàng ngày' : '🔁 Một lần';
            const isActive = m.is_active === true || m.is_active === 1;
            const activeBadge = isActive ? '<span class="badge active">✅ Bật</span>' : '<span class="badge inactive">❌ Tắt</span>';
            return `<tr>
                <td style="font-weight:600;color:#f1f5f9;">${m.name || m.mission_type || '—'}</td>
                <td style="color:#6b7280;font-size:11px;">${m.mission_type || '—'}</td>
                <td style="color:#60a5fa;">${actionLabel}</td>
                <td style="font-weight:600;color:#fbbf24;">${m.target_value || 1}</td>
                <td>${cycleLabel}</td>
                <td>${activeBadge}</td>
                <td style="color:#fbbf24;">${Number(m.reward_lt || 0).toLocaleString()} LT</td>
                <td style="color:#60a5fa;">${Number(m.reward_exp || 0).toLocaleString()} EXP</td>
                <td><div class="action-btn-group">
                    <button class="action-btn edit" onclick="editMission('${m.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="action-btn delete" onclick="deleteMission('${m.id}')"><i class="fa-solid fa-trash"></i></button>
                </div></td>
            </tr>`;
        }).join('');
    } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gray-500 py-10">❌ Lỗi</td></tr>'; }
}

function openAddMissionModal() {
    const actionOptions = Object.entries(ACTION_TYPES).map(([val, label]) => 
        `<option value="${val}">${label}</option>`
    ).join('');

    openEditModal(`
        <h3><i class="fa-solid fa-plus text-emerald-400"></i> Thêm Nhiệm Vụ Mới</h3>
        <input type="hidden" id="ms-id" value="" />
        
        <div class="form-group">
            <label><i class="fa-solid fa-heading"></i> Tên Hiển Thị</label>
            <input type="text" id="ms-name" placeholder="VD: Đọc 5 chương truyện" />
        </div>
        
        <div class="form-group">
            <label><i class="fa-solid fa-key"></i> Mã Nhiệm Vụ (unique)</label>
            <input type="text" id="ms-type" placeholder="VD: read_5_chapters" />
            <div style="font-size:10px;color:#6b7280;margin-top:2px;">💡 Dùng chữ thường, không dấu, gạch dưới</div>
        </div>
        
        <div class="form-row">
            <div class="form-group">
                <label><i class="fa-solid fa-bolt text-blue-400"></i> Loại Hành Động</label>
                <select id="ms-action-type">${actionOptions}</select>
            </div>
            <div class="form-group">
                <label><i class="fa-solid fa-bullseye text-orange-400"></i> Số Lượng Yêu Cầu</label>
                <input type="number" id="ms-target" min="1" value="1" />
                <div style="font-size:10px;color:#fcd34d;margin-top:2px;">VD: 5 = cần làm 5 lần</div>
            </div>
        </div>
        
        <div class="form-row">
            <div class="form-group">
                <label><i class="fa-solid fa-rotate text-purple-400"></i> Chu Kỳ</label>
                <select id="ms-cycle">
                    <option value="DAILY">🔄 Hàng ngày</option>
                    <option value="WEEKLY">📆 Hàng tuần</option>
                    <option value="ONCE">🔁 Tân thủ (một lần)</option>
                </select>
            </div>
            <div class="form-group">
                <label><i class="fa-solid fa-power-off text-green-400"></i> Trạng Thái</label>
                <select id="ms-active">
                    <option value="true">✅ Hoạt động</option>
                    <option value="false">❌ Tắt</option>
                </select>
            </div>
        </div>
        
        <div class="form-row">
            <div class="form-group">
                <label><i class="fa-solid fa-coins text-yellow-400"></i> Thưởng Linh Thạch</label>
                <input type="number" id="ms-lt" min="0" value="1" />
            </div>
            <div class="form-group">
                <label><i class="fa-solid fa-star text-blue-400"></i> Thưởng EXP</label>
                <input type="number" id="ms-exp" min="0" value="0" />
            </div>
        </div>
        
        <div class="modal-actions">
            <button class="modal-btn cancel" onclick="closeEditModal()">Hủy</button>
            <button class="modal-btn primary" onclick="saveMission()"><i class="fa-solid fa-floppy-disk"></i> Lưu</button>
        </div>
    `);
}

async function editMission(id) {
    try {
        const res = await fetch(`${API_BASE}/admin/missions-config`);
        const data = await res.json();
        if (!data.success) { showToast('❌ Lỗi tải!', 'error'); return; }
        const m = data.missions.find(x => String(x.id) === String(id));
        if (!m) { showToast('❌ Không tìm thấy!', 'error'); return; }

        const actionOptions = Object.entries(ACTION_TYPES).map(([val, label]) => 
            `<option value="${val}" ${m.action_type === val ? 'selected' : ''}>${label}</option>`
        ).join('');

        const cycleOptions = ['DAILY', 'ONCE'].map(c => 
            `<option value="${c}" ${m.cycle === c ? 'selected' : ''}>${c === 'DAILY' ? '🔄 Hàng ngày' : '🔁 Một lần'}</option>`
        ).join('');

        const activeOptions = 
            `<option value="true" ${m.is_active ? 'selected' : ''}>✅ Hoạt động</option>
             <option value="false" ${!m.is_active ? 'selected' : ''}>❌ Tắt</option>`;

        openEditModal(`
            <h3><i class="fa-solid fa-pen text-blue-400"></i> Chỉnh Sửa: ${m.name || m.mission_type}</h3>
            <input type="hidden" id="ms-id" value="${m.id}" />
            
            <div class="form-group">
                <label>Tên Hiển Thị</label>
                <input type="text" id="ms-name" value="${m.name || ''}" />
            </div>
            
            <div class="form-group">
                <label>Mã Nhiệm Vụ</label>
                <input type="text" id="ms-type" value="${m.mission_type}" disabled style="opacity:0.6;cursor:not-allowed;" />
                <div style="font-size:10px;color:#6b7280;margin-top:2px;">🔒 Không thể thay đổi mã nhiệm vụ</div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Loại Hành Động</label>
                    <select id="ms-action-type">${actionOptions}</select>
                </div>
                <div class="form-group">
                    <label>Số Lượng Yêu Cầu</label>
                    <input type="number" id="ms-target" min="1" value="${m.target_value || 1}" />
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Chu Kỳ</label>
                    <select id="ms-cycle">${cycleOptions}</select>
                </div>
                <div class="form-group">
                    <label>Trạng Thái</label>
                    <select id="ms-active">${activeOptions}</select>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Thưởng Linh Thạch</label>
                    <input type="number" id="ms-lt" min="0" value="${m.reward_lt || 0}" />
                </div>
                <div class="form-group">
                    <label>Thưởng EXP</label>
                    <input type="number" id="ms-exp" min="0" value="${m.reward_exp || 0}" />
                </div>
            </div>
            
            <div class="modal-actions">
                <button class="modal-btn cancel" onclick="closeEditModal()">Hủy</button>
                <button class="modal-btn primary" onclick="saveMission()"><i class="fa-solid fa-floppy-disk"></i> Lưu</button>
            </div>
        `);
    } catch (e) { showToast('❌ Lỗi!', 'error'); }
}

async function saveMission() {
    const id = document.getElementById('ms-id').value;
    const name = document.getElementById('ms-name').value.trim();
    const mission_type = document.getElementById('ms-type').value.trim();
    const action_type = document.getElementById('ms-action-type')?.value;
    const target_value = parseInt(document.getElementById('ms-target')?.value) || 1;
    const cycle = document.getElementById('ms-cycle')?.value || 'DAILY';
    const is_active = document.getElementById('ms-active')?.value === 'true';
    const lt = parseInt(document.getElementById('ms-lt').value) || 0;
    const exp = parseInt(document.getElementById('ms-exp').value) || 0;

    if (!name) { showToast('❌ Nhập tên hiển thị!', 'error'); return; }
    if (!id && !mission_type) { showToast('❌ Nhập mã nhiệm vụ!', 'error'); return; }
    if (lt < 0) { showToast('❌ Thưởng LT không được âm!', 'error'); return; }
    if (exp < 0) { showToast('❌ Thưởng EXP không được âm!', 'error'); return; }
    if (target_value < 1) { showToast('❌ Số lượng yêu cầu phải >= 1!', 'error'); return; }

    try {
        let url, method, successMsg;
        if (id) {
            url = `${API_BASE}/admin/missions-config/${id}`;
            method = 'PUT';
            successMsg = '✅ Cập nhật nhiệm vụ thành công!';
        } else {
            url = `${API_BASE}/admin/missions-config`;
            method = 'POST';
            successMsg = '✅ Thêm nhiệm vụ thành công!';
        }

        const body = { 
            name, 
            reward_lt: lt, 
            reward_exp: exp,
            action_type,
            target_value,
            cycle,
            is_active
        };
        if (!id) body.mission_type = mission_type;
        else body.mission_type = mission_type;

        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (data.success) { showToast(data.message || successMsg, 'success'); closeEditModal(); fetchMissions(); }
        else { showToast(`❌ ${data.error}`, 'error'); }
    } catch (e) { showToast('❌ Lỗi kết nối!', 'error'); }
}

function deleteMission(id) {
    openModal('🗑️ Xóa nhiệm vụ', 'Bạn chắc chắn muốn xóa nhiệm vụ này? Tiến độ người dùng liên quan cũng sẽ bị xóa!', 'Xóa', 'danger', async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/missions-config/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) { showToast(data.message, 'success'); fetchMissions(); }
            else { showToast(`❌ ${data.error}`, 'error'); }
        } catch (e) { showToast('❌ Lỗi!', 'error'); }
    });
}

// =========================================================================
// INIT
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    fetchLevels();
});