const express = require('express');
const router = express.Router();

const weatherController = require('../controllers/WeatherController');

router
    .route('/forecast/36-hour')
    .get(weatherController.get_36_hour_weather);

router
    .route('/forecast/tide_info')
    .get(weatherController.get_tide_info)

module.exports = router