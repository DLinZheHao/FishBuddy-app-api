import http from 'http';
import express from 'express';
import app from './app.js';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// 可選資料擴充（FishBase / Wikipedia）
// 設定方式：
//   ENRICH_METADATA=1           啟用補充步驟
//   ENRICH_SOURCES=fishbase,wikipedia  指定資料來源（預設兩者）
//   HTTP_TIMEOUT_MS=10000       外部請求逾時毫秒數
// 範例：
//   ENRICH_METADATA=1 RUN_FETCH=1 node server.js
// ─────────────────────────────────────────────────────────────────────────────

// app.use(express.json({ limit: '10kb' })); // 設置接受檔案大小
// app.use(express.json())
// app.use(
//   express.urlencoded({
//     extended: true,
//     limit: '10kb',
//   })
// );

app.use(express.urlencoded({ extended: true }));
// 引用環境變數
dotenv.config({ path: './config.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server 基本資訊
const PORT = process.env.PORT || 3000

/// 創建 server 
const server = app.listen(PORT, "0.0.0.0", (req, res) => {
  console.log(`App running on port ${PORT} ....`);
})
