-- Add helpful indexes to speed up ORDER BY and WHERE queries
-- Run these on your PostgreSQL server (as a DBA or via psql)

-- Index for ordering newest by created_at
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books (created_at DESC);

-- Index for faster lookup on popularity (luot_xem)
CREATE INDEX IF NOT EXISTS idx_books_luot_xem ON books (luot_xem DESC);

-- If you frequently query array membership on the_loai, consider a GIN index
CREATE INDEX IF NOT EXISTS idx_books_the_loai_gin ON books USING gin (the_loai);

-- Index to speed up computing ratings from comments per book
CREATE INDEX IF NOT EXISTS idx_comments_book_id ON comments (book_id);

-- Index to speed up queries for user's rating on a book
CREATE INDEX IF NOT EXISTS idx_comments_book_user ON comments (book_id, user_id);
