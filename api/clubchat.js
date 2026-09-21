/* ============================================================
   /api/clubchat.js — klub ichidagi umumiy chat
   QAYERGA: api/ papkasiga, nomi: clubchat.js

   GET  /api/clubchat?code=ABC123&email=men@gmail.com
        -> oxirgi 100 ta xabar (faqat shu klub a'zosi ko'ra oladi)
   POST /api/clubchat {email, code, body}
        -> klubga xabar yozadi

   Kerakli env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   Jadval: studyai_club_messages (supabase-clubchat.sql ga qarang)
============================================================ */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHAT = 'studyai_club_messages';
const SCORES = 'studyai_scores';

async function sb(path, opts) {
  opts = opts || {};
  const headers = Object.assign({
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json'
  }, opts.headers || {});
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET', headers: headers, body: opts.body
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) {
    const msg = (data && data.message) ? data.message : ('Supabase xatosi (' + r.status + ')');
    throw new Error(msg);
  }
  return data;
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return req.body;
}

/* Foydalanuvchi rostdan ham shu klub a'zosimi? */
async function memberOf(email) {
  const rows = await sb(SCORES + '?select=email,name,username,club&email=eq.' + encodeURIComponent(email));
  return (rows && rows[0]) || null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!SB_URL || !SB_KEY) throw new Error('SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY sozlanmagan');

    /* =============== XABAR YOZISH =============== */
    if (req.method === 'POST') {
      const b = readBody(req);
      const email = String(b.email || '').trim().toLowerCase();
      const code = String(b.code || '').trim().toUpperCase().slice(0, 10);
      const body = String(b.body || '').trim().slice(0, 400);

      if (!email || email.indexOf('@') < 0) return res.status(400).json({ error: { message: 'email kerak' } });
      if (!code) return res.status(400).json({ error: { message: 'Klub kodi kerak' } });
      if (!body) return res.status(400).json({ error: { message: 'Xabar bo\'sh' } });

      const me = await memberOf(email);
      if (!me || me.club !== code) {
        return res.status(403).json({ error: { message: 'Siz bu klub a\'zosi emassiz' } });
      }

      await sb(CHAT, {
        method: 'POST',
        body: JSON.stringify({
          club: code,
          email: email,
          name: String(me.name || '').slice(0, 60),
          username: me.username || null,
          body: body
        }),
        headers: { Prefer: 'return=minimal' }
      });
      return res.status(200).json({ ok: true });
    }

    /* =============== O'QISH =============== */
    const query = req.query || {};
    const email = String(query.email || '').trim().toLowerCase();
    const code = String(query.code || '').trim().toUpperCase().slice(0, 10);
    if (!email || !code) return res.status(400).json({ error: { message: 'email va code kerak' } });

    const me = await memberOf(email);
    if (!me || me.club !== code) {
      return res.status(403).json({ error: { message: 'Siz bu klub a\'zosi emassiz' } });
    }

    const rows = await sb(CHAT +
      '?select=id,email,name,username,body,created_at&club=eq.' + encodeURIComponent(code) +
      '&order=created_at.desc&limit=100');

    const list = (rows || []).reverse().map(function (m) {
      return {
        id: m.id,
        mine: String(m.email || '').toLowerCase() === email,
        name: m.name || '',
        username: m.username || '',
        body: m.body,
        at: m.created_at
      };
    });

    return res.status(200).json({ list: list });

  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
