/* ============================================================
   /api/clubs.js  —  klublar (guruh musobaqasi)
   QAYERGA: api/ papkasiga, nomi: clubs.js

   GET  /api/clubs?view=top                 -> klublar reytingi
   GET  /api/clubs?view=my&email=...        -> mening klubim + a'zolar
   POST /api/clubs  {action:'create'|'join'|'leave', ...}

   Kerakli env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
============================================================ */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLUBS = 'studyai_clubs';
const SCORES = 'studyai_scores';

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

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return req.body;
}

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // o'xshash harflar (O/0, I/1) olib tashlangan
  let s = '';
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

async function setUserClub(email, name, club) {
  const row = { email: email, club: club, updated_at: new Date().toISOString() };
  // Ismni faqat bo'sh bo'lmasa yozamiz (aks holda eski ismni o'chirib yuboradi)
  const clean = String(name || '').trim().slice(0, 60);
  if (clean) row.name = clean;

  // on_conflict=email — mavjud qatorni YANGILAYDI (username, xp va h.k. joyida qoladi)
  await sb(SCORES + '?on_conflict=email', {
    method: 'POST',
    body: JSON.stringify(row),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!SB_URL || !SB_KEY) throw new Error('SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY sozlanmagan');

    /* =============== POST =============== */
    if (req.method === 'POST') {
      const b = readBody(req);
      const email = String(b.email || '').trim().toLowerCase();
      const action = String(b.action || '');
      if (!email || email.indexOf('@') < 0) {
        return res.status(400).json({ error: { message: 'email kerak' } });
      }

      if (action === 'create') {
        const clubName = String(b.clubName || '').trim().slice(0, 40);
        if (!clubName) return res.status(400).json({ error: { message: 'Klub nomi kerak' } });

        let code = '';
        for (let i = 0; i < 6; i++) {
          const c = makeCode();
          const exists = await sb(CLUBS + '?select=code&code=eq.' + c);
          if (!exists || !exists.length) { code = c; break; }
        }
        if (!code) throw new Error('Kod yaratib bo\'lmadi, qayta urinib ko\'ring');

        await sb(CLUBS, {
          method: 'POST',
          body: JSON.stringify({ code: code, name: clubName, owner_email: email }),
          headers: { Prefer: 'return=minimal' }
        });
        await setUserClub(email, b.name, code);
        return res.status(200).json({ ok: true, code: code, name: clubName });
      }

      if (action === 'join') {
        const code = String(b.code || '').trim().toUpperCase().slice(0, 10);
        if (!code) return res.status(400).json({ error: { message: 'Kod kerak' } });
        const found = await sb(CLUBS + '?select=code,name&code=eq.' + encodeURIComponent(code));
        if (!found || !found.length) {
          return res.status(404).json({ error: { message: 'Bunday kodli klub topilmadi' } });
        }
        await setUserClub(email, b.name, code);
        return res.status(200).json({ ok: true, code: code, name: found[0].name });
      }

      if (action === 'leave') {
        // Shartsiz bajariladi: brauzerda klub esda qolmagan bo'lsa ham
        // odam klubda "arvoh a'zo" bo'lib qolmaydi.
        await sb(SCORES + '?email=eq.' + encodeURIComponent(email), {
          method: 'PATCH',
          body: JSON.stringify({ club: null }),
          headers: { Prefer: 'return=minimal' }
        });
        return res.status(200).json({ ok: true });
      }

      /* ---- HISOBNI BUTUNLAY O'CHIRISH ----
         1) klubdan chiqaradi  2) klub chatidagi xabarlarini o'chiradi
         3) shaxsiy xabarlarini o'chiradi  4) ball/username qatorini o'chiradi.
         Shundan keyin qayta ro'yxatdan o'tsa — mutlaqo toza boshlaydi. */
      if (action === 'purge') {
        const enc = encodeURIComponent(email);
        const quiet = { Prefer: 'return=minimal' };

        await sb(SCORES + '?email=eq.' + enc, {
          method: 'PATCH', body: JSON.stringify({ club: null }), headers: quiet
        }).catch(function () {});

        await sb('studyai_club_messages?email=eq.' + enc, { method: 'DELETE', headers: quiet })
          .catch(function () {});
        await sb('studyai_messages?from_email=eq.' + enc, { method: 'DELETE', headers: quiet })
          .catch(function () {});
        await sb('studyai_messages?to_email=eq.' + enc, { method: 'DELETE', headers: quiet })
          .catch(function () {});
        await sb(SCORES + '?email=eq.' + enc, { method: 'DELETE', headers: quiet })
          .catch(function () {});

        return res.status(200).json({ ok: true, purged: true });
      }

      return res.status(400).json({ error: { message: 'Noma\'lum action' } });
    }

    /* =============== GET =============== */
    const query = req.query || {};
    const view = String(query.view || 'top');

    if (view === 'my') {
      const email = String(query.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ error: { message: 'email kerak' } });

      const mine = await sb(SCORES + '?select=club&email=eq.' + encodeURIComponent(email));
      const code = (mine && mine[0] && mine[0].club) ? mine[0].club : null;
      if (!code) return res.status(200).json({ club: null, members: [] });

      const club = await sb(CLUBS + '?select=code,name&code=eq.' + encodeURIComponent(code));
      if (!club || !club.length) return res.status(200).json({ club: null, members: [] });

      const members = await sb(SCORES +
        '?select=email,name,username,xp,streak&club=eq.' + encodeURIComponent(code) + '&order=xp.desc&limit=200');

      return res.status(200).json({
        club: { code: club[0].code, name: club[0].name },
        members: (members || []).map(m => ({
          name: m.name || '',
          username: m.username || '',
          xp: m.xp || 0,
          streak: m.streak || 0,
          me: String(m.email || '').toLowerCase() === email
        }))
      });
    }

    // view=top — barcha klublar reytingi
    const clubs = await sb(CLUBS + '?select=code,name&limit=500');
    const scored = await sb(SCORES + '?select=club,xp&club=not.is.null&limit=5000');

    const agg = {};
    (scored || []).forEach(r => {
      const c = r.club;
      if (!c) return;
      if (!agg[c]) agg[c] = { xp: 0, members: 0 };
      agg[c].xp += (r.xp || 0);
      agg[c].members += 1;
    });

    const list = (clubs || []).map(c => {
      const a = agg[c.code] || { xp: 0, members: 0 };
      return {
        code: c.code,
        name: c.name,
        xp: a.xp,
        members: a.members,
        avg: a.members ? Math.round(a.xp / a.members) : 0
      };
    }).sort((x, y) => y.xp - x.xp);

    return res.status(200).json({ clubs: list });

  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
