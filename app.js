// Include express from node_modules and define server related variables
import express from 'express';
import taskRouter from './routes/tasksRoutes.js';
import pkgRouter from './routes/pkgListRoutes.js';
import tripRouter from './routes/tripRoutes.js';
import memberRouter from './routes/memberRoutes.js';
import weatherRouter from './routes/weatherRoutes.js';
import lobbyRouter from './routes/lobbyRoutes.js';
import vacationRouter from './routes/vacationRoutes.js';

const app = express();
const port = 3000;

app.use(express.json())
app.use('/', taskRouter);
app.use('/', pkgRouter)
app.use('/', tripRouter)
app.use('/', memberRouter)
app.use('/', weatherRouter)
app.use('/', lobbyRouter)
app.use('/', vacationRouter)

// 輸出 app 給 server 使用
export default app;
