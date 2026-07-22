-- Thêm cột linh_thach, kim_cuong cho bảng notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS linh_thach INTEGER DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS kim_cuong INTEGER DEFAULT 0;