const express = require('express');
const router = express.Router();

const TripController = require('../controllers/TripController');

router
  .route('/api/1/trip/plan/:prodNo/:depart')
  .get(TripController.get_plan)

module.exports = router
