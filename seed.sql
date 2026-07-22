-- ============================================================
-- SEED DATA CHO THIÊN ĐẠO TRUYỆN DATABASE
-- ============================================================

-- 1. CATEGORIES (Thể loại)
INSERT INTO categories (id, slug, name, description) VALUES
(1, 'tien-hiep', 'Tiên Hiệp', 'Thể loại tu tiên, tu chân, phi thăng'),
(2, 'huyen-huyen', 'Huyền Huyễn', 'Thể loại huyền ảo, thế giới khác'),
(3, 'do-thi', 'Đô Thị', 'Thể loại thành thị hiện đại'),
(4, 'he-thong', 'Hệ Thống', 'Thể loại có hệ thống, xuyên không'),
(5, 'ngon-tinh', 'Ngôn Tình', 'Thể loại tình cảm, lãng mạn'),
(6, 'kiem-hiep', 'Kiếm Hiệp', 'Thể loại võ hiệp, giang hồ'),
(7, 'kinh-di', 'Kinh Dị', 'Thể loại ma quái, rùng rợn'),
(8, 'lich-su', 'Lịch Sử', 'Thể loại lịch sử, cổ đại');

-- 2. LEVELS_CONFIG (Cảnh giới)
INSERT INTO levels_config (id, realm_name, min_exp, avatar_frame_url, username_color, effects_config) VALUES
(1, 'Phàm Nhân', 0, NULL, '#9ca3af', '{"particle": false}'),
(2, 'Luyện Khí', 100, NULL, '#10b981', '{"particle": true}'),
(3, 'Trúc Cơ', 300, NULL, '#06b6d4', '{"particle": true}'),
(4, 'Kết Đan', 600, NULL, '#8b5cf6', '{"particle": true, "glow": true}'),
(5, 'Nguyên Anh', 1000, NULL, '#d946ef', '{"particle": true, "glow": true}'),
(6, 'Hóa Thần', 1500, NULL, '#f59e0b', '{"particle": true, "glow": true}'),
(7, 'Luyện Hư', 2100, NULL, '#ef4444', '{"particle": true, "glow": true}'),
(8, 'Hợp Thể', 2800, NULL, '#06b6d4', '{"particle": true, "glow": true, "trail": true}'),
(9, 'Đại Thừa', 3600, NULL, '#8b5cf6', '{"particle": true, "glow": true, "trail": true}'),
(10, 'Độ Kiếp', 4500, NULL, '#f59e0b', '{"particle": true, "glow": true, "trail": true}'),
(11, 'Chân Tiên', 5500, NULL, '#ffd700', '{"particle": true, "glow": true, "trail": true, "aura": true}');

-- 3. MISSIONS_CONFIG (Nhiệm vụ)
INSERT INTO missions_config (id, mission_type, reward_exp, reward_lt) VALUES
('a1b2c3d4-0001-4000-8000-000000000001', 'daily_read', 120, 50),
('a1b2c3d4-0002-4000-8000-000000000002', 'daily_login', 50, 100),
('a1b2c3d4-0003-4000-8000-000000000003', 'weekly_comment', 100, 20);

-- 4. PACKAGES (Gói nạp)
INSERT INTO packages (id, name, type, price, value, description, is_active) VALUES
(1, 'Linh Thạch Sơ Cấp', 'linh_thach', 10000, 1000, 'Gói 1000 Linh Thạch', true),
(2, 'Linh Thạch Cao Cấp', 'linh_thach', 50000, 6000, 'Gói 6000 Linh Thạch (tặng 1000)', true),
(3, 'Bí Tịch VIP', 'vip', 100000, 30, 'VIP 30 ngày', true);

