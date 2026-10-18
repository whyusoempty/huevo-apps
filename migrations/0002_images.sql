ALTER TABLE tests ADD COLUMN cover_image TEXT;

CREATE TABLE images (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_images_user ON images(user_id, created_at DESC);
