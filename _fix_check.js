const pool = require('./db');
(async () => {
  // Check rows where ten_truyen_sach is "P1" or similar part labels
  const bad = await pool.query("SELECT id_video, ten_truyen_sach, dinh_danh_tap, tiu_de_goc, link_video FROM youtube_truyen WHERE ten_truyen_sach ~ '^P\\d+$' OR ten_truyen_sach ~ '^Phần \\d+' ORDER BY ten_truyen_sach");
  console.log('=== BAD TEN_TRUYEN_SACH (part labels as story names) ===');
  console.log(JSON.stringify(bad.rows, null, 2));

  // Check a sample story to see its parts and ordering
  const sample = await pool.query("SELECT id_video, ten_truyen_sach, dinh_danh_tap, thoi_luong_giay, ngay_dang FROM youtube_truyen WHERE ten_truyen_sach ILIKE '%Ma Hoàng Bá Đạo%' ORDER BY dinh_danh_tap");
  console.log('=== SAMPLE STORY PARTS ===');
  console.log(JSON.stringify(sample.rows, null, 2));

  // Check stories with numeric parts to see ordering issue
  const multi = await pool.query("SELECT ten_truyen_sach, COUNT(*) cnt FROM youtube_truyen WHERE ten_truyen_sach IS NOT NULL AND ten_truyen_sach != '' AND ten_truyen_sach !~ '^P\\d+$' GROUP BY ten_truyen_sach HAVING COUNT(*) > 1 ORDER BY cnt DESC LIMIT 10");
  console.log('=== STORIES WITH MULTIPLE PARTS ===');
  console.log(JSON.stringify(multi.rows, null, 2));

  pool.end();
})();