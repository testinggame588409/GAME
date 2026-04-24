// ============================================================
// 🔒 SECURITY: 所有上限值均基於前端實際遊戲設計，不可輕易放寬
// 前端遊戲時長: 90 秒 (GAME_DURATION = 90)
// 修改此文件前請同步確認前端遊戲參數
// ============================================================
const VALIDATION = {
  // ── 遊戲時長 ──────────────────────────────────────────────
  // 🔒 安全修復: 由 300,000ms 收緊至 100,000ms
  //    前端遊戲為 90 秒，加 10 秒容差防止正常玩家被誤拒
  //    原 300,000ms 允許作弊者偽造 gameDuration 繞過速率檢查
  MAX_GAME_DURATION: 100000,   // 100 秒上限（前端 90 秒 + 10 秒容差）
  MIN_GAME_DURATION: 5000,     // 最短 5 秒（防止空提交）

  // ── 速率限制 ──────────────────────────────────────────────
  RATE_LIMIT_WINDOW: 60000,
  MAX_REQUESTS_PER_WINDOW: 10,

  // ── XP / Boost 參數（配合前端）────────────────────────────
  XP_DURATION: 5000,           // 配合前端 nitroTimer = 5 秒
  XP_COOLDOWN: 5000,           // 配合前端 xpCooldown = 5 秒
  MIN_XP_USE_INTERVAL: 10000,  // boost 5秒 + 冷卻 5秒

  // ── 收集速率上限 ──────────────────────────────────────────
  MIN_COIN_INTERVAL: 50,
  MIN_XP_INTERVAL: 500,
  COIN_MAX_PER_SECOND: 15,     // 每秒最多 15 個金幣（含 XP Boost 期間容差）
  XP_COLLECT_MAX_PER_SECOND: 1,
  XP_USE_MAX_PER_SECOND: 1,

   // 🔒 絕對數量上限（獨立於 gameDuration，防止偽造時長攻擊）──
  // 金幣: 90秒 × 15/秒 × 2倍容差 = 2700，对正常玩家充裕容差
  MAX_COINS_ABSOLUTE: 2700,    // 單局金幣絕對上限
  // XP 使用: 實際上限已由 MIN_XP_USE_INTERVAL 控制，此处給大容差
  MAX_XP_USED_ABSOLUTE: 20,    // 單局 XP 使用絕對上限
  MAX_XP_COLLECTED_ABSOLUTE: 30, // 單局 XP 收集絕對上限
  // 距離: 不設絕對上限，依賴 gameDuration + 分數合理性防護即可
  MAX_DISTANCE_ABSOLUTE: Infinity, // 不限制距離（由 gameDuration 間接防護）

  // ── 分數合理性 ───────────────────────────────────────────────
  MAX_THEORETICAL_SCORE_RATIO: 2.0,

  // ── 分數計算常數（配合前端）──────────────────────────────
  COIN_POINTS: 1000,           // 配合前端 COLLECTIBLE_TYPES.GOLD.points = 1000
  XP_BOOST_MULTIPLIER: 3,      // 配合前端 points *= 3
  DISTANCE_MULTIPLIER: 0.04,   // 配合前端 baseScorePerDistance = 0.04

  // ── 事件時間戳容差 ────────────────────────────────────────
  EVENT_TIMING_TOLERANCE: 500  // 允許事件時間戳超出 gameDuration 的容差（毫秒）
};

const rateLimitMap = new Map();
const deviceFingerprintMap = new Map();

function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  return /^\d{8}$/.test(phone);
}

function validateUsername(username) {
  if (!username || typeof username !== 'string') return false;
  if (username.length > 50) return false;
  // 允許中文、英文字母及空格（配合前端英文全名可含空格）
  return /^[\u4e00-\u9fa5a-zA-Z ]+$/.test(username);
}

function validateGameData(data) {
  const errors = [];

  // ── 玩家 ID ──────────────────────────────────────────────
  if (!data.playerId || !validatePhone(data.playerId)) {
    errors.push('Invalid player ID');
  }

  // ── 金幣數量 ──────────────────────────────────────────────
  if (typeof data.coins !== 'number' || data.coins < 0) {
    errors.push('Invalid coins count');
  }
  // 🔒 絕對上限：不受 gameDuration 影響，直接封鎖偽造時長攻擊
  if (data.coins > VALIDATION.MAX_COINS_ABSOLUTE) {
    errors.push(`Coins exceed absolute maximum: ${data.coins} > ${VALIDATION.MAX_COINS_ABSOLUTE}`);
  }

  // ── XP 數量 ───────────────────────────────────────────────
  if (typeof data.xpCollected !== 'number' || data.xpCollected < 0) {
    errors.push('Invalid XP collected');
  }
  // 🔒 絕對上限
  if (data.xpCollected > VALIDATION.MAX_XP_COLLECTED_ABSOLUTE) {
    errors.push(`XP collected exceeds absolute maximum: ${data.xpCollected} > ${VALIDATION.MAX_XP_COLLECTED_ABSOLUTE}`);
  }
  if (typeof data.xpUsed !== 'number' || data.xpUsed < 0) {
    errors.push('Invalid XP used');
  }
  // 🔒 絕對上限
  if (data.xpUsed > VALIDATION.MAX_XP_USED_ABSOLUTE) {
    errors.push(`XP used exceeds absolute maximum: ${data.xpUsed} > ${VALIDATION.MAX_XP_USED_ABSOLUTE}`);
  }
  if (data.xpUsed > data.xpCollected) {
    errors.push('XP used cannot exceed XP collected');
  }

  // ── 距離 ──────────────────────────────────────────────────
  if (typeof data.distance !== 'number' || data.distance < 0) {
    errors.push('Invalid distance');
  }
  // 🔒 絕對上限
  if (data.distance > VALIDATION.MAX_DISTANCE_ABSOLUTE) {
    errors.push(`Distance exceeds absolute maximum: ${data.distance} > ${VALIDATION.MAX_DISTANCE_ABSOLUTE}`);
  }

  // ── 遊戲時長 ──────────────────────────────────────────────
  if (typeof data.gameDuration !== 'number' || data.gameDuration < VALIDATION.MIN_GAME_DURATION) {
    errors.push('Game duration too short');
  }
  // 🔒 安全修復: MAX_GAME_DURATION 已收緊至 100,000ms
  if (data.gameDuration > VALIDATION.MAX_GAME_DURATION) {
    errors.push(`Game duration exceeds maximum: ${data.gameDuration}ms > ${VALIDATION.MAX_GAME_DURATION}ms`);
  }

  // ── 金幣速率（在時長驗證通過後才計算，防止除以偽造大數）──
  if (data.coins > 0 && data.gameDuration > 0 && data.gameDuration <= VALIDATION.MAX_GAME_DURATION) {
    const coinsPerSecond = data.coins / (data.gameDuration / 1000);
    if (coinsPerSecond > VALIDATION.COIN_MAX_PER_SECOND) {
      errors.push(`Coin collection rate too high: ${coinsPerSecond.toFixed(2)}/sec (max ${VALIDATION.COIN_MAX_PER_SECOND}/sec)`);
    }
  }

  return errors;
}

function validateEventTiming(data) {
  const errors = [];
  const gameDuration = data.gameDuration;
  // 允許事件時間戳超出 gameDuration 一定容差（處理遊戲結束邊界的計時誤差）
  const maxAllowedTime = gameDuration + VALIDATION.EVENT_TIMING_TOLERANCE;

  if (data.coinEvents && Array.isArray(data.coinEvents)) {
    // 允許 ±5 個事件的誤差（處理網絡延遲或瀏覽器 GC 導致的計數偏差）
    const coinCountDiff = Math.abs(data.coinEvents.length - data.coins);
    if (coinCountDiff > 5) {
      errors.push(`Coin event count mismatch: ${data.coinEvents.length} events vs ${data.coins} coins (diff: ${coinCountDiff})`);
    }
    for (let i = 1; i < data.coinEvents.length; i++) {
      const timeDiff = data.coinEvents[i].time - data.coinEvents[i - 1].time;
      if (timeDiff < VALIDATION.MIN_COIN_INTERVAL && timeDiff > 0) {
        errors.push(`Coin collection too fast: ${timeDiff}ms gap (min ${VALIDATION.MIN_COIN_INTERVAL}ms)`);
      }
    }
    const lastCoinTime = data.coinEvents[data.coinEvents.length - 1];
    if (lastCoinTime && lastCoinTime.time > maxAllowedTime) {
      errors.push(`Coin collected after game ended: ${lastCoinTime.time}ms > ${gameDuration}ms (+${VALIDATION.EVENT_TIMING_TOLERANCE}ms tolerance)`);
    }
  }

  if (data.xpCollectEvents && Array.isArray(data.xpCollectEvents)) {
    const xpCollectCountDiff = Math.abs(data.xpCollectEvents.length - data.xpCollected);
    if (xpCollectCountDiff > 3) {
      errors.push(`XP collect event count mismatch: ${data.xpCollectEvents.length} events vs ${data.xpCollected} XP (diff: ${xpCollectCountDiff})`);
    }
    for (let i = 1; i < data.xpCollectEvents.length; i++) {
      const timeDiff = data.xpCollectEvents[i].time - data.xpCollectEvents[i - 1].time;
      if (timeDiff < VALIDATION.MIN_XP_INTERVAL && timeDiff > 0) {
        errors.push(`XP collection too fast: ${timeDiff}ms gap (min ${VALIDATION.MIN_XP_INTERVAL}ms)`);
      }
    }
    const lastXPTime = data.xpCollectEvents[data.xpCollectEvents.length - 1];
    if (lastXPTime && lastXPTime.time > maxAllowedTime) {
      errors.push(`XP collected after game ended: ${lastXPTime.time}ms > ${gameDuration}ms (+${VALIDATION.EVENT_TIMING_TOLERANCE}ms tolerance)`);
    }
  }

  if (data.xpUseEvents && Array.isArray(data.xpUseEvents)) {
    const xpUseCountDiff = Math.abs(data.xpUseEvents.length - data.xpUsed);
    if (xpUseCountDiff > 2) {
      errors.push(`XP use event count mismatch: ${data.xpUseEvents.length} events vs ${data.xpUsed} XP used (diff: ${xpUseCountDiff})`);
    }
    for (let i = 1; i < data.xpUseEvents.length; i++) {
      const timeDiff = data.xpUseEvents[i].time - data.xpUseEvents[i - 1].time;
      if (timeDiff < VALIDATION.MIN_XP_USE_INTERVAL && timeDiff > 0) {
        errors.push(`XP use too fast: ${timeDiff}ms gap (min ${VALIDATION.MIN_XP_USE_INTERVAL}ms)`);
      }
    }
    const lastXPUseTime = data.xpUseEvents[data.xpUseEvents.length - 1];
    if (lastXPUseTime && lastXPUseTime.time > maxAllowedTime) {
      errors.push(`XP used after game ended: ${lastXPUseTime.time}ms > ${gameDuration}ms (+${VALIDATION.EVENT_TIMING_TOLERANCE}ms tolerance)`);
    }
  }

  return errors;
}

function validateScoreReasonable(data, calculatedScore) {
  const errors = [];
  // 🔒 使用 clamp 後的 gameDuration，防止偽造時長影響理論最大值計算
  const clampedDuration = Math.min(data.gameDuration, VALIDATION.MAX_GAME_DURATION);
  const gameDurationSec = clampedDuration / 1000;

  const theoreticalMaxCoins = gameDurationSec * VALIDATION.COIN_MAX_PER_SECOND;
  // 🔒 同時受絕對上限約束
  const effectiveMaxCoins = Math.min(data.coins, theoreticalMaxCoins, VALIDATION.MAX_COINS_ABSOLUTE);
  const theoreticalMaxCoinsScore = effectiveMaxCoins * VALIDATION.COIN_POINTS;

  const theoreticalMaxDistance = gameDurationSec * 200;
  const effectiveMaxDistance = Math.min(data.distance, theoreticalMaxDistance, VALIDATION.MAX_DISTANCE_ABSOLUTE);
  const theoreticalMaxDistanceScore = effectiveMaxDistance * VALIDATION.DISTANCE_MULTIPLIER;

  const xpBoostTime = Math.min(data.xpUsed, VALIDATION.MAX_XP_USED_ABSOLUTE) * VALIDATION.XP_DURATION;
  const xpBoostRatio = xpBoostTime > 0 ? Math.min(xpBoostTime / clampedDuration, 1) : 0;
  const xpBoostMultiplier = 1 + xpBoostRatio * (VALIDATION.XP_BOOST_MULTIPLIER - 1);

  const theoreticalMaxScore = (theoreticalMaxCoinsScore + theoreticalMaxDistanceScore) * xpBoostMultiplier;
  const maxAllowedScore = theoreticalMaxScore * VALIDATION.MAX_THEORETICAL_SCORE_RATIO;

  if (calculatedScore > maxAllowedScore) {
    errors.push(`Score exceeds theoretical maximum: ${calculatedScore} > ${Math.round(maxAllowedScore)}`);
  }
  return errors;
}

