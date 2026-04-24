-- ============================================================
-- NO-JOYSTICK 遊戲資料庫初始化腳本
-- 資料庫引擎：SQLite 3
-- 說明：此腳本用於手動檢查或重建資料庫結構。
--       正常情況下，server.js 啟動時會自動建立所有表格，
--       無需手動執行此腳本。
--
-- 手動執行方式（可選）：
--   sqlite3 game.db < setup-database.sql
-- ============================================================

-- 開啟外鍵支援
PRAGMA foreign_keys = ON;

-- 開啟 WAL 模式（提升並發讀取效能）
PRAGMA journal_mode = WAL;

-- ── 玩家表 ────────────────────────────────────────────────────────────────
-- 每個電話號碼對應一個玩家記錄
-- best_score：該玩家歷史最高單局分數（用於排行榜）
CREATE TABLE IF NOT EXISTS players (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  phone        TEXT    NOT NULL UNIQUE,   -- 8位香港電話號碼
  name         TEXT    NOT NULL,          -- 玩家顯示名稱
  total_points INTEGER DEFAULT 0,        -- 累積總積分
  total_games  INTEGER DEFAULT 0,        -- 總遊玩次數
  best_score   INTEGER DEFAULT 0,        -- 歷史最高單局分數
  best_coins   INTEGER DEFAULT 0,        -- 歷史最多單局金幣
  created_at   TEXT    DEFAULT (datetime('now', 'localtime')),
  last_played  TEXT    DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_phone      ON players(phone);
CREATE INDEX IF NOT EXISTS idx_best_score ON players(best_score DESC);

-- ── 遊戲記錄表 ────────────────────────────────────────────────────────────
-- 每局遊戲的詳細記錄，包含防作弊所需的事件數據
-- player_name：記錄該局遊戲時使用的名字（排行榜顯示用）
CREATE TABLE IF NOT EXISTS game_records (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  player_phone   TEXT    NOT NULL,        -- 關聯玩家電話
  player_name    TEXT    NOT NULL DEFAULT '', -- 該局使用的名字
  coins          INTEGER DEFAULT 0,       -- 本局收集金幣數
  xp_collected   INTEGER DEFAULT 0,       -- 本局收集 XP 數
  xp_used        INTEGER DEFAULT 0,       -- 本局使用 XP（Boost）次數
  distance       REAL    DEFAULT 0,       -- 本局行駛距離
  duration       INTEGER DEFAULT 0,       -- 本局遊戲時長（毫秒）
  score          INTEGER DEFAULT 0,       -- 本局最終得分
  score_breakdown TEXT,                   -- 得分明細（JSON 格式）
  played_at      TEXT    DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_gr_player    ON game_records(player_phone);
CREATE INDEX IF NOT EXISTS idx_gr_score     ON game_records(score DESC);
CREATE INDEX IF NOT EXISTS idx_gr_played_at ON game_records(played_at DESC);

-- ── 驗證 ──────────────────────────────────────────────────────────────────
SELECT '✅ Tables created successfully' AS status;
SELECT name AS table_name FROM sqlite_master WHERE type = 'table' ORDER BY name;
