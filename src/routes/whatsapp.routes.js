const express = require('express');
const router = express.Router();
const wa = require('../controllers/whatsappController');
const asyncWrap = require('../utils/asyncWrap');

router.get('/webhook', wa.verifyWebhook);
router.post('/webhook', asyncWrap(wa.receiveMessage));
router.get('/status', wa.status);

module.exports = router;
