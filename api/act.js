const crypto = require('crypto');
const { runAction, SB } = require('./_store.js');

const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// POST /api/act  { action, payload, pin? }  -> { ok, state, valor }
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const { action, payload, pin } = body || {};

  const isAdmin = SB.ADMIN_ACTIONS.includes(action) || action === 'admin-check';
  if (isAdmin) {
    const expected = process.env.ADMIN_PIN;
    if (!expected) return res.status(500).json({ error: 'Servidor sem ADMIN_PIN configurado.' });
    if (!safeEq(pin || '', expected)) return res.status(401).json({ error: 'PIN incorreto.' });
    if (action === 'admin-check') return res.status(200).json({ ok: true });
  }

  try {
    const out = await runAction(action, payload);
    res.status(200).json({ ok: true, state: out.state, valor: out.valor });
  } catch (e) {
    const status = e.code === 'RULE' ? 400 : e.code === 'CONFLICT' ? 409 : 500;
    res.status(status).json({ error: e.message || 'Erro inesperado.', code: e.code });
  }
};
