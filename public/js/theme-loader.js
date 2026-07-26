/**
 * Theme Loader - Chạy ngay lập tức để chống FOUC (Flash of Unstyled Content)
 * File này phải được include trong <head> của TẤT CẢ các trang HTML
 */
(function() {
    try {
        // Đọc theme đã lưu, key 'tdt_theme' được đồng bộ từ profile.html
        var theme = localStorage.getItem('tdt_theme');
        if (theme && theme !== 'default') {
            // Thêm class vào <html> ngay lập tức trước khi trang render
            document.documentElement.classList.add('theme-' + theme);
            // Fallback: cũng thêm vào <body> nếu body đã tồn tại
            if (document.body) {
                document.body.classList.add('theme-' + theme);
            }
        }
    } catch(e) {
        // Bỏ qua lỗi (localStorage không khả dụng)
    }
})();