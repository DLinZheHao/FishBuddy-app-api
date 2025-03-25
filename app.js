// Include express from node_modules and define server related variables
const express = require('express')
const app = express()
const port = 3000

const taskRouter = require('./routes/tasksRoutes');
const pkgRouter = require('./routes/pkgListRoutes')
const tripRouter = require('./routes/tripRoutes')
const memberRouter = require('./routes/memberRoutes')
const weatherRouter = require('./routes/weatherRoutes')
const lobbyRouter = require('./routes/lobbyRoutes')

app.use(express.json())
app.use('/', taskRouter);
app.use('/', pkgRouter)
app.use('/', tripRouter)
app.use('/', memberRouter)
app.use('/', weatherRouter)
app.use('/', lobbyRouter)

// 輸出 app 給 server 使用
module.exports = app
