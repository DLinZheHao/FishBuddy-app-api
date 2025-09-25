import express from 'express';
import LobbyController from '../controllers/testController/LobbyController.js';

const router = express.Router();

router
  .route('/api/4/sendGet')
  .get(LobbyController.index_home)

export default router;

// "http://192.168.0.224:3000" + "/api/4" /index