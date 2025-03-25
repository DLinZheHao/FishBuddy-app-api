const express = require('express');
const router = express.Router();

const pkgController = require('../controllers/PkgController');

router
  .route('/api/2/packages/hotel/list')
  .post(pkgController.get_hotel_list)

module.exports = router