import express from 'express';
import VacationController from '../controllers/testController/VacationController.js';

const router = express.Router();

router
  .route('/api/1/vacation/eztraveler')
  .get(VacationController.get_vacation)

export default router;