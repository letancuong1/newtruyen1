-- ============================================================
-- FIX DUY NHẤT: Thêm DEFAULT gen_random_uuid() cho notifications
-- ============================================================

ALTER TABLE notifications ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Kiểm tra:
-- SELECT column_name, column_default FROM information_schema.columns 
-- WHERE table_name = 'notifications' AND column_name = 'id';

SELECT '✅ Đã sửa DEFAULT cho notifications.id thành công!' AS result;