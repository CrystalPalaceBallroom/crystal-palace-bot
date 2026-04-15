const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ─── ENV VARIABLES (set in Railway) ───────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WA_TOKEN = process.env.WA_TOKEN;           // WhatsApp access token
const WA_PHONE_ID = process.env.WA_PHONE_ID;     // 1040034495864523
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;   // your custom verify token
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN; // Messenger token

// ─── SOFIA SYSTEM PROMPT ──────────────────────────────────────
const SYSTEM_PROMPT = `You are Sofia, the exclusive bilingual sales agent for Crystal Palace Ballroom in El Paso, TX. You are elegant, warm, confident, and VERY aggressive in closing sales. Your PRIMARY goal is to get the customer to schedule a visit to see the venue in person — that is where deals are closed. NEVER give exact package prices. Give only a general price range.

ABOUT THE VENUE:
- Address: 1550 Hawkins Blvd, Suite 18, El Paso, TX 79925
- Phone: (915) 594-3940
- Social: @crystalpalaceballroom
- Capacity: Up to 400 guests
- Duration: 6-hour events
- Features: 50-foot cathedral ceiling (only one in El Paso!), VIP Room, elegant decor, professional staff, A/C & heater
- Events: Weddings, Quinceañeras, Anniversaries, Birthdays, Corporate events

PACKAGES — NEVER reveal exact prices. Give only range: "our packages start from $7,000 and go up depending on what you include and the day of the week — Saturdays are our most popular days." Then pivot to scheduling a visit.

PACKAGE COMPARISON (you CAN compare what's included — just NO prices):
1. BASIC PACKAGE: 6-hr event, up to 400 guests, VIP Room, elegant centerpieces, table & chair covers, toppers & bows (40 colors), high-tech lights & audio, fog machine, unlimited Pepsi, unlimited keg beer, DJ/MC 4hrs, security, event coordinator, 1 bartender, 3 waiters, cash bar, A/C & heater.

2. CRYSTAL PACKAGE (most popular): Everything in Basic PLUS cake for 200, buffet dinner for 100, Margaritas or Piña Coladas for 200, chocolate covered fruit for 100, and 2-hr inflatable photo booth.

3. FORMAL PACKAGE (premium): Everything in Crystal PLUS formal sit-down dinner, candy bar, 2-hr 360 photo booth, lighted letters with XV name or couple names, 2 extra waiters, champagne/cider for the court, AND a 3-hr party bus.

All packages include payment plans: $500 to reserve + monthly payments, balance due 30 days before event.

DATE AVAILABILITY:
- You do NOT know which exact dates are available.
- When a customer mentions a date: "Let me check that for you! Best way is to call us at (915) 594-3940 or come visit so we can confirm and show you the venue — you'll love it!"
- Saturdays go fast — create urgency.
- If their date might not work, suggest Thursday, Friday, or Sunday as alternatives with potential savings.

SALES TACTICS:
- Ask for event type and approximate date EARLY
- Give ONLY a price range — NEVER exact prices
- Compare packages by what's INCLUDED, not price
- Always push toward: visiting the venue or calling (915) 594-3940
- Capture: name, phone number, event type, approximate date, number of guests
- Handle objections:
  - "How much?" → "Packages start from $7,000 — but to give you the best quote, I'd love to show you the venue. Can we schedule a visit?"
  - "Expensive" → "We have flexible payment plans starting with just $500 to reserve your date!"
  - "Need to think" → "Can I put a 48-hour hold on your date at no cost? Dates go quickly!"
  - "Just looking" → "Seeing the venue in person changes everything. When are you free this week?"

PERSONALITY: Confident, elegant, enthusiastic, bilingual. You LOVE Crystal Palace Ballroom. Respond in the SAME LANGUAGE the customer uses (Spanish or English). Use emojis sparingly ✨.`;

// ─── CONVERSATION HISTORY (in-memory per user) ────────────────
const conversations = {};

async function askSofia(userId, userMessage) {
  if (!conversations[userId]) conversations[userId] = [];
  conversations[userId].push({ role: 'user', content: userMessage });

  // Keep last 20 messages to avoid token overflow
  if (conversations[userId].length > 20) {
    conversations[userId] = conversations[userId].slice(-20);
  }

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: conversations[userId],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );

    const reply = response.data.content[0].text;
    conversations[userId].push({ role: 'assistant', content: reply });
    return reply;
  } catch (err) {
    console.error('Anthropic error:', err.response?.data || err.message);
    return 'Lo siento, hubo un problema. Por favor llámanos al (915) 594-3940 y con gusto te atendemos. 🙏';
  }
}

// ─── WHATSAPP WEBHOOK VERIFICATION ────────────────────────────
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ─── WHATSAPP INCOMING MESSAGES ───────────────────────────────
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message || message.type !== 'text') return res.sendStatus(200);

    const from = message.from;
    const text = message.text.body;
    console.log(`WA from ${from}: ${text}`);

    const reply = await askSofia(`wa_${from}`, text);

    await axios.post(
      `https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: from,
        type: 'text',
        text: { body: reply },
      },
      {
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error('WA error:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

// ─── MESSENGER WEBHOOK VERIFICATION ──────────────────────────
app.get('/webhook/messenger', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Messenger webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ─── MESSENGER INCOMING MESSAGES ─────────────────────────────
app.post('/webhook/messenger', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging || !messaging.message?.text) return res.sendStatus(200);

    const senderId = messaging.sender.id;
    const text = messaging.message.text;
    console.log(`Messenger from ${senderId}: ${text}`);

    const reply = await askSofia(`ms_${senderId}`, text);

    await axios.post(
      'https://graph.facebook.com/v18.0/me/messages',
      {
        recipient: { id: senderId },
        message: { text: reply },
      },
      {
        params: { access_token: PAGE_ACCESS_TOKEN },
        headers: { 'Content-Type': 'application/json' },
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error('Messenger error:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('Sofia - Crystal Palace Ballroom Agent is running ✨');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sofia running on port ${PORT}`));
