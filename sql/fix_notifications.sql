-- ============================================================
-- FIX: Thêm DEFAULT gen_random_uuid() cho bảng notifications
-- ============================================================

-- Sửa cột id để có DEFAULT (cần DROP DEFAULT cũ nếu có rồi ADD lại)
ALTER TABLE public.notifications 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Kiểm tra: 
-- SELECT column_name, column_default FROM information_schema.columns 
-- WHERE table_name = 'notifications' AND column_name = 'id';
-- Kết quả phải hiển thị: "gen_random_uuid()"