import express from 'express';
import MemberController from '../controllers/testController/MemberController.js';

const router = express.Router();

router
  .route('/api/6/order/member/upcoming/1')
  .post(MemberController.upcoming_1)

router
  .route('/api/6/order/member/pay/1')
  .post(MemberController.upcoming_1)

export default router;

// https://mweb-t01.eztravel.com.tw/api/6/order/member/upcoming/1