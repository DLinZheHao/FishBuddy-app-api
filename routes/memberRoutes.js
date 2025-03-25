const express = require('express');
const router = express.Router();

const MemberController = require('../controllers/MemberController');

router
  .route('/api/6/order/member/upcoming/1')
  .post(MemberController.upcoming_1)

router
  .route('/api/6/order/member/pay/1')
  .post(MemberController.upcoming_1)

module.exports = router

// https://mweb-t01.eztravel.com.tw/api/6/order/member/upcoming/1