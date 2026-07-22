-- ============================================================
-- NÂNG CẤP HỆ THỐNG NHIỆM VỤ ĐỘNG (Dynamic Event-Driven Missions)
-- ============================================================

-- 1. NÂNG CẤP BẢNG missions_config
ALTER TABLE missions_config ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE missions_config ADD COLUMN IF NOT EXISTS action_type VARCHAR(50);
ALTER TABLE missions_config ADD COLUMN IF NOT EXISTS target_value INT DEFAULT 1;
ALTER TABLE missions_config ADD COLUMN IF NOT EXISTS cycle VARCHAR(20) DEFAULT 'DAILY';
ALTER TABLE missions_config ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. NÂNG CẤP BẢNG user_missions
ALTER TABLE user_missions ADD COLUMN IF NOT EXISTS mission_config_id UUID;
ALTER TABLE user_missions ADD COLUMN IF NOT EXISTS current_progress INT DEFAULT 0;
ALTER TABLE user_missions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'IN_PROGRESS';

-- 3. Ràng buộc cho action_type và cycle
-- PostgreSQL không có CHECK constraint kiểu ENUM đơn giản, dùng CHECK
ALTER TABLE missions_config DROP CONSTRAINT IF EXISTS missions_config_action_type_check;
ALTER TABLE missions_config ADD CONSTRAINT missions_config_action_type_check 
    CHECK (action_type IN ('READ_CHAPTER', 'COMMENT', 'LOGIN', 'NOMINATE', 'TOPUP'));

ALTER TABLE missions_config DROP CONSTRAINT IF EXISTS missions_config_cycle_check;
ALTER TABLE missions_config ADD CONSTRAINT missions_config_cycle_check 
    CHECK (cycle IN ('DAILY', 'ONCE'));

ALTER TABLE user_missions DROP CONSTRAINT IF EXISTS user_missions_status_check;
ALTER TABLE user_missions ADD CONSTRAINT user_missions_status_check 
    CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'CLAIMED'));

-- 4. Thêm UNIQUE constraint để mỗi user chỉ có 1 tiến độ cho mỗi nhiệm vụ
ALTER TABLE user_missions DROP CONSTRAINT IF EXISTS user_missions_unique;
ALTER TABLE user_missions ADD CONSTRAINT user_missions_unique UNIQUE (user_id, mission_config_id);

SELECT '✅ Đã nâng cấp hệ thống nhiệm vụ động thành công!' AS result;