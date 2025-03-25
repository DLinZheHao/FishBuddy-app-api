const express = require('express');
const router = express.Router();

const LobbyController = require('../controllers/LobbyController');

router
  .route('/api/4/sendGet')
  .get(LobbyController.index_home)

module.exports = router

// "http://192.168.0.224:3000" + "/api/4" /index