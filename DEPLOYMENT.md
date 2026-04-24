# NO-JOYSTICK 遊戲部署說明

## 系統需求

| 項目 | 要求 |
|------|------|
| Node.js | **v18.0.0 或以上** |
| 作業系統 | Linux / macOS / Windows |
| 硬碟空間 | 最少 200MB |
| 記憶體 | 最少 256MB |
| 網絡端口 | 預設 **3000**（可修改） |

---

## 項目結構

```
NO-JOYSTICK/
├── index.html          ← 前端遊戲主頁（勿修改）
├── common.js           ← 前端遊戲引擎
├── js/                 ← 前端 JavaScript 模組
├── images/             ← 遊戲圖片資源
├── sounds/             ← 遊戲音效資源
├── server/             ← 後端伺服器目錄
│   ├── server.js       ← Express 主程式（入口點）
│   ├── database.js     ← SQLite 資料庫層
│   ├── validation.js   ← 防作弊驗證邏輯
│   ├── package.json    ← Node.js 依賴清單
│   └── setup-database.sql  ← 資料庫結構說明（參考用）
└── game.db             ← SQLite 資料庫文件（自動生成）
```

---

## 部署步驟

### 第一步：上傳項目文件

將整個 `NO-JOYSTICK` 目錄上傳到伺服器，例如：

```bash
/var/www/NO-JOYSTICK/
```

### 第二步：安裝 Node.js 依賴

```bash
cd /var/www/NO-JOYSTICK/server
npm install
```

> `better-sqlite3` 需要編譯原生模組，請確保伺服器已安裝 `build-essential`（Linux）或 Xcode Command Line Tools（macOS）。
>
> **Linux 安裝編譯工具：**
> ```bash
> sudo apt-get install -y build-essential python3
> ```

### 第三步：設定環境變數（可選）

| 環境變數 | 預設值 | 說明 |
|----------|--------|------|
| `PORT` | `3000` | 伺服器監聽端口 |
| `DB_PATH` | `./game.db`（與 server.js 同目錄） | SQLite 資料庫文件路徑 |

**設定方式（Linux）：**

```bash
export PORT=8080
export DB_PATH=/var/data/game.db
```

或在啟動命令中直接指定：

```bash
PORT=8080 node server.js
```

### 第四步：啟動伺服器

**直接啟動（測試用）：**

```bash
cd /var/www/NO-JOYSTICK/server
node server.js
```

**使用 PM2 持久運行（生產環境推薦）：**

```bash
# 安裝 PM2
npm install -g pm2

# 啟動
cd /var/www/NO-JOYSTICK/server
pm2 start server.js --name "no-joystick"

# 設定開機自動啟動
pm2 startup
pm2 save
```

**常用 PM2 指令：**

```bash
pm2 status              # 查看運行狀態
pm2 logs no-joystick    # 查看日誌
pm2 restart no-joystick # 重啟服務
pm2 stop no-joystick    # 停止服務
```

### 第五步：設定 Nginx 反向代理（推薦）

如果使用 Nginx 作為前端代理，請添加以下配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # ← 替換為實際域名

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

重啟 Nginx：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 第六步：設定 HTTPS（推薦）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 資料庫說明

本項目使用 **SQLite**，資料庫為單一文件 `game.db`，**無需安裝任何資料庫服務**。

伺服器首次啟動時會自動建立 `game.db` 及所有表格，無需手動執行 SQL。

`setup-database.sql` 文件僅供參考資料庫結構，或在需要手動重建時使用：

```bash
sqlite3 game.db < setup-database.sql
```

**備份資料庫：**

```bash
# 直接複製文件即可備份
cp game.db game.db.backup

# 或使用 SQLite 備份命令
sqlite3 game.db ".backup game_backup.db"
```

---

## API 端點一覽

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/players/register` | 玩家註冊 |
| `GET` | `/api/players/:phone` | 查詢玩家資料 |
| `POST` | `/api/game/submit` | 提交遊戲分數 |
| `GET` | `/api/leaderboard` | 排行榜（同電話只顯示最高分） |
| `GET` | `/api/player/:phone/history` | 玩家歷史記錄 |
| `GET` | `/api/stats` | 全局統計數據 |

---

## 排行榜邏輯

- 同一電話號碼在排行榜中**只出現一次**
- 顯示的名字為該玩家**打出最高分時使用的名字**
- 排名按**單局最高分**排序（非累積總分）

---

## 防作弊系統

後端包含以下防作弊機制，所有分數均在伺服器端重新計算：

- **遊戲時長驗證**：最長 100 秒，防止偽造時長
- **金幣速率限制**：每秒最多 15 個
- **事件時序驗證**：金幣收集間隔、XP 使用間隔均有最小值限制
- **絕對數量上限**：金幣上限 2700 個、XP 上限 30 個
- **IP 速率限制**：每分鐘最多 10 次請求

---

## 常見問題

**Q: 啟動時出現 `better-sqlite3` 編譯錯誤**

```bash
sudo apt-get install -y build-essential python3
cd /var/www/NO-JOYSTICK/server
npm rebuild better-sqlite3
```

**Q: 端口 3000 被佔用**

```bash
PORT=8080 node server.js
```

**Q: 如何查看資料庫內容**

```bash
sqlite3 game.db
sqlite> SELECT * FROM players ORDER BY best_score DESC LIMIT 10;
sqlite> .quit
```

**Q: 如何清空所有遊戲數據**

```bash
sqlite3 game.db "DELETE FROM game_records; DELETE FROM players;"
```
