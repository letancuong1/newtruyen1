-- ============================================================
-- FIX: Thêm các cột còn thiếu mà code API đang dùng
-- ============================================================

-- 1. THÊM CỘT updated_at CHO BẢNG profiles (QUAN TRỌNG NHẤT)
--    Code dùng ở: admin stats (dòng 1186) và thống kê VIP mới (dòng 2007)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Cập nhật updated_at = created_at cho các user đã tồn tại
UPDATE public.profiles SET updated_at = NOW() WHERE updated_at IS NULL;

-- Tạo trigger tự động cập nhật updated_at khi có thay đổi
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 2. KIỂM TRA CẤU TRÚC levels_config (QUAN TRỌNG)
--    Code cần: ten_canh_gioi, exp_yeu_cau, than_luc_yeu_cau, ty_le_thanh_cong, linh_thach_phuc_hoi
--    Nếu bạn chạy schema_template1.sql trước, bảng này sẽ có cột sai (realm_name, min_exp,...)
--    Hãy kiểm tra bằng lệnh: SELECT column_name FROM information_schema.columns WHERE table_name = 'levels_config';
--    
--    Nếu levels_config bị sai cấu trúc, chạy lệnh sau để xóa và tạo lại:
--    DROP TABLE IF EXISTS public.levels_config CASCADE;
--    (Sau đó chạy lại phần INSERT từ file 10_gamification.sql)

-- 3. THÊM CỘT CHO BẢNG transactions (nếu chưa có từ 10_gamification.sql)
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS amount_vnd INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS kim_cuong_added INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';

-- 4. TẠO BẢNG orders (nếu chưa có) - dùng cho thống kê VIP
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    package_id INTEGER,
    amount INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(255) DEFAULT 'PENDING',
    payment_method VARCHAR(255) DEFAULT '',
    package_type VARCHAR(255) DEFAULT '',
    package_value INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. THÊM INDEX CHO HIỆU NĂNG
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);