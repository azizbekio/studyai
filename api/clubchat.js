/* ============================================================
   /api/clubchat.js — klub ichidagi umumiy chat
   QAYERGA: api/ papkasiga, nomi: clubchat.js
   (agar avvalgi javobdagi versiyasi bo'lsa — ustidan yozing)

   GET  /api/clubchat?code=ABC123&email=men@gmail.com
        -> oxirgi 100 ta xabar
   GET  /api/clubchat?code=ABC123&email=...&count=1&since=<ISO vaqt>
        -> faqat o'qilmagan xabarlar soni (badge uchun, yengil so'rov)
   POST /api/clubchat {email, code, body}
        -> klubga xabar yozadi

   XAVFSIZLIK: har bir so'rovda odam rostdan ham shu klub a'zosimi —
   serverda tekshiriladi. Brauzerdan kelgan "men a'zoman" degan
   gapga ishonilmaydi.

   Kerakli env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
============================================================ */

const { requireUser } = require('./_session');
const { guard } = require('./_ratelimit');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHAT = 'studyai_club_messages';
const SCORES = 'studyai_scores';

async function sb(path, opts) {
  opts = opts || {};
  const headers = Object.assign({
    apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json'
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

async function memberOf(email) {
  const rows = await sb(SCORES +
    '?select=email,name,username,avatar,club,club_role&email=eq.' + encodeURIComponent(email));
  return (rows && rows[0]) || null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!SB_URL || !SB_KEY) throw new Error('SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY sozlanmagan');

    /* =============== XABAR YOZISH =============== */
    if (req.method === 'POST') {
      const who = requireUser(req, res);
      if (!who) return;
      /* 20 ta xabar / daqiqa — spamning oldini oladi */
      if (!guard(res, 'clubchat:' + who.email, 20, 60000)) return;
      const b = readBody(req);
      const email = who.email;
      const code = String(b.code || '').trim().toUpperCase().slice(0, 10);
      const body = String(b.body || '').trim().slice(0, 400);

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
    const who = requireUser(req, res);
    if (!who) return;
    const query = req.query || {};
    const email = who.email;
    const code = String(query.code || '').trim().toUpperCase().slice(0, 10);
    if (!code) return res.status(400).json({ error: { message: 'code kerak' } });

    const me = await memberOf(email);
    if (!me || me.club !== code) {
      return res.status(403).json({ error: { message: 'Siz bu klub a\'zosi emassiz' } });
    }

    /* --- Faqat son: badge uchun arzon so'rov --- */
    if (query.count) {
      const since = String(query.since || '').trim();
      let path = CHAT + '?select=id&club=eq.' + encodeURIComponent(code) +
        '&email=neq.' + encodeURIComponent(email) + '&limit=50';
      if (since) path += '&created_at=gt.' + encodeURIComponent(since);
      const rows = await sb(path);
      return res.status(200).json({ unread: (rows || []).length });
    }

    const rows = await sb(CHAT +
      '?select=id,email,name,username,body,created_at&club=eq.' + encodeURIComponent(code) +
      '&order=created_at.desc&limit=100');

    /* Rasm/avatarlarni bir marta olib, xabarlarga yopishtiramiz
       (har bir xabar uchun alohida so'rov — sekin bo'lardi). */
    const emails = Array.from(new Set((rows || []).map(m => m.email))).slice(0, 50);
    let people = [];
    if (emails.length) {
      people = await sb(SCORES + '?select=email,avatar,picture,name,username,club_role&email=in.(' +
        emails.map(encodeURIComponent).join(',') + ')') || [];
    }
    const byEmail = {};
    people.forEach(p => { byEmail[String(p.email).toLowerCase()] = p; });

    const list = (rows || []).reverse().map(m => {
      const p = byEmail[String(m.email || '').toLowerCase()] || {};
      return {
        id: m.id,
        mine: String(m.email || '').toLowerCase() === email,
        name: p.name || m.name || '',
        username: p.username || m.username || '',
        avatar: p.avatar || '',   // Google fotosi ishlatilmaydi — hammada bitta standart rasm
        role: p.club_role || 'student',
        body: m.body,
        at: m.created_at
      };
    });

    return res.status(200).json({
      list: list,
      lastAt: list.length ? list[list.length - 1].at : null
    });

  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
