CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  author_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_emoji TEXT NOT NULL DEFAULT '✨',
  cover_grad INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'other',
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | published | hidden
  plays INTEGER NOT NULL DEFAULT 0,
  finishes INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);
CREATE INDEX idx_tests_pop ON tests(status, plays DESC);
CREATE INDEX idx_tests_new ON tests(status, published_at DESC);
CREATE INDEX idx_tests_likes ON tests(status, likes DESC);
CREATE INDEX idx_tests_author ON tests(author_id);

CREATE TABLE plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  result_idx INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  answers TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_plays_test ON plays(test_id, user_id);
CREATE INDEX idx_plays_user ON plays(user_id, created_at DESC);

CREATE TABLE likes (
  user_id INTEGER NOT NULL,
  test_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, test_id)
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_comments_test ON comments(test_id, id DESC);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  UNIQUE (test_id, user_id)
);

CREATE TABLE donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  from_user INTEGER NOT NULL,
  to_user INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  payout INTEGER NOT NULL DEFAULT 0,
  test_mode INTEGER NOT NULL DEFAULT 0,
  intent_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'created', -- created | pending | paid | payout_pending | done | failed | expired
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_don_to ON donations(to_user, created_at DESC);
CREATE INDEX idx_don_status ON donations(status);
