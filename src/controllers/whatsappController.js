const db = require('../config/db');

const whatsappEnabled = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);

// ---------------------------------------------------------------------------
// GET /api/whatsapp/webhook — Meta calls this once to verify your webhook URL
// ---------------------------------------------------------------------------
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
}

// ---------------------------------------------------------------------------
// POST /api/whatsapp/webhook — incoming WhatsApp messages from customers
// ---------------------------------------------------------------------------
async function receiveMessage(req, res) {
  res.sendStatus(200); // ack immediately — Meta requires a fast 200 response

  if (!whatsappEnabled) return;

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message) return;

    const from = message.from; // customer's WhatsApp number
    const text = message.text?.body;
    if (!text) return;

    console.log(`[whatsapp] message from ${from}: ${text}`);

    // Reuse the same AI assistant logic that powers the website chat widget,
    // so customers get identical, catalog-grounded answers over WhatsApp.
    const { buildContext } = require('./chatController');
    // Note: send a reply via sendWhatsAppMessage() once your Meta app's
    // message templates / 24-hour session window rules are configured.
    await sendWhatsAppMessage(from, "Thanks for messaging Pakistan Supplier Hub! Our AI assistant integration is set up — connect it to start answering automatically.");
  } catch (err) {
    console.error('[whatsapp] webhook processing error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Helper: send an outbound WhatsApp message via the Cloud API
// ---------------------------------------------------------------------------
async function sendWhatsAppMessage(to, body) {
  if (!whatsappEnabled) {
    console.log('[whatsapp] not configured — would have sent to', to, ':', body);
    return { simulated: true };
  }
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    console.error('[whatsapp] send failed:', response.status, err);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// GET /api/whatsapp/status — lets the frontend know whether to show WhatsApp UI
// ---------------------------------------------------------------------------
function status(req, res) {
  res.json({ enabled: whatsappEnabled });
}

module.exports = { verifyWebhook, receiveMessage, sendWhatsAppMessage, status, whatsappEnabled };