-- 5. BOOKS (Truyện) - dùng UUID dạng text ngắn gọn
INSERT INTO books (id, ten_truyen, anh_bia, tac_gia, the_loai, luot_xem, so_chuong, trang_thai, gioi_thieu, created_at, is_vip, rating_avg, rating_count, slug) VALUES
('book-001', 'Ngưng Nguyên Đạo Tổ', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&auto=format&fit=crop', 'Vạn Kiếp Nhân', ARRAY['Tiên Hiệp', 'Huyền Huyễn'], 3100000, 1520, 'Đã hoàn thành', 'Vạn kiếp luân hồi, ngưng tụ nguyên lực cực hạn, trảm thần diệt Phật đoạt thiên đạo chi tôn. Một thiếu niên mang trong mình huyết mạch hỗn độn, từ phế vật nghịch thiên cải mệnh.', NOW() - INTERVAL '365 days', true, 4.8, 1250, 'ngung-nguyen-dao-to'),
('book-002', 'Hệ Thống Trảm Thần', 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=400&auto=format&fit=crop', 'Thiên Tâm', ARRAY['Hệ Thống', 'Huyền Huyễn'], 2400000, 350, 'Đang cập nhật', 'Xuyên không nhập thế, thức tỉnh hệ thống phản diện cực hạn, thu thập tử khí đột phá võ thần. Một kẻ phản diện thức tỉnh, quyết tâm trở thành đại ma đầu tung hoành tam giới.', NOW() - INTERVAL '200 days', false, 4.9, 980, 'he-thong-tram-than'),
('book-003', 'Huyền Huyễn Đại Lục', 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=400&auto=format&fit=crop', 'Đạo Phong', ARRAY['Huyền Huyễn', 'Tiên Hiệp'], 5000000, 940, 'Đang cập nhật', 'Khám phá đại lục huyền diệu, tu luyện cửu dương chân kinh đại thành thiên thu vạn đại thế tôn. Thiếu niên mất trí nhớ thức tỉnh thần lực cổ xưa, bước vào hành trình tìm lại chính mình.', NOW() - INTERVAL '300 days', false, 4.7, 2100, 'huyen-huyen-dai-luc'),
('book-004', 'Đấu Phá Thương Khung', 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=400&auto=format&fit=crop', 'Khuyết Danh', ARRAY['Tiên Hiệp', 'Hệ Thống'], 1200000, 82, 'Đã hoàn thành', 'Vực sâu vô tận thức tỉnh tuyệt thế hỏa diễm, thiêu rụi trời đất đạt thành Vô Thượng Thần Tôn. Một đệ tử phế vật thức tỉnh hệ thống chiến đấu, nghịch chuyển quy tắc luân hồi.', NOW() - INTERVAL '150 days', false, 4.9, 198, 'dau-pha-thuong-khung'),
('book-005', 'Đô Thị Tu Tiên', 'https://images.unsplash.com/photo-1533158326339-7f3cf2404354?q=80&w=400&auto=format&fit=crop', 'Tây Môn Phù', ARRAY['Đô Thị', 'Hệ Thống'], 850000, 220, 'Đang cập nhật', 'Thiếu niên bình thường nơi thành thị ngẫu nhiên được Thiên thư thức tỉnh hệ thống thần y siêu phàm. Từ một sinh viên nghèo trở thành thần y lẫy lừng khuất phục mọi gia tộc lớn.', NOW() - INTERVAL '100 days', false, 4.5, 450, 'do-thi-tu-tien'),
('book-006', 'Kiếm Đạo Độc Tôn', 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=400&auto=format&fit=crop', 'Bạch Sa', ARRAY['Kiếm Hiệp', 'Huyền Huyễn'], 1900000, 610, 'Đã hoàn thành', 'Một kiếm chém đứt ngàn năm luân hồi nhân quả, độc tôn kiếm đạo vạn tuế độc hành. Kiếm khách lang thang với thanh kiếm gãy, quyết tìm lại vinh quang năm xưa của tông môn', NOW() - INTERVAL '280 days', true, 4.7, 780, 'kiem-dao-doc-ton');

-- 6. BOOK_CATEGORIES (Liên kết truyện - thể loại)
INSERT INTO book_categories (book_id, category_id) VALUES
('book-001', 1), ('book-001', 2),
('book-002', 4), ('book-002', 2),
('book-003', 2), ('book-003', 1),
('book-004', 1), ('book-004', 4),
('book-005', 3), ('book-005', 4),
('book-006', 6), ('book-006', 2);

-- 7. CHAPTERS (nội dung chương - mỗi truyện 5 chương mẫu)
INSERT INTO chapters (book_id, chapter_number, title, content, price) VALUES
-- Ngưng Nguyên Đạo Tổ (Chương 1-5)
('book-001', 1, 'Chương 1: Kích hoạt Thiên Đạo hệ thống', 'Trong đêm mưa bão đen tối lạnh lẽo tại gia tộc phế tích sụp đổ, Trần Phong rốt cuộc không thể chống cự cừu thù gia tộc dồn bức, khóe miệng rỉ máu quỳ rạp dưới đất trầm tư bế tắc.\n\n"BÍP! HỆ THỐNG THIÊN ĐẠO VÔ THƯỢNG KÍCH HOẠT THÀNH CÔNG!"\n\n"Chúc mừng đạo hữu Trần Phong nhận được Tụ Khí Đan cùng kỹ năng Thần Thức Sơ Bộ. Con đường ngự kiếm phạt thần bắt đầu mở ra!"\n\nHắn bật cười hoang dại, đôi mắt đọng máu đột nhiên lóe lên ánh hào quang lam ngọc rực rỡ...', 0),
('book-001', 2, 'Chương 2: Đột phá Ngưng Nguyên Sơ Kỳ', 'Kinh mạch phế bỏ lập tức được luồng khí tức ấm nóng nhu hòa chảy tràn trong lục phủ ngũ tạng hàn gắn và khai phá lại. Trần Phong khoanh chân ngồi xếp bằng, nạp đan dược vào đan điền, linh khí cuồn cuộn xung quanh dâng tràn mãnh liệt tột bực.\n\nBên ngoài sương mịt mù, lôi điện rầm rập như phụ họa cảnh giới sắp đột phá của hắn.\n\nPhát sinh tiếng giòn giã ở tận sâu xương cốt, cả căn phòng rung chuyển, hắn chính thức đạt đến Ngưng Nguyên Sơ Kỳ, khí thế ngút trời phi phàm.', 0),
('book-001', 3, 'Chương 3: Khiêu khích cường địch gia tộc', 'Tại phòng võ học đường, gia tộc phó trưởng lão Đại thiếu gia kiêu ngạo bước vào lớn tiếng đàm tiếu phỉ nhổ Trần Phong là phế vật vĩnh hằng. Trực diện khiêu khích vô đạo, Trần Phong bình thản nâng tách trà lạnh nhạt nhấp một ngụm, ánh nhìn tựa sát khí sắc lạnh.\n\n"Đã muốn chiến, hệ thống liền ban tặng thử thách Trảm địch trong một chiêu!"\n\nHắn phẩy nhẹ vạt áo, luồng nguyên lực cực hạn chấn động bùng nổ, khiến kẻ đối diện trợn mắt sợ hãi lùi bước không phanh...', 0),
('book-001', 4, 'Chương 4: Bí cảnh Thần Ma', 'Trần Phong sau khi đánh bại đại thiếu gia liền bị gia chủ đày vào bí cảnh Thần Ma - nơi được mệnh danh là tử địa của gia tộc. Nhưng hắn không hề sợ hãi, ngược lại còn kích hoạt hệ thống dò tìm bảo vật.\n\n"Hệ thống phát hiện: Cổ mộ Thần Ma cấp S, có chứa tuyệt thế truyền thừa!"', 0),
('book-001', 5, 'Chương 5: Truyền thừa Ma Đế', 'Trong sâu thẳm cổ mộ, Trần Phong phát hiện một bộ hài cốt khổng lồ cao tới trăm trượng. Ngay khoảnh khắc hắn chạm vào, toàn bộ ký ức của Ma Đế năm xưa ập vào thức hải!\n\n"Tiểu tử, ngươi có dám kế thừa Ma Đế truyền thừa, chịu thiên hạ truy sát?"\n\nTrần Phong cười nhạt: "Ta đã là phế vật, còn sợ gì truy sát nữa?"', 0),

-- Hệ Thống Trảm Thần (Chương 1-5)
('book-002', 1, 'Chương 1: Xuyên không vào phản diện', 'Diệp Phàm mở mắt ra, phát hiện mình đang nằm trong vũng máu. Xung quanh là thi thể la liệt. Hắn nhìn lại thân thể mình, toàn thân đầy thương tích, tu vi chỉ còn Luyện Khí tầng 3.\n\n"Đinh! Hệ thống Trảm Thần kích hoạt. Ký chủ hiện tại là Ma môn thiếu chủ - Diệp Phàm."\n\n"Ây da, xuyên vào phản diện á? Cái mạng này thú vị đây!"', 0),
('book-002', 2, 'Chương 2: Đại náo Ma môn', '', 0),
('book-002', 3, 'Chương 3: Nữ chính xuất hiện', '', 0),
('book-002', 4, 'Chương 4: Bí kíp nghịch thiên', '', 0),
('book-002', 5, 'Chương 5: Chém thần giết thánh', '', 0),

-- Huyền Huyễn Đại Lục (Chương 1-5)
('book-003', 1, 'Chương 1: Tỉnh dậy mất trí nhớ', 'Khi Lâm Tiêu tỉnh dậy, hắn phát hiện mình đang nằm trên một bãi cỏ rộng lớn, xung quanh là những ngọn núi cao vút tận mây xanh. Ánh mắt hắn đờ đẫn, mọi ký ức trong đầu dường như đã biến mất hoàn toàn.\n\n"Đây là đâu? Ta... là ai?"', 0),
('book-003', 2, 'Chương 2: Thức tỉnh Cổ Thần lực', '', 0),
('book-003', 3, 'Chương 3: Hành trình về phương Đông', '', 0),
('book-003', 4, 'Chương 4: Thành trì Huyễn Nguyệt', '', 0),
('book-003', 5, 'Chương 5: Cuộc chiến giành sinh tồn', '', 0),

-- Đấu Phá Thương Khung (Chương 1-5)
('book-004', 1, 'Chương 1: Phế vật thức tỉnh', 'Tại một thế giới song song, nơi con người ta có thể tu luyện đấu khí để trở thành cường giả. Đường Uy là một thiếu niên mang trên mình danh hiệu "phế vật" vì luôn mất một ngón tay khi giao chiến. Nhưng không ai biết hắn thức tỉnh hệ thống đấu khí âm dương...', 0),
('book-004', 2, 'Chương 2: Kỳ ngộ Yêu Nữ', '', 0),
('book-004', 3, 'Chương 3: Đan dược Sinh Tử', '', 0),
('book-004', 4, 'Chương 4: Đột phá Đấu Giả', '', 0),
('book-004', 5, 'Chương 5: Đại hội Tông môn', '', 0),

-- Đô Thị Tu Tiên (Chương 1-3)
('book-005', 1, 'Chương 1: Thần y thức tỉnh', 'Trịnh Vũ là một sinh viên năm thứ ba trường Đại học Y khoa, bình thường như bao sinh viên khác. Nhưng sau tai nạn xe hơi thảm khốc, hắn phát hiện trong đầu mình có một "Thiên Y Thư" - cuốn sách y thuật của Thần y thượng cổ.\n\nChỉ trong phút chốc, lượng tri thức y học khổng lồ tràn vào tâm trí hắn.', 0),
('book-005', 2, 'Chương 2: Cấp cứu tại bệnh viện', '', 0),
('book-005', 3, 'Chương 3: Gia tộc họ Trịnh', '', 0),

-- Kiếm Đạo Độc Tôn (Chương 1-3)
('book-006', 1, 'Chương 1: Kiếm khách mang kiếm gãy', 'Tại một quán rượu nhỏ ven đường, một nam tử trung niên mặc y phục rách rưới đang uống rượu. Bên hông hắn đeo một thanh kiếm gãy, thân kiếm đã gỉ sét, ánh lên vẻ tang thương.\n\nChủ quán nhìn với ánh mắt thương hại: "Lão huynh, hay là trả tiền rượu đi?"\n\nNam tử ngẩng đầu, ánh mắt sắc bén: "Ta không có tiền. Nhưng ta có một thanh kiếm."', 0),
('book-006', 2, 'Chương 2: Đấu kiếm dưới trăng', '', 0),
('book-006', 3, 'Chương 3: Truyền thuyết Thần Kiếm', '', 0);

-- 8. PROFILES (Tài khoản mẫu - password: "123456")
-- Password hash của "123456" (bcrypt cost=10)
INSERT INTO profiles (id, email, display_name, dao_hieu, password_hash, role, linh_thach, exp, is_vip, coin_balance) VALUES
('00000000-0000-0000-0000-000000000001', 'admin@tiengioi.com', 'Admin Thiên Đạo', 'Chí Tôn Vô Thượng', '$2b$10$8K1p/a0dL1LXMIgoEDFrwOfMQkfHAXxEdo8jpRyGT3HqX5cF5qZ1y', 'admin', 999999, 99999, true, 1000000),
('00000000-0000-0000-0000-000000000002', 'reader1@tiengioi.com', 'Tiêu Dao Khách', 'Vân Du Tán Nhân', '$2b$10$8K1p/a0dL1LXMIgoEDFrwOfMQkfHAXxEdo8jpRyGT3HqX5cF5qZ1y', 'reader', 5000, 1200, false, 0);

-- 9. COMMENTS (Bình luận mẫu)
INSERT INTO comments (user_id, book_id, content, rating_stars, created_at) VALUES
('00000000-0000-0000-0000-000000000002', 'book-001', 'Truyện rất hay! Cốt truyện cuốn hút, hệ thống tu luyện được xây dựng công phu. Nhân vật chính có chiều sâu.', 5, NOW() - INTERVAL '2 hours'),
('00000000-0000-0000-0000-000000000002', 'book-002', 'Truyện hài hước và sáng tạo. Mới đọc chap đầu đã thấy hấp dẫn, mong chờ các chap sau!', 5, NOW() - INTERVAL '1 day'),
('00000000-0000-0000-0000-000000000001', 'book-003', 'Thế giới quan rộng lớn, tác giả xây dựng rất chi tiết. Đây là bộ truyện đáng đọc nhất trong năm.', 5, NOW() - INTERVAL '3 days'),
('00000000-0000-0000-0000-000000000002', 'book-004', 'Đấu Phá Thương Khung là tác phẩm kinh điển, ngoại truyện cũng không làm fan thất vọng.', 4, NOW() - INTERVAL '5 days'),
('00000000-0000-0000-0000-000000000001', 'book-005', 'Sáng tác về thể loại đô thị tu tiên rất mới lạ, kết hợp y thuật cổ truyền với hiện đại.', 4, NOW() - INTERVAL '1 week'),
('00000000-0000-0000-0000-000000000002', 'book-006', 'Đẳng cấp kiếm hiệp! Ngôn từ sắc bén như đường kiếm, tình tiết cao trào mãn nhãn.', 5, NOW() - INTERVAL '2 weeks');

-- 10. READING_HISTORY (Lịch sử đọc)
INSERT INTO reading_history (user_id, book_id, current_chapter_id, updated_at) VALUES
('00000000-0000-0000-0000-000000000002', 'book-001', 1, NOW() - INTERVAL '1 hour'),
('00000000-0000-0000-0000-000000000002', 'book-002', 2, NOW() - INTERVAL '6 hours'),
('00000000-0000-0000-0000-000000000001', 'book-003', 3, NOW() - INTERVAL '1 day'),
('00000000-0000-0000-0000-000000000002', 'book-006', 4, NOW() - INTERVAL '3 days');

-- 11. BOOKMARKS (Đánh dấu)
INSERT INTO bookmarks (user_id, book_id, created_at) VALUES
('00000000-0000-0000-0000-000000000002', 'book-001', NOW()),
('00000000-0000-0000-0000-000000000002', 'book-006', NOW());

-- 12. USER_MISSIONS (User nhiệm vụ mẫu)
INSERT INTO user_missions (user_id, mission_type, last_completed_at, streak_days) VALUES
('00000000-0000-0000-0000-000000000002', 'daily_read', CURRENT_DATE, 3),
('00000000-0000-0000-0000-000000000002', 'daily_login', CURRENT_DATE, 5),
('00000000-0000-0000-0000-000000000002', 'weekly_comment', CURRENT_DATE, 1);

-- 13. PACKAGES_CONFIG (Cấu hình gói)
INSERT INTO packages_config (id, name, type, price, value) VALUES
('b0000000-0000-0000-0000-000000000001', 'Linh Thạch Sơ Cấp', 'linh_thach', 10000, 1000),
('b0000000-0000-0000-0000-000000000002', 'Linh Thạch Trung Cấp', 'linh_thach', 30000, 3500),
('b0000000-0000-0000-0000-000000000003', 'Linh Thạch Cao Cấp', 'linh_thach', 50000, 6000),
('b0000000-0000-0000-0000-000000000004', 'VIP Tháng', 'vip', 100000, 30),
('b0000000-0000-0000-0000-000000000005', 'VIP Năm', 'vip', 800000, 365);