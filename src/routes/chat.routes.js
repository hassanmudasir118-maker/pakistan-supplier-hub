const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const chat = require('../controllers/chatController');
const asyncWrap = require('../utils/asyncWrap');

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Please wait a moment before asking again.' },
});

router.post('/chat', chatLimiter, asyncWrap(chat.chat));

module.exports = router;
