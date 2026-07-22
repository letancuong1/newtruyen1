/**
 * Admin Crawler - Xử lý giao diện cào truyện tự động
 * Dùng fetch POST đơn giản (không SSE)
 */

let currentMode = 'link';
let isRunning = false;
let logCount = 0;
let totalBooksCrawled = 0;
let totalChaptersSaved = 0;

// ===================== SIDEBAR =====================
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
}

// ===================== MODE SWITCH =====================
function setMode(mode) {
    currentMode = mode;
    document.getElementById('mode-link').classList.toggle('active', mode === 'link');
    document.getElementById('mode-list').classList.toggle('active', mode === 'list');
    document.getElementById('mode-pages').classList.toggle('active', mode === 'pages');
    document.getElementById('form-link').style.display = mode === 'link' ? 'block' : 'none';
    document.getElementById('form-list').style.display = mode === 'list' ? 'block' : 'none';
    document.getElementById('form-pages').style.display = mode === 'pages' ? 'block' : 'none';
}

// ===================== LOGGING =====================
function addLog(message, type = 'info') {
    const container = document.getElementById('log-container');
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.textContent = message;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    logCount++;
    document.getElementById('log-count').textContent = `(${logCount} dòng)`;
}

function clearLog() {
    document.getElementById('log-container').innerHTML = '';
    logCount = 0;
    document.getElementById('log-count').textContent = `(0 dòng)`;
    addLog('🔄 Đã xóa log. Sẵn sàng.', 'info');
}

function copyLog() {
    const container = document.getElementById('log-container');
    const texts = [];
    container.querySelectorAll('.log-entry').forEach(el => texts.push(el.textContent));
    const content = texts.join('\n');
    navigator.clipboard.writeText(content).then(() => {
        showToast('✅ Đã sao chép log!', 'success');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = content;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('✅ Đã sao chép log!', 'success');
    });
}

// ===================== TOAST =====================
function showToast(message, type = 'success') {
    let container = document.getElementById('admin-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'admin-toast-container';
        container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${message}`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ===================== UPDATE STATS =====================
function updateStats() {
    document.getElementById('stat-books').textContent = totalBooksCrawled;
    document.getElementById('stat-chapters').textContent = totalChaptersSaved;
}

function setStatus(text, isRunningState = false) {
    const el = document.getElementById('stat-status');
    el.textContent = text;
    el.style.color = isRunningState ? '#fbbf24' : '#34d399';
    if (isRunningState) el.classList.add('pulse');
    else el.classList.remove('pulse');
}

// ===================== START CRAWL =====================
function startCrawl() {
    if (isRunning) {
        showToast('⚠️ Đang có tiến trình cào!', 'error');
        return;
    }

    let body = {};

    if (currentMode === 'link') {
        const link = document.getElementById('input-link').value.trim();
        if (!link) {
            showToast('⚠️ Nhập link truyện!', 'error');
            return;
        }
        body = { link };
    } else if (currentMode === 'list') {
        const list = document.getElementById('input-list').value.trim();
        if (!list) {
            showToast('⚠️ Nhập link danh sách!', 'error');
            return;
        }
        body = { list };
    } else {
        const pages = parseInt(document.getElementById('input-pages').value) || 1;
        if (pages < 1 || pages > 100) {
            showToast('⚠️ Số trang 1-100!', 'error');
            return;
        }
        body = { pages };
    }

    // Reset
    totalBooksCrawled = 0;
    totalChaptersSaved = 0;
    updateStats();

    setControlsEnabled(false);
    setStatus('Đang cào...', true);
    isRunning = true;

    addLog('🚀 Đang gửi yêu cầu đến server...', 'info');
    addLog(`   Body: ${JSON.stringify(body)}`, 'info');

    fetch('/api/admin/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(async (response) => {
        if (!response.ok) {
            throw new Error(`Server lỗi ${response.status}`);
        }
        return response.json();
    })
    .then((data) => {
        // Hiển thị logs
        if (data.logs && Array.isArray(data.logs)) {
            for (const msg of data.logs) {
                let logType = 'info';
                if (msg.includes('✅') || msg.includes('🎉') || msg.includes('HOÀN TẤT')) logType = 'success';
                else if (msg.includes('❌') || msg.includes('Lỗi')) logType = 'error';
                else if (msg.includes('⚠️')) logType = 'warning';
                else if (msg.includes('🎉')) logType = 'done';
                addLog(msg, logType);
            }
        }

        if (data.success && data.done) {
            addLog('🎉 Quá trình cào hoàn tất!', 'done');
            showToast('✅ Cào truyện hoàn tất!', 'success');

            if (data.result) {
                totalBooksCrawled = data.result.totalCrawled || (data.result.tenTruyen ? 1 : 0);
                totalChaptersSaved = data.result.totalChapters || 0;
                updateStats();
            }

            document.getElementById('progress-bar').style.width = '100%';
        } else if (data.error) {
            addLog(`❌ LỖI: ${data.error}`, 'error');
            showToast(`❌ ${data.error}`, 'error');
        }
    })
    .catch((err) => {
        addLog(`❌ Lỗi kết nối server: ${err.message}`, 'error');
        showToast(`❌ ${err.message}`, 'error');
    })
    .finally(() => {
        isRunning = false;
        setControlsEnabled(true);
        setStatus('Sẵn sàng', false);
        document.getElementById('btn-stop').disabled = true;
    });
}

// ===================== STOP =====================
function stopCrawl() {
    // Với API JSON đơn giản, không có cách hủy request
    // Chỉ disable nút
    addLog('⏹ Không thể hủy request đang chạy. Vui lòng đợi hoặc refresh trang.', 'warning');
}

// ===================== CONTROLS =====================
function setControlsEnabled(enabled) {
    document.getElementById('btn-crawl-link').disabled = !enabled;
    document.getElementById('btn-crawl-list').disabled = !enabled;
    document.getElementById('btn-crawl-pages').disabled = !enabled;
    document.getElementById('btn-stop').disabled = enabled;
    document.getElementById('input-link').disabled = !enabled;
    document.getElementById('input-list').disabled = !enabled;
    document.getElementById('input-pages').disabled = !enabled;
    document.querySelectorAll('.mode-toggle button').forEach(btn => {
        btn.style.pointerEvents = enabled ? 'auto' : 'none';
    });
}

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
    // Click outside to close sidebar on mobile
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('mobile-toggle');
        if (window.innerWidth <= 1024 && sidebar.classList.contains('open')) {
            if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
                closeSidebar();
            }
        }
    });

    // Enter key support
    document.getElementById('input-link').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isRunning) startCrawl();
    });
    document.getElementById('input-list').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isRunning) startCrawl();
    });
    document.getElementById('input-pages').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isRunning) startCrawl();
    });

    addLog('✅ Hệ thống đã sẵn sàng. Chọn chế độ và nhấn "Bắt Đầu".', 'success');
});