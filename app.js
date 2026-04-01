// Include express from node_modules and define server related variables
import express from 'express';
import weatherRouter from './routes/weatherRoutes.js';

const app = express();
const port = 3000;

app.use(express.json())
app.use('/', weatherRouter)


// 輸出 app 給 server 使用
export default app;
