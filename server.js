const http = require('http')
const express = require('express')
const app = require('./app')
const path = require('path');
const dotenv = require('dotenv');

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

// server 基本資訊
const PORT = process.env.PORT || 3000

/// 創建 server 
const server = app.listen(PORT, "0.0.0.0", (req, res) => {
  console.log(`App running on port ${PORT} ....`);
})


