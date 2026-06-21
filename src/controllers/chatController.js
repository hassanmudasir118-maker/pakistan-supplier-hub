const db = require('../config/db');

const SYSTEM_PROMPT = `You are the shopping assistant for Pakistan Supplier Hub, a multi-vendor wholesale and dropshipping marketplace in Pakistan. You help customers find products, compare suppliers, understand wholesale/dropship pricing, and answer questions about orders, shipping, and payment methods (Cash on Delivery, Bank Transfer, EasyPaisa, JazzCash).

Rules:
- Be concise, friendly, and helpful — like a knowledgeable shop assistant, not a generic chatbot.
- Only recommend products/suppliers from the CONTEXT data given to you below. Never invent product names, prices, or suppliers that aren't in the context.
- If you don't have enough information in the context to answer, say so honestly and suggest the customer browse the Shop or Suppliers page.
- Prices are in Pakistani Rupees (Rs.).
- Keep replies short (2-4 sentences) unless the customer asks for a list/comparison.
- You cannot place orders yourself — guide the customer to add items to their cart and checkout.`;

async function buildContext(userMessage) {
  // Lightweight keyword-based retrieval: pull a handful of relevant products/categories
  // so the model answers from real, current catalog data instead of hallucinating.
  const words = userMessage.toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
  let products = [];
  if (words.length) {
    const likeClauses = words.map(() => '(p.title LIKE ? OR p.description LIKE ?)').join(' OR ');
    const params = [];
    words.forEach((w) => params.push(`%${w}%`, `%${w}%`));
    products = db.all(`
      SELECT p.title, p.retail_price, p.dropship_price, p.stock_quantity, p.rating_avg, s.store_name, p.slug
      FROM products p JOIN vendors v ON v.id = p.vendor_id JOIN stores s ON s.vendor_id = v.id
      WHERE p.status = 'active' AND (${likeClauses})
      LIMIT 8
    `, params);
  }
  if (!products.length) {
    products = db.all(`
      SELECT p.title, p.retail_price, p.dropship_price, p.stock_quantity, p.rating_avg, s.store_name, p.slug
      FROM products p JOIN vendors v ON v.id = p.vendor_id JOIN stores s ON s.vendor_id = v.id
      WHERE p.status = 'active' ORDER BY p.sold_count DESC LIMIT 6
    `);
  }
  const categories = db.all(`SELECT name FROM categories ORDER BY sort_order LIMIT 15`);
  const settings = db.get(`SELECT flat_shipping_fee, free_shipping_threshold FROM settings WHERE id = 'global'`);

  return `CONTEXT — current catalog data (use ONLY this for product facts):
Available categories: ${categories.map((c) => c.name).join(', ')}

Matching/relevant products:
${products.map((p) => `- "${p.title}" by ${p.store_name} — Rs. ${p.retail_price}${p.dropship_price ? ` (dropship cost: Rs. ${p.dropship_price})` : ''}, rating ${p.rating_avg || 'N/A'}, ${p.stock_quantity > 0 ? 'in stock' : 'out of stock'} — /product/${p.slug}`).join('\n') || 'No matching products found in catalog.'}

Shipping: flat fee Rs. ${settings.flat_shipping_fee}${settings.free_shipping_threshold ? `, free over Rs. ${settings.free_shipping_threshold}` : ''}.
Payment methods: Cash on Delivery, Bank Transfer, EasyPaisa, JazzCash.`;
}

// ---------------------------------------------------------------------------
// POST /api/chat — AI shopping assistant
// body: { message, history: [{role, content}] }
// ---------------------------------------------------------------------------
async function chat(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'The AI assistant is not configured yet. Please add an ANTHROPIC_API_KEY to enable it.' });
  }
  const { message, history = [] } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });
  if (message.length > 1000) return res.status(400).json({ error: 'Message is too long.' });

  const context = await buildContext(message);
  const messages = [
    ...history.slice(-8).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content || '').slice(0, 1000) })),
    { role: 'user', content: `${context}\n\nCustomer question: ${message}` },
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[chat] Anthropic API error:', response.status, errBody);
      return res.status(502).json({ error: 'The AI assistant is temporarily unavailable. Please try again shortly.' });
    }

    const data = await response.json();
    const reply = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    res.json({ reply: reply || "Sorry, I couldn't generate a response. Please try rephrasing your question." });
  } catch (err) {
    console.error('[chat] request failed:', err.message);
    res.status(502).json({ error: 'The AI assistant is temporarily unavailable. Please try again shortly.' });
  }
}

module.exports = { chat, buildContext };
