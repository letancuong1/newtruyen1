const pool = require('./db');
(async () => {
  // Check stories that look like the same story with slight name differences
  // First, check stories where ten_truyen_sach starts with common phrases
  const dupes = await pool.query(`
    SELECT 
      LOWER(REGEXP_REPLACE(ten_truyen_sach, '[\\s-]+', ' ', 'g')) AS normalized,
      COUNT(*) cnt,
      ARRAY_AGG(DISTINCT ten_truyen_sach ORDER BY ten_truyen_sach) AS names
    FROM youtube_truyen
    WHERE ten_truyen_sach IS NOT NULL AND ten_truyen_sach != ''
    GROUP BY LOWER(REGEXP_REPLACE(ten_truyen_sach, '[\\s-]+', ' ', 'g'))
    HAVING COUNT(DISTINCT ten_truyen_sach) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log('=== EXACT DUPLICATE STORY NAMES ===');
  console.log(JSON.stringify(dupes.rows, null, 2));

  // Check the P1 row in detail
  const p1row = await pool.query(`SELECT id_video, ten_truyen_sach, tiu_de_goc, dinh_danh_tap FROM youtube_truyen WHERE id_video = '5Zt9YsKe05w'`);
  console.log('=== P1 ROW ===');
  console.log(JSON.stringify(p1row.rows, null, 2));
  
  // Check if there's a story with similar name to what P1 should resolve to
  const similarToP1 = await pool.query(`SELECT id_video, ten_truyen_sach, tiu_de_goc FROM youtube_truyen WHERE ten_truyen_sach ILIKE '%Vừa Vào Tù%' OR tiu_de_goc ILIKE '%Vừa Vào Tù%'`);
  console.log('=== SIMILAR TO P1 ===');
  console.log(JSON.stringify(similarToP1.rows, null, 2));

  pool.end();
})();