const pool = require('./db');
(async () => {
  // Check Ma Hoang stories
  const mh = await pool.query(`SELECT DISTINCT ten_truyen_sach FROM youtube_truyen WHERE ten_truyen_sach ILIKE '%Ma Hoàng Bá Đạo%' ORDER BY ten_truyen_sach`);
  console.log('=== MA HOANG STORIES ===');
  mh.rows.forEach(r => console.log(' -', r.ten_truyen_sach));

  // Check stories where first 30 chars are similar
  const fuzzy = await pool.query(`
    SELECT 
      LEFT(ten_truyen_sach, 30) AS prefix,
      COUNT(DISTINCT ten_truyen_sach) variants,
      ARRAY_AGG(DISTINCT ten_truyen_sach ORDER BY ten_truyen_sach) AS names
    FROM youtube_truyen
    WHERE ten_truyen_sach IS NOT NULL AND ten_truyen_sach != '' AND LENGTH(ten_truyen_sach) > 30
    GROUP BY LEFT(ten_truyen_sach, 30)
    HAVING COUNT(DISTINCT ten_truyen_sach) > 1
    ORDER BY variants DESC
    LIMIT 15
  `);
  console.log('\n=== FUZZY DUPLICATES (first 30 chars match) ===');
  fuzzy.rows.forEach(r => {
    console.log(`\nPrefix: "${r.prefix}" (${r.variants} variants)`);
    r.names.forEach(n => console.log('  -', n));
  });

  pool.end();
})();