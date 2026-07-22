-- ============================================================
-- Cấp quyền OWNER cho bảng notifications cho user hiện tại
-- ============================================================
-- Thay 'hellotruyen_db' bằng tên user của bạn nếu khác

-- Kiểm tra user hiện tại
SELECT current_user;

-- Cấp quyền OWNER bảng notifications cho user của bạn
-- Nếu bảng thuộc về user khác (vd: postgres), chạy lệnh sau:
ALTER TABLE notifications OWNER TO hellotruyen_db;

-- Sau đó thêm 2 cột còn thiếu
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS linh_thach INTEGER DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS kim_cuong INTEGER DEFAULT 0;

-- Kiểm tra kết quả
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'notifications' 
ORDER BY ordinal_position;