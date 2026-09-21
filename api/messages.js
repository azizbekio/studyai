/* ============================================================
   /api/messages.js — talabalar orasidagi shaxsiy xabarlar
   Identifikatsiya HAR DOIM username orqali — email hech qachon
   boshqa foydalanuvchiga qaytarilmaydi (maxfiylik uchun).

   GET  /api/messages?email=men@gmail.com
        -> suhbatlar ro'yxati (har biri boshqa odamning username'i bilan)
   GET  /api/messages?email=men@..&withUsername=aziz01
        -> bitta suhbat matni, shu bilan birga "o'qildi" deb belgilaydi
   POST /api/messages {from, toUsername, body}
        -> xabar yuborish

   Kerakli env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
============================================================ */

const { requireUser } = require('./_session');
const { guard } = require('./_ratelimit');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MSG = 'studyai_messages';
const SCORES = 'studyai_scores';

async function sb(path, opts) {
  opts = opts || {};
  const headers = Object.assign({
    apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json'
  }, opts.headers || {});
  const r = await fetch(SB_URL + '/rest/v1/' + path, { method: opts.method || 'GET', headers: headers, body: opts.body });
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

async function findByUsername(username) {
  const rows = await sb(SCORES + '?select=email,name,picture,avatar,username&username=eq.' + encodeURIComponent(username));
  return (rows && rows[0]) || null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!SB_URL || !SB_KEY) throw new Error('SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY sozlanmagan');

    /* =============== XABAR YUBORISH =============== */
    if (req.method === 'POST') {
      const who = requireUser(req, res);
      if (!who) return;
      if (!guard(res, 'dm:' + who.email, 20, 60000)) return;
      const b = readBody(req);
      const from = who.email;   // jo'natuvchi sessiyadan olinadi
      const toUsername = String(b.toUsername || '').trim().toLowerCase();
      const body = String(b.body || '').trim().slice(0, 500);

      if (!toUsername) return res.status(400).json({ error: { message: 'Qabul qiluvchi username kerak' } });
      if (!body) return res.status(400).json({ error: { message: 'Xabar bo\'sh bo\'lmasligi kerak' } });

      const target = await findByUsername(toUsername);
      if (!target) return res.status(404).json({ error: { message: 'Bunday username topilmadi' } });
      if (target.email === from) return res.status(400).json({ error: { message: 'O\'zingizga xabar yozib bo\'lmaydi' } });

      await sb(MSG, {
        method: 'POST',
        body: JSON.stringify({ from_email: from, to_email: target.email, body: body }),
        headers: { Prefer: 'return=minimal' }
      });
      return res.status(200).json({ ok: true });
    }

    /* =============== O'QISH =============== */
    const who = requireUser(req, res);
    if (!who) return;
    const query = req.query || {};
    const email = who.email;

    if (query.withUsername) {
      const target = await findByUsername(String(query.withUsername).trim().toLowerCase());
      if (!target) return res.status(404).json({ error: { message: 'Foydalanuvchi topilmadi' } });
      const other = target.email;

      const rows = await sb(MSG +
        '?select=id,from_email,to_email,body,created_at' +
        '&or=(and(from_email.eq.' + encodeURIComponent(email) + ',to_email.eq.' + encodeURIComponent(other) + '),' +
        'and(from_email.eq.' + encodeURIComponent(other) + ',to_email.eq.' + encodeURIComponent(email) + '))' +
        '&order=created_at.asc&limit=300');

      // O'qilgan deb belgilash — fon rejimida, javobni kutmaymiz
      sb(MSG + '?to_email=eq.' + encodeURIComponent(email) + '&from_email=eq.' + encodeURIComponent(other) + '&read=eq.false', {
        method: 'PATCH', body: JSON.stringify({ read: true }), headers: { Prefer: 'return=minimal' }
      }).catch(function () {});

      return res.status(200).json({
        thread: (rows || []).map(function (m) {
          return { id: m.id, mine: m.from_email === email, body: m.body, at: m.created_at };
        })
      });
    }

    // Suhbatlar ro'yxati
    const rows = await sb(MSG +
      '?select=from_email,to_email,body,created_at,read' +
      '&or=(from_email.eq.' + encodeURIComponent(email) + ',to_email.eq.' + encodeURIComponent(email) + ')' +
      '&order=created_at.desc&limit=300');

    const byPeer = {};
    (rows || []).forEach(function (m) {
      const peer = m.from_email === email ? m.to_email : m.from_email;
      if (!byPeer[peer]) byPeer[peer] = { last: m.body, at: m.created_at, unread: 0 };
      if (m.to_email === email && !m.read) byPeer[peer].unread++;
    });

    const peerEmails = Object.keys(byPeer);
    let users = [];
    if (peerEmails.length) {
      users = await sb(SCORES + '?select=email,name,picture,avatar,username&email=in.(' + peerEmails.join(',') + ')');
    }

    const list = (users || [])
      .filter(function (u) { return !!u.username; }) // username yo'q bo'lsa ro'yxatga qo'shmaymiz
      .map(function (u) {
        return {
          username: u.username, name: u.name || '', picture: u.avatar || u.picture || '',
          last: byPeer[u.email].last, at: byPeer[u.email].at, unread: byPeer[u.email].unread
        };
      })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });

    return res.status(200).json({ list: list, unreadTotal: list.reduce(function (a, x) { return a + x.unread; }, 0) });

  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
