const API_BASE = window.location.origin + '/api';

class GameEventTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    this.gameId = null;
    this.coins = 0;
    this.xpCollected = 0;
    this.xpUsed = 0;
    this.distance = 0;
    this.gameStartTime = null;
    this.gameEndTime = null;

    this.coinEvents = [];
    this.xpCollectEvents = [];
    this.xpUseEvents = [];

    this.deviceFingerprint = this.generateFingerprint();
  }

  generateFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fingerprint', 2, 2);

    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      canvas.toDataURL()
    ].join('|');

    return this.hashCode(fingerprint);
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  startGame() {
    this.reset();
    this.gameStartTime = Date.now();
    return this.sessionId;
  }

  collectCoin() {
    const now = Date.now();
    this.coins++;
    this.coinEvents.push({
      time: now - this.gameStartTime,
      timestamp: now,
      totalAfter: this.coins
    });
  }

  collectXP() {
    const now = Date.now();
    this.xpCollected++;
    this.xpCollectEvents.push({
      time: now - this.gameStartTime,
      timestamp: now,
      totalAfter: this.xpCollected
    });
  }

  useXP() {
    const now = Date.now();
    this.xpUsed++;
    this.xpUseEvents.push({
      time: now - this.gameStartTime,
      timestamp: now,
      xpRemaining: Math.max(0, this.xpCollected - this.xpUsed)
    });
  }

  updateDistance(newDistance) {
    this.distance = newDistance;
  }

  endGame() {
    this.gameEndTime = Date.now();
    const gameDuration = this.gameEndTime - this.gameStartTime;

    return {
      sessionId: this.sessionId,
      playerId: playerPhone,
      coins: this.coins,
      coinEvents: this.coinEvents,
      xpCollected: this.xpCollected,
      xpCollectEvents: this.xpCollectEvents,
      xpUsed: this.xpUsed,
      xpUseEvents: this.xpUseEvents,
      distance: this.distance,
      gameDuration: gameDuration,
      deviceFingerprint: this.deviceFingerprint,
      timestamp: new Date().toISOString()
    };
  }
}

const gameTracker = new GameEventTracker();

class RacingAPI {
  static async register(playerId, username) {
    try {
      const response = await fetch(`${API_BASE}/players/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, username })
      });
      const result = await response.json();

      if (result.success && result.player) {
        return {
          success: true,
          player: {
            playerId: result.player.player_id,
            username: result.player.username,
            maskedName: result.player.masked_name,
            totalScore: result.player.total_score
          },
          isNew: result.isNew
        };
      }

      return result;
    } catch (error) {
      console.error('Registration failed:', error);
      return { success: false, error: 'Network error' };
    }
  }

  static async getPlayer(playerId) {
    try {
      const response = await fetch(`${API_BASE}/players/${playerId}`);
      const result = await response.json();

      if (result.success && result.player) {
        return {
          success: true,
          player: {
            playerId: result.player.player_id,
            username: result.player.username,
            maskedName: result.player.masked_name,
            totalScore: result.player.total_score
          }
        };
      }

      return result;
    } catch (error) {
      console.error('Get player failed:', error);
      return { success: false, error: 'Network error' };
    }
  }

  static async submitGameResult(gameData) {
    try {
      const response = await fetch(`${API_BASE}/game/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameData)
      });
      const result = await response.json();

      if (result.success && result.player) {
        return {
          success: true,
          player: {
            playerId: result.player.player_id,
            username: result.player.username,
            maskedName: result.player.masked_name,
            totalScore: result.player.total_score,
            best_score: result.player.best_score,    // ✅ Bug 1 修復: 補傳 best_score 供前端顯示個人最佳分數
            total_score: result.player.total_score   // ✅ Bug 1 修復: 明確保留 total_score
          },
          gameScore: result.gameScore,
          pointsAdded: result.pointsAdded,
          scoreBreakdown: result.scoreBreakdown      // ✅ Bug 1 修復: 補傳 scoreBreakdown 供前端 debug log
        };
      }

      return result;
    } catch (error) {
      console.error('Game result submission failed:', error);
      return { success: false, error: 'Network error' };
    }
  }

  static async getLeaderboard(type = 'score', limit = 10) {
    try {
      const response = await fetch(`${API_BASE}/leaderboard?type=${type}&limit=${limit}`);
      return await response.json();
    } catch (error) {
      console.error('Get leaderboard failed:', error);
      return { success: false, error: 'Network error' };
    }
  }

  static async getPlayerHistory(playerId, limit = 20) {
    try {
      const response = await fetch(`${API_BASE}/player/${playerId}/history?limit=${limit}`);
      return await response.json();
    } catch (error) {
      console.error('Get history failed:', error);
      return { success: false, error: 'Network error' };
    }
  }

  static async getStats() {
    try {
      const response = await fetch(`${API_BASE}/stats`);
      return await response.json();
    } catch (error) {
      console.error('Get stats failed:', error);
      return { success: false, error: 'Network error' };
    }
  }
}
