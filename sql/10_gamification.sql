-- ============================================================
-- GAMIFICATION: HỆ THỐNG TU TIÊN ĐỌC TRUYỆN (PHẦN 1)
-- ============================================================

-- 1. Cập nhật bảng profiles: thêm cột tu tiên và tiền tệ
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS kim_cuong integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS linh_thach integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tu_vi_exp integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS canh_gioi_id integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS kinh_mach integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS than_thuc integer DEFAULT 12,
ADD COLUMN IF NOT EXISTS than_the integer DEFAULT 15,
ADD COLUMN IF NOT EXISTS ngo_tinh numeric(3,1) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS is_injured boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS injured_until timestamptz DEFAULT NULL;

-- 2. Bảng cấu hình cảnh giới (levels_config) - Xóa bảng cũ nếu có cấu trúc khác
DROP TABLE IF EXISTS public.levels_config CASCADE;
CREATE TABLE public.levels_config (
    id integer PRIMARY KEY,
    ten_canh_gioi text NOT NULL,
    exp_yeu_cau integer NOT NULL,
    than_luc_yeu_cau integer NOT NULL,
    ty_le_thanh_cong integer NOT NULL,
    linh_thach_phuc_hoi integer DEFAULT 0
);

-- 3. Bảng quản lý túi đồ User
CREATE TABLE IF NOT EXISTS public.user_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    item_name text NOT NULL,
    so_luong integer DEFAULT 0,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT unique_user_item UNIQUE (user_id, item_name)
);

-- 4. Bảng lịch sử giao dịch/nạp tiền (sử dụng cấu trúc có sẵn)
-- Bảng cũ đã có: id, user_id, amount, transaction_type, reference_id, description, created_at
-- Thêm cột mới nếu chưa có
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS amount_vnd integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS kim_cuong_added integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_method text DEFAULT '',
ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';

-- 5. Bảng cấu hình vật phẩm (shop items)
CREATE TABLE IF NOT EXISTS public.shop_items (
    id integer PRIMARY KEY,
    name text NOT NULL,
    description text,
    price_linh_thach integer DEFAULT 0,
    price_kim_cuong integer DEFAULT 0,
    effect_type text NOT NULL,
    effect_value integer DEFAULT 0,
    is_active boolean DEFAULT true
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_items_user ON user_items (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_canhgioi ON profiles (canh_gioi_id);

-- ============================================================
-- SEED DATA: CẤU HÌNH CẢNH GIỚI
-- ============================================================
INSERT INTO public.levels_config (id, ten_canh_gioi, exp_yeu_cau, than_luc_yeu_cau, ty_le_thanh_cong, linh_thach_phuc_hoi)
VALUES 
    (1, 'Phàm Nhân', 100, 10, 100, 0),
    (2, 'Phàm Nhân Tầng 2', 200, 15, 100, 0),
    (3, 'Phàm Nhân Tầng 3', 300, 20, 100, 0),
    (4, 'Luyện Khí Tầng 1', 500, 30, 85, 50),
    (5, 'Luyện Khí Tầng 2', 600, 35, 83, 50),
    (6, 'Luyện Khí Tầng 3', 700, 40, 81, 50),
    (7, 'Luyện Khí Tầng 4', 800, 45, 79, 50),
    (8, 'Luyện Khí Tầng 5', 1000, 50, 77, 50),
    (9, 'Luyện Khí Tầng 6', 1200, 55, 74, 50),
    (10, 'Luyện Khí Tầng 7', 1300, 60, 72, 50),
    (11, 'Luyện Khí Tầng 8', 1400, 65, 70, 50),
    (12, 'Luyện Khí Tầng 9', 1500, 70, 70, 50),
    (13, 'Trúc Cơ Tầng 1', 3000, 80, 65, 100),
    (14, 'Trúc Cơ Tầng 2', 4000, 90, 63, 100),
    (15, 'Trúc Cơ Tầng 3', 5000, 100, 61, 100),
    (16, 'Trúc Cơ Tầng 4', 6000, 110, 59, 100),
    (17, 'Trúc Cơ Tầng 5', 6500, 120, 57, 100),
    (18, 'Trúc Cơ Tầng 6', 7000, 130, 55, 100),
    (19, 'Trúc Cơ Tầng 7', 7500, 140, 52, 100),
    (20, 'Trúc Cơ Tầng 8', 8000, 150, 50, 100),
    (21, 'Kết Đan Sơ Kỳ', 15000, 200, 40, 200),
    (22, 'Kết Đan Trung Kỳ', 20000, 250, 35, 200),
    (23, 'Kết Đan Hậu Kỳ', 30000, 350, 30, 200),
    (24, 'Nguyên Anh Sơ Kỳ', 50000, 500, 20, 500),
    (25, 'Nguyên Anh Trung Kỳ', 75000, 650, 18, 500),
    (26, 'Nguyên Anh Hậu Kỳ', 100000, 800, 15, 500);

-- ============================================================
-- SEED DATA: CỬA HÀNG (SHOP ITEMS)
-- ============================================================
INSERT INTO public.shop_items (id, name, description, price_linh_thach, price_kim_cuong, effect_type, effect_value)
VALUES 
    (1, 'Tụ Khí Đan', 'Khi dùng, cộng thẳng +50 EXP tu vi', 150, 0, 'add_exp', 50),
    (2, 'Tẩy Tủy Đan', 'Reset toàn bộ điểm chỉ số Thần lực, trả lại điểm tự do', 300, 0, 'reset_stats', 0),
    (3, 'Hỗn Nguyên Đan', 'Bảo hiểm độ kiếp: xóa mọi hình phạt khi đột phá thất bại', 500, 0, 'breakthrough_protect', 1),
    (4, 'Linh Thạch 1000', 'Gói Linh Thạch 1000 đơn vị', 0, 10, 'add_linh_thach', 1000),
    (5, 'Linh Thạch 5000', 'Gói Linh Thạch 5000 đơn vị (tiết kiệm 16%)', 0, 42, 'add_linh_thach', 5000),
    (6, 'Ngộ Tính Đan', 'Tăng vĩnh viễn Ngộ Tính +0.5', 0, 20, 'add_ngo_tinh', 5),
    (7, 'Phiếu Đề Cử', 'Dùng để đề cử truyện yêu thích lên BXH. Mỗi phiếu tương ứng 1 lượt đề cử!', 100, 0, 'nominate_ticket', 1);
