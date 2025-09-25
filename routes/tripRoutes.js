import express from 'express';
import TripController from '../controllers/testController/TripController.js';

const router = express.Router();

router
  .route('/api/1/trip/plan/:prodNo/:depart')
  .get(TripController.get_plan)

export default router;
