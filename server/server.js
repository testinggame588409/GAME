/**
 * server.js — NO-JOYSTICK 遊戲後端
 * 技術棧：Node.js + Express + SQLite (better-sqlite3)
 *
 * 啟動方式：
 *   node server.js          （生產環境）
 *   npx nodemon server.js   （開發環境，自動重啟）
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./database');

const {
  VALIDATION,
  validatePhone,
  validateUsername,
  validateGameData,
  validateEventTiming,
  validateScoreReasonable,
  calculateScore,
  checkRateLimit,
  checkDeviceFingerprint,
  maskPlayerName,
  maskPhone,
  formatPlayerResponse
} = require('./validation');

// ── 設定 ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 靜態文件（前端 HTML/JS/CSS/圖片）
app.use(express.static(path.join(__dirname, '..')));

// ── 請求日誌 ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ── API 路由 ──────────────────────────────────────────────────────────────

// POST /api/players/register
app.post('/api/players/register', (req, res) => {
  try {
    if (!checkRateLimit(req.ip)) {
      return res.status(429).json({ error: 'Too many requests. Please wait.' });
    }

    const { playerId, username } = req.body;

    if (!playerId || !validatePhone(playerId)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }
    if (!username || !validateUsername(username)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const result = db.registerPlayer(username, playerId);

    res.json({
      success: true,
      player: formatPlayerResponse(result.player),
      isNew: result.isNew
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// GET /api/players/:playerId
app.get('/api/players/:playerId', (req, res) => {
  try {
    const { playerId } = req.params;

    if (!validatePhone(playerId)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const player = db.getPlayer(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({ success: true, player: formatPlayerResponse(player) });
  } catch (error) {
    console.error('Get player error:', error);
    res.status(500).json({ error: 'Failed to get player data' });
  }
});

// POST /api/game/submit
app.post('/api/game/submit', (req, res) => {
  try {
    if (!checkRateLimit(req.ip)) {
      return res.status(429).json({ error: 'Too many requests. Please wait.' });
    }

    const gameData = req.body;

    console.log('📥 Game submit:', {
      playerId:     gameData.playerId,
      coins:        gameData.coins,
      xpCollected:  gameData.xpCollected,
      xpUsed:       gameData.xpUsed,
      distance:     gameData.distance,
      gameDuration: gameData.gameDuration,
      coinEvents:   gameData.coinEvents?.length || 0
    });

    // 基本數據驗證
    const errors = validateGameData(gameData);
    if (errors.length > 0) {
      console.log('❌ Validation errors:', errors);
      return res.status(400).json({ error: 'Invalid game data', details: errors });
    }

    // 事件時序驗證
    if (gameData.coinEvents || gameData.xpCollectEvents || gameData.xpUseEvents) {
      const timingErrors = validateEventTiming(gameData);
      if (timingErrors.length > 0) {
        console.log('❌ Timing errors:', timingErrors);
        return res.status(400).json({ error: 'Invalid event timing', details: timingErrors });
      }
    }

    // 確認玩家存在
    const player = db.getPlayer(gameData.playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found. Please register first.' });
    }

    // 計算分數
    const scoreBreakdown = calculateScore(gameData);

    // 分數合理性警告（不阻擋）
    const scoreWarnings = validateScoreReasonable(gameData, scoreBreakdown.totalScore);
    if (scoreWarnings.length > 0) {
      console.warn('⚠️ Score warning:', scoreWarnings);
    }

    // 設備指紋追蹤
    if (gameData.deviceFingerprint) {
      checkDeviceFingerprint(gameData.playerId, gameData.deviceFingerprint);
    }

    // 儲存記錄並更新積分
    db.saveGameRecord(gameData.playerId, gameData, scoreBreakdown);
    const result = db.addPoints(gameData.playerId, scoreBreakdown.totalScore, gameData.coins);

    console.log(`✅ Score saved — Player: ${gameData.playerId}, Total: ${scoreBreakdown.totalScore}`);

    res.json({
      success: true,
      player: formatPlayerResponse(result.player),
      gameScore: scoreBreakdown.totalScore,
      pointsAdded: scoreBreakdown.totalScore,
      scoreBreakdown
    });
  } catch (error) {
    console.error('Game submission error:', error);
    res.status(500).json({ error: 'Failed to submit game result' });
  }
});

// GET /api/leaderboard
app.get('/api/leaderboard', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const leaderboard = db.getLeaderboard(limit);

    const masked = leaderboard.map((row, i) => ({
      rank:         i + 1,
      masked_name:  maskPlayerName(row.name),
      masked_phone: maskPhone(row.phone),
      best_score:   row.best_score,
      total_score:  row.best_score,   // 前端讀取 total_score 欄位
      total_games:  row.total_games
    }));

    res.json({ success: true, leaderboard: masked, type: 'score' });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// GET /api/player/:playerId/history
app.get('/api/player/:playerId/history', (req, res) => {
  try {
    const { playerId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const history = db.getPlayerHistory(playerId, limit);

    res.json({
      success: true,
      history: history.map(r => ({
        score:        r.score,
        coins:        r.coins,
        xp_collected: r.xp_collected,
        xp_used:      r.xp_used,
        distance:     r.distance,
        duration:     r.duration,
        played_at:    r.played_at
      }))
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to get player history' });
  }
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
    if (stats.topPlayer) {
      stats.topPlayer.masked_username = maskPlayerName(stats.topPlayer.username);
      delete stats.topPlayer.username;
    }
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// SPA fallback — 所有其他路由返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── 啟動 ──────────────────────────────────────────────────────────────────
function start() {
  const ok = db.initDatabase();
  if (!ok) {
    console.error('❌ Database init failed. Server will start but may not function.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║   🎮  NO-JOYSTICK Game Server                        ║
║   http://0.0.0.0:${String(PORT).padEnd(5)}                               ║
║   Database: SQLite  (game.db)                        ║
║   Anti-cheat: enabled                                ║
╚══════════════════════════════════════════════════════╝
    `);
  });
}

start();
