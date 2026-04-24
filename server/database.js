/**
 * database.js — SQLite 資料庫層
 * 使用 better-sqlite3（同步 API，適合 Node.js 單機部署）
 */

const Database = require('better-sqlite3');
const path = require('path');

// 資料庫文件路徑（與 server.js 同目錄）
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'game.db');

let db = null;

function initDatabase() {
  try {
    db = new Database(DB_PATH);

    // 開啟 WAL 模式，提升並發讀取效能
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    createTables();
    console.log(`✅ SQLite connected: ${DB_PATH}`);
    return true;
  } catch (error) {
    console.error('❌ SQLite init failed:', error.message);
    return false;
  }
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      phone     TEXT    NOT NULL UNIQUE,
      name      TEXT    NOT NULL,
      total_points INTEGER DEFAULT 0,
      total_games  INTEGER DEFAULT 0,
      best_score   INTEGER DEFAULT 0,
      best_coins   INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now','localtime')),
      last_played  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_phone        ON players(phone);
    CREATE INDEX IF NOT EXISTS idx_best_score   ON players(best_score DESC);

    CREATE TABLE IF NOT EXISTS game_records (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      player_phone  TEXT    NOT NULL,
      player_name   TEXT    NOT NULL DEFAULT '',
      coins         INTEGER DEFAULT 0,
      xp_collected  INTEGER DEFAULT 0,
      xp_used       INTEGER DEFAULT 0,
      distance      REAL    DEFAULT 0,
      duration      INTEGER DEFAULT 0,
      score         INTEGER DEFAULT 0,
      score_breakdown TEXT,
      played_at     TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_gr_player    ON game_records(player_phone);
    CREATE INDEX IF NOT EXISTS idx_gr_score     ON game_records(score DESC);
    CREATE INDEX IF NOT EXISTS idx_gr_played_at ON game_records(played_at DESC);
  `);
  console.log('✅ Tables ready');
}

function checkConnection() {
  if (!db) throw new Error('Database not initialised');
}

// ── 玩家註冊 ──────────────────────────────────────────────────────────────
function registerPlayer(name, phone) {
  checkConnection();

  const existing = db.prepare('SELECT * FROM players WHERE phone = ?').get(phone);
  if (existing) {
    return { player: existing, isNew: false };
  }

  db.prepare('INSERT INTO players (phone, name) VALUES (?, ?)').run(phone, name);
  const player = db.prepare('SELECT * FROM players WHERE phone = ?').get(phone);
  return { player, isNew: true };
}

// ── 查詢玩家 ──────────────────────────────────────────────────────────────
function getPlayer(phone) {
  checkConnection();
  return db.prepare('SELECT * FROM players WHERE phone = ?').get(phone) || null;
}

// ── 儲存遊戲記錄 ──────────────────────────────────────────────────────────
function saveGameRecord(playerPhone, gameData, scoreBreakdown) {
  checkConnection();

  const player = getPlayer(playerPhone);
  const playerName = player ? player.name : '';

  db.prepare(`
    INSERT INTO game_records
      (player_phone, player_name, coins, xp_collected, xp_used, distance, duration, score, score_breakdown)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    playerPhone,
    playerName,
    gameData.coins,
    gameData.xpCollected,
    gameData.xpUsed,
    gameData.distance,
    gameData.gameDuration,
    scoreBreakdown.totalScore,
    JSON.stringify(scoreBreakdown)
  );

  console.log(`✅ Game record saved for ${playerPhone}`);
}

// ── 更新玩家積分 ──────────────────────────────────────────────────────────
function addPoints(phone, score, coins) {
  checkConnection();

  const player = getPlayer(phone);
  if (!player) return null;

  const newTotal      = player.total_points + score;
  const newTotalGames = player.total_games + 1;
  const newBestScore  = Math.max(player.best_score, score);
  const newBestCoins  = Math.max(player.best_coins, coins);

  db.prepare(`
    UPDATE players
    SET total_points = ?,
        total_games  = ?,
        best_score   = ?,
        best_coins   = ?,
        last_played  = datetime('now','localtime')
    WHERE phone = ?
  `).run(newTotal, newTotalGames, newBestScore, newBestCoins, phone);

  return {
    player: getPlayer(phone),
    pointsAdded: score
  };
}

// ── 排行榜（同一電話只顯示最高分那局的名字）─────────────────────────────
function getLeaderboard(limit = 20) {
  checkConnection();

  /*
   * 邏輯：從 game_records 按電話分組，取每個電話的最高分那一局，
   * 顯示該局使用的名字（player_name），確保同一電話只出現一次。
   */
  const rows = db.prepare(`
    SELECT
      gr.player_phone  AS phone,
      gr.player_name   AS name,
      gr.score         AS best_score,
      p.total_games    AS total_games
    FROM game_records gr
    INNER JOIN (
      SELECT player_phone, MAX(score) AS max_score
      FROM game_records
      GROUP BY player_phone
    ) best ON gr.player_phone = best.player_phone
           AND gr.score       = best.max_score
    LEFT JOIN players p ON gr.player_phone = p.phone
    GROUP BY gr.player_phone          -- 若同分有多筆，只取一筆
    ORDER BY gr.score DESC
    LIMIT ?
  `).all(limit);

  return rows;
}

// ── 玩家歷史記錄 ──────────────────────────────────────────────────────────
function getPlayerHistory(phone, limit = 20) {
  checkConnection();

  return db.prepare(`
    SELECT score, coins, xp_collected, xp_used, distance, duration, played_at
    FROM game_records
    WHERE player_phone = ?
    ORDER BY played_at DESC
    LIMIT ?
  `).all(phone, limit);
}

// ── 統計數據 ──────────────────────────────────────────────────────────────
function getStats() {
  checkConnection();

  const totalPlayers = db.prepare('SELECT COUNT(*) AS count FROM players').get().count;
  const totalGames   = db.prepare('SELECT COUNT(*) AS count FROM game_records').get().count;
  const totalPoints  = db.prepare('SELECT COALESCE(SUM(total_points),0) AS total FROM players').get().total;
  const topPlayerRow = db.prepare('SELECT name, total_points FROM players ORDER BY best_score DESC LIMIT 1').get();

  const avgPoints = totalPlayers > 0 ? Math.round(totalPoints / totalPlayers) : 0;

  return {
    totalPlayers,
    totalGames,
    topPlayer: topPlayerRow
      ? { username: topPlayerRow.name, total_score: topPlayerRow.total_points }
      : null,
    averageScore: avgPoints
  };
}

module.exports = {
  initDatabase,
  registerPlayer,
  getPlayer,
  saveGameRecord,
  addPoints,
  getLeaderboard,
  getPlayerHistory,
  getStats
};
