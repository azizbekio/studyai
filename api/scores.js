/* ============================================================
   /api/scores.js  —  ball (XP) saqlash va reyting
   QAYERGA: api/ papkasiga, nomi: scores.js

   POST /api/scores        -> foydalanuvchi ballini yozadi/yangilaydi
   GET  /api/scores?top=100&email=...  -> top ro'yxat + mening o'rnim

   Kerakli env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
============================================================ */

const { requireUser } = require('./_session');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = 'studyai_scores';

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
    const msg = (data && data.message) ? data.message : ('Supabase xatosi (' + r.status + ')');
    throw new Error(msg);
  }
  return data;
}

function int(v, min, max) {
  let x = Math.round(Number(v) || 0);
  if (x < min) x = min;
  if (x > max) x = max;
  return x;
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

    /* ---------- BALLNI SAQLASH ---------- */
    if (req.method === 'POST') {
      /* Ball yozish — faqat o'z hisobiga. Email sessiyadan olinadi. */
      const who = requireUser(req, res);
      if (!who) return;
      const b = readBody(req);
      const email = who.email;
      const row = {
        email: email,
        name: String(b.name || '').slice(0, 60),
        picture: String(b.picture || '').slice(0, 400),
        xp: int(b.xp, 0, 5000000),
        level: int(b.level, 1, 99),
        coins: int(b.coins, 0, 5000000),
        streak: int(b.streak, 0, 3650),
        tasks_done: int(b.tasks_done, 0, 500000),
        quizzes: int(b.quizzes, 0, 500000),
        updated_at: new Date().toISOString()
      };
      // on_conflict=email -> mavjud qator YANGILANADI.
      // Diqqat: bu yerda avatar/bio/username/club yozilmaydi, shuning uchun
      // ular o'chib ketmaydi — faqat sanab o'tilgan ustunlar yangilanadi.
      await sb(TABLE + '?on_conflict=email', {
        method: 'POST',
        body: JSON.stringify(row),
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
      });
      return res.status(200).json({ ok: true });
    }

    /* ---------- REYTINGNI O'QISH ---------- */
    const query = req.query || {};

    /* Username bo'yicha qidiruv (email hech qachon qaytarilmaydi) */
    if (query.q) {
      const term = String(query.q).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (term.length < 2) return res.status(200).json({ list: [] });
      const found = await sb(TABLE +
        '?select=username,name,picture,avatar,bio,xp,level&username=ilike.' + encodeURIComponent('%' + term + '%') +
        '&order=xp.desc&limit=15');
      return res.status(200).json({
        list: (found || []).filter(u => u.username).map(u => ({
          username: u.username, name: u.name || '',
          picture: u.avatar || u.picture || '',
          bio: u.bio || '',
          xp: u.xp || 0, level: u.level || 1
        }))
      });
    }

    const top = Math.min(parseInt(query.top, 10) || 50, 200);
    const meEmail = String(query.email || '').trim().toLowerCase();

    // Reyting uchun eng ko'pi bilan 500 ta qator (hozircha yetarli)
    const all = await sb(TABLE +
      '?select=email,name,picture,avatar,bio,username,xp,level,coins,streak,club,club_role&order=xp.desc,updated_at.asc&limit=500');

    const rows = Array.isArray(all) ? all : [];
    let rank = null;
    let me = null;

    const list = rows.slice(0, top).map((u, i) => {
      const mine = meEmail && String(u.email || '').toLowerCase() === meEmail;
      if (mine) { rank = i + 1; me = { xp: u.xp, level: u.level, coins: u.coins, club: u.club || null, username: u.username || '', bio: u.bio || '', avatar: u.avatar || u.picture || '', role: u.club_role || null }; }
      return {
        name: u.name || '',
        picture: u.avatar || u.picture || '',
        bio: u.bio || '',
        username: u.username || '',
        xp: u.xp || 0,
        level: u.level || 1,
        coins: u.coins || 0,
        streak: u.streak || 0,
        club: u.club || null,
        me: !!mine
      };
    });

    // Agar top ro'yxatga tushmagan bo'lsa, o'z o'rnini alohida hisoblaymiz
    if (meEmail && !me) {
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i].email || '').toLowerCase() === meEmail) {
          rank = i + 1;
          me = { xp: rows[i].xp, level: rows[i].level, coins: rows[i].coins, club: rows[i].club || null, username: rows[i].username || '', bio: rows[i].bio || '', avatar: rows[i].avatar || rows[i].picture || '', role: rows[i].club_role || null };
          break;
        }
      }
    }

    return res.status(200).json({ total: rows.length, rank: rank, me: me, list: list });

  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
