/* ============================================================
   /api/username.js  —  foydalanuvchi nomi (username)
   QAYERGA: api/ papkasiga, nomi: username.js

   GET  /api/username?check=aziz01        -> {available:true/false}
   POST /api/username {email, username}   -> saqlaydi, band bo'lsa xato qaytaradi

   Qoida: 3-20 belgi, kichik lotin harf bilan boshlanadi,
          faqat harf/raqam/pastki chiziq (_) bo'lishi mumkin.

   Kerakli env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
============================================================ */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = 'studyai_scores';
const RULE = /^[a-z][a-z0-9_]{2,19}$/;

async function sb(path, opts) {
  opts = opts || {};
  const headers = Object.assign({
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json'
  }, opts.headers || {});

  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body
  });

  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) {
    const raw = (data && data.message) ? data.message : String(data || '');
    const dup = /duplicate key|already exists/i.test(raw);
    const err = new Error(dup ? 'DUPLICATE' : (raw || ('Supabase xatosi (' + r.status + ')')));
    err.dup = dup;
    throw err;
  }
  return data;
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return req.body;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!SB_URL || !SB_KEY) throw new Error('SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY sozlanmagan');

    if (req.method === 'GET') {
      const u = String((req.query || {}).check || '').trim().toLowerCase();
      if (!RULE.test(u)) return res.status(200).json({ available: false, reason: 'format' });
      const found = await sb(TABLE + '?select=email&username=eq.' + encodeURIComponent(u));
      return res.status(200).json({ available: !(found && found.length) });
    }

    if (req.method === 'POST') {
      const b = readBody(req);
      const email = String(b.email || '').trim().toLowerCase();
      const username = String(b.username || '').trim().toLowerCase();
      if (!email || email.indexOf('@') < 0) {
        return res.status(400).json({ error: { message: 'email kerak' } });
      }
      if (!RULE.test(username)) {
        return res.status(400).json({ error: { message: 'Username 3-20 belgi, harf bilan boshlanishi va faqat lotin harf/raqam/_ bo\'lishi kerak' } });
      }
      try {
        await sb(TABLE, {
          method: 'POST',
          body: JSON.stringify({ email: email, username: username, updated_at: new Date().toISOString() }),
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
        });
      } catch (err) {
        if (err.dup) return res.status(409).json({ error: { message: 'Bu username band, boshqasini tanlang' } });
        throw err;
      }
      return res.status(200).json({ ok: true, username: username });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
