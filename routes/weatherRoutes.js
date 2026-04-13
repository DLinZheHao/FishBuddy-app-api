import express from 'express';
import weatherController from '../controllers/WeatherController.js';

const router = express.Router();

router
    .route('/forecast/36-hour')
    .get(weatherController.get_36_hour_weather);

router
    .route('/forecast/tide_info')
    .get(weatherController.get_tide_info)

router
    .route('/forecast/tidy_info')
    .get(weatherController.get_tidy_tide_info)

export default router;