// 精確事件計算法計算分數
function calculateScore(data) {
  const COIN_POINTS = VALIDATION.COIN_POINTS;
  const DISTANCE_MULTIPLIER = VALIDATION.DISTANCE_MULTIPLIER;
  const XP_BOOST_MULTIPLIER = VALIDATION.XP_BOOST_MULTIPLIER;
  const XP_DURATION = VALIDATION.XP_DURATION;

  // ── 1. 建立 XP boost 時間區間列表 ──────────────────────────
  const boostIntervals = [];
  if (data.xpUseEvents && Array.isArray(data.xpUseEvents) && data.xpUseEvents.length > 0) {
    for (const event of data.xpUseEvents) {
      boostIntervals.push({ start: event.time, end: event.time + XP_DURATION });
    }
  }

  function isInBoost(timeMs) {
    for (const interval of boostIntervals) {
      if (timeMs >= interval.start && timeMs < interval.end) return true;
    }
    return false;
  }

  // ── 2. 精確計算 coin 分數 ──────────────────────────────────
  let coinScore = 0;
  let boostedCoins = 0;
  let normalCoins = 0;

  if (data.coinEvents && Array.isArray(data.coinEvents) && data.coinEvents.length > 0) {
    for (const coinEvent of data.coinEvents) {
      if (isInBoost(coinEvent.time)) {
        coinScore += COIN_POINTS * XP_BOOST_MULTIPLIER;
        boostedCoins++;
      } else {
        coinScore += COIN_POINTS;
        normalCoins++;
      }
    }
    // 若 coinEvents 數量與 coins 不完全一致，補齊差額（以普通分計算）
    const missingCoins = data.coins - data.coinEvents.length;
    if (missingCoins > 0) {
      coinScore += missingCoins * COIN_POINTS;
      normalCoins += missingCoins;
    }
  } else {
    // 沒有 coinEvents 時，回退到整體估算（向後兼容）
    const baseCoinScore = data.coins * COIN_POINTS;
    if (boostIntervals.length > 0) {
      const totalBoostMs = Math.min(data.xpUsed * XP_DURATION, data.gameDuration);
      const xpRatio = Math.min(totalBoostMs / (data.gameDuration || 1), 1);
      const boostMultiplier = 1 + (XP_BOOST_MULTIPLIER - 1) * xpRatio;
      coinScore = baseCoinScore * boostMultiplier;
    } else {
      coinScore = baseCoinScore;
    }
    boostedCoins = Math.round(data.coins * (boostIntervals.length > 0 ? Math.min(data.xpUsed * XP_DURATION / (data.gameDuration || 1), 1) : 0));
    normalCoins = data.coins - boostedCoins;
  }

  // ── 3. 精確計算距離分數 ────────────────────────────────────
  const totalBoostMs = Math.min(data.xpUsed * XP_DURATION, data.gameDuration || 1);
  const boostTimeRatio = boostIntervals.length > 0
    ? Math.min(totalBoostMs / (data.gameDuration || 1), 1)
    : 0;
  const boostDistance = data.distance * boostTimeRatio;
  const normalDistance = data.distance * (1 - boostTimeRatio);
  const distanceScore = Math.floor(
    boostDistance * DISTANCE_MULTIPLIER * XP_BOOST_MULTIPLIER +
    normalDistance * DISTANCE_MULTIPLIER
  );

  // ── 4. 匯總 ────────────────────────────────────────────────
  const totalScore = Math.floor(coinScore + distanceScore);

  return {
    coins: data.coins,
    coinScore: data.coins * COIN_POINTS,
    boostedCoins,
    normalCoins,
    distanceScore: Math.floor(data.distance * DISTANCE_MULTIPLIER),
    xpUsed: data.xpUsed,
    xpCollected: data.xpCollected,
    xpBoostTime: data.xpUsed * XP_DURATION,
    xpBoostedCoinScore: Math.floor(coinScore),
    xpBoostedDistanceScore: distanceScore,
    totalScore
  };
}

function checkRateLimit(identifier) {
  const now = Date.now();
  const key = identifier || 'anonymous';
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, firstRequest: now });
    return true;
  }
  const record = rateLimitMap.get(key);
  if (now - record.firstRequest > VALIDATION.RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { count: 1, firstRequest: now });
    return true;
  }
  if (record.count >= VALIDATION.MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  record.count++;
  return true;
}

function checkDeviceFingerprint(playerId, fingerprint) {
  if (!fingerprint) return true;
  const key = `${playerId}_${fingerprint}`;
  if (!deviceFingerprintMap.has(key)) {
    deviceFingerprintMap.set(key, { count: 1, firstTime: Date.now() });
    return true;
  }
  const record = deviceFingerprintMap.get(key);
  record.count++;
  if (record.count > 50) {
    console.warn(`⚠️ Device ${fingerprint} has ${record.count} game submissions for player ${playerId}`);
  }
  return true;
}

function maskPlayerName(name) {
  if (!name || name.length === 0) return '?';
  return name.charAt(0) + '***';
}

function maskPhone(phone) {
  if (!phone) return '';
  const s = String(phone);
  if (s.length <= 4) return s;
  return s.slice(0, 2) + '****' + s.slice(-2);
}

function formatPlayerResponse(player) {
  return {
    player_id: player.phone,
    username: player.name,
    masked_name: maskPlayerName(player.name),
    total_score: player.total_points,
    total_games: player.total_games,
    best_score: player.best_score,
    best_coins: player.best_coins
  };
}

module.exports = {
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
};
