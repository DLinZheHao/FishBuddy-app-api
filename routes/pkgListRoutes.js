import express from 'express';
import pkgController from '../controllers/testController/PkgController.js';

const router = express.Router();

router
  .route('/api/2/packages/hotel/list')
  .post(pkgController.get_hotel_list)

export default router;