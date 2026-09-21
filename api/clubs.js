/* ============================================================
   /api/clubs.js  —  klublar + LAVOZIMLAR (rollar) tizimi
   QAYERGA: repodagi  api/clubs.js  faylini SHU fayl bilan almashtiring.

   GET  /api/clubs?view=top                 -> klublar reytingi
   GET  /api/clubs?view=my&email=...        -> mening klubim + a'zolar + rollar
   POST /api/clubs
        {action:'create', email, name, clubName}
        {action:'join',   email, name, code}
        {action:'leave',  email}
        {action:'purge',  email}                 -> hisobni butunlay o'chirish
        {action:'setrole',email, target, role}   -> faqat PRINCIPAL qila oladi

   LAVOZIM QOIDALARI (server hal qiladi, brauzerga ishonmaymiz):
   1. Klubni ochgan odam — avtomatik principal (direktor).
   2. Bitta klubda faqat BITTA principal bo'ladi. Agar principal
      boshqa odamni principal qilsa, o'zi head_teacher'ga tushadi.
   3. Principal klubdan chiqsa — eng katta lavozimli a'zo (bir xil
      bo'lsa — XP'si ko'pi) avtomatik principal bo'ladi.
   4. Klubda odam qolmasa — klub o'chib ketadi.

   Kerakli env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
============================================================ */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLUBS = 'studyai_clubs';
const SCORES = 'studyai_scores';

/* Lavozim narvoni. Raqam qancha katta bo'lsa — lavozim shuncha baland. */
const ROLES = {
  student: 1,          // O'quvchi
  scholar: 2,          // Talaba
  genius: 3,           // Genius
  teacher: 4,          // O'qituvchi
  head_teacher: 5,     // Katta o'qituvchi
  vice_principal: 6,   // Direktor o'rinbosari
  principal: 7         // Direktor (klub prezidenti)
};
const DEFAULT_ROLE = 'student';

function rankOf(role) { return ROLES[role] || 1; }
function validRole(role) { return Object.prototype.hasOwnProperty.call(ROLES, role); }

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
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // O/0 va I/1 chalkashmasligi uchun olib tashlangan
  let s = '';
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

const enc = encodeURIComponent;

/* Bitta odamning klub va rolini yozish */
async function setUserClub(email, name, club, role) {
  const row = {
    email: email,
    club: club,
    club_role: club ? (role || DEFAULT_ROLE) : null,
    updated_at: new Date().toISOString()
  };
  const clean = String(name || '').trim().slice(0, 60);
  if (clean) row.name = clean;   // ism bo'sh bo'lsa — eskisini o'chirmaymiz

  await sb(SCORES + '?on_conflict=email', {
    method: 'POST',
    body: JSON.stringify(row),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
  });
}

async function membersOf(code) {
  return (await sb(SCORES +
    '?select=email,name,username,avatar,picture,bio,xp,streak,level,club_role' +
    '&club=eq.' + enc(code) + '&order=xp.desc&limit=300')) || [];
}

/* Klubning sog'lig'ini tekshirish:
   - principal yo'q bo'lsa -> eng kattasini ko'taramiz
   - principal 2 ta bo'lsa -> ortiqchasini head_teacher'ga tushiramiz
   - a'zo qolmasa        -> klubni o'chiramiz                     */
async function normalizeClub(code) {
  const list = await membersOf(code);

  if (!list.length) {
    await sb(CLUBS + '?code=eq.' + enc(code), { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
      .catch(function () { });
    return { deleted: true };
  }

  const principals = list.filter(m => m.club_role === 'principal');

  if (principals.length > 1) {
    // Eng kuchlisini (XP) qoldiramiz, qolganlari head_teacher
    principals.sort((a, b) => (b.xp || 0) - (a.xp || 0));
    for (let i = 1; i < principals.length; i++) {
      await sb(SCORES + '?email=eq.' + enc(principals[i].email), {
        method: 'PATCH', body: JSON.stringify({ club_role: 'head_teacher' }),
        headers: { Prefer: 'return=minimal' }
      });
    }
    return { fixed: true };
  }

  if (principals.length === 0) {
    // Voris: avval lavozim, keyin XP bo'yicha
    const heir = list.slice().sort((a, b) => {
      const d = rankOf(b.club_role) - rankOf(a.club_role);
      return d !== 0 ? d : (b.xp || 0) - (a.xp || 0);
    })[0];
    await sb(SCORES + '?email=eq.' + enc(heir.email), {
      method: 'PATCH', body: JSON.stringify({ club_role: 'principal' }),
      headers: { Prefer: 'return=minimal' }
    });
    return { promoted: heir.email };
  }

  return { ok: true };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!SB_URL || !SB_KEY) throw new Error('SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY sozlanmagan');

    /* ============================================================
       POST
       ============================================================ */
    if (req.method === 'POST') {
      const b = readBody(req);
      const email = String(b.email || '').trim().toLowerCase();
      const action = String(b.action || '');
      if (!email || email.indexOf('@') < 0) {
        return res.status(400).json({ error: { message: 'email kerak' } });
      }

      /* ---------- KLUB TUZISH ---------- */
      if (action === 'create') {
        const clubName = String(b.clubName || '').trim().slice(0, 40);
        if (!clubName) return res.status(400).json({ error: { message: 'Klub nomi kerak' } });

        const meRows = await sb(SCORES + '?select=club&email=eq.' + enc(email));
        const oldClub = meRows && meRows[0] && meRows[0].club;

        let code = '';
        for (let i = 0; i < 6; i++) {
          const c = makeCode();
          const exists = await sb(CLUBS + '?select=code&code=eq.' + c);
          if (!exists || !exists.length) { code = c; break; }
        }
        if (!code) throw new Error('Kod yaratib bo\'lmadi, qayta urinib ko\'ring');

        await sb(CLUBS, {
          method: 'POST',
          body: JSON.stringify({
            code: code, name: clubName, owner_email: email,
            about: String(b.about || '').slice(0, 200)
          }),
          headers: { Prefer: 'return=minimal' }
        });

        // Klub ochgan odam — principal
        await setUserClub(email, b.name, code, 'principal');
        if (oldClub && oldClub !== code) await normalizeClub(oldClub);

        return res.status(200).json({ ok: true, code: code, name: clubName, role: 'principal' });
      }

      /* ---------- KLUBGA QO'SHILISH ---------- */
      if (action === 'join') {
        const code = String(b.code || '').trim().toUpperCase().slice(0, 10);
        if (!code) return res.status(400).json({ error: { message: 'Kod kerak' } });

        const found = await sb(CLUBS + '?select=code,name&code=eq.' + enc(code));
        if (!found || !found.length) {
          return res.status(404).json({ error: { message: 'Bunday kodli klub topilmadi' } });
        }

        const meRows = await sb(SCORES + '?select=club&email=eq.' + enc(email));
        const oldClub = meRows && meRows[0] && meRows[0].club;
        if (oldClub === code) {
          return res.status(200).json({ ok: true, code: code, name: found[0].name, already: true });
        }

        await setUserClub(email, b.name, code, DEFAULT_ROLE);
        if (oldClub) await normalizeClub(oldClub);   // eski klub direktorsiz qolmasin

        return res.status(200).json({ ok: true, code: code, name: found[0].name, role: DEFAULT_ROLE });
      }

      /* ---------- KLUBDAN CHIQISH ---------- */
      if (action === 'leave') {
        const meRows = await sb(SCORES + '?select=club&email=eq.' + enc(email));
        const code = meRows && meRows[0] && meRows[0].club;

        await sb(SCORES + '?email=eq.' + enc(email), {
          method: 'PATCH',
          body: JSON.stringify({ club: null, club_role: null }),
          headers: { Prefer: 'return=minimal' }
        });

        let after = null;
        if (code) after = await normalizeClub(code);   // voris tayinlanadi yoki klub o'chadi
        return res.status(200).json({ ok: true, club: after });
      }

      /* ---------- HISOBNI BUTUNLAY O'CHIRISH ---------- */
      if (action === 'purge') {
        const quiet = { Prefer: 'return=minimal' };
        const meRows = await sb(SCORES + '?select=club&email=eq.' + enc(email));
        const code = meRows && meRows[0] && meRows[0].club;

        await sb('studyai_club_messages?email=eq.' + enc(email), { method: 'DELETE', headers: quiet }).catch(() => { });
        await sb('studyai_messages?from_email=eq.' + enc(email), { method: 'DELETE', headers: quiet }).catch(() => { });
        await sb('studyai_messages?to_email=eq.' + enc(email), { method: 'DELETE', headers: quiet }).catch(() => { });
        await sb(SCORES + '?email=eq.' + enc(email), { method: 'DELETE', headers: quiet }).catch(() => { });

        if (code) await normalizeClub(code);
        return res.status(200).json({ ok: true, purged: true });
      }

      /* ---------- LAVOZIM BERISH (faqat principal) ---------- */
      if (action === 'setrole') {
        const targetUser = String(b.target || '').trim().toLowerCase(); // username
        const role = String(b.role || '').trim();
        if (!targetUser) return res.status(400).json({ error: { message: 'Kimga? (username)' } });
        if (!validRole(role)) return res.status(400).json({ error: { message: 'Noma\'lum lavozim' } });

        const meRows = await sb(SCORES + '?select=email,club,club_role&email=eq.' + enc(email));
        const me = meRows && meRows[0];
        if (!me || !me.club) return res.status(403).json({ error: { message: 'Siz klubda emassiz' } });
        if (me.club_role !== 'principal') {
          return res.status(403).json({ error: { message: 'Faqat Principal lavozim bera oladi' } });
        }

        const tRows = await sb(SCORES + '?select=email,club,club_role,username&username=eq.' + enc(targetUser));
        const t = tRows && tRows[0];
        if (!t) return res.status(404).json({ error: { message: 'Bunday a\'zo topilmadi' } });
        if (t.club !== me.club) return res.status(400).json({ error: { message: 'Bu odam sizning klubingizda emas' } });
        if (t.email === me.email) return res.status(400).json({ error: { message: 'O\'zingizga lavozim bera olmaysiz' } });

        await sb(SCORES + '?email=eq.' + enc(t.email), {
          method: 'PATCH', body: JSON.stringify({ club_role: role }),
          headers: { Prefer: 'return=minimal' }
        });

        /* Principal boshqasiga berildi -> eski principal head_teacher bo'ladi.
           (Foydalanuvchi qoidasi: klubda 2 ta principal bo'lolmaydi.) */
        let handedOver = false;
        if (role === 'principal') {
          await sb(SCORES + '?email=eq.' + enc(me.email), {
            method: 'PATCH', body: JSON.stringify({ club_role: 'head_teacher' }),
            headers: { Prefer: 'return=minimal' }
          });
          handedOver = true;
        }

        await normalizeClub(me.club);
        return res.status(200).json({ ok: true, role: role, handedOver: handedOver });
      }

      return res.status(400).json({ error: { message: 'Noma\'lum action' } });
    }

    /* ============================================================
       GET
       ============================================================ */
    const query = req.query || {};
    const view = String(query.view || 'top');

    /* ---------- MENING KLUBIM ---------- */
    if (view === 'my') {
      const email = String(query.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ error: { message: 'email kerak' } });

      const mine = await sb(SCORES + '?select=club&email=eq.' + enc(email));
      const code = (mine && mine[0] && mine[0].club) ? mine[0].club : null;
      if (!code) return res.status(200).json({ club: null, members: [] });

      const club = await sb(CLUBS + '?select=code,name,about,owner_email,created_at&code=eq.' + enc(code));
      if (!club || !club.length) {
        // Klub o'chib ketgan — a'zolikni tozalaymiz
        await sb(SCORES + '?email=eq.' + enc(email), {
          method: 'PATCH', body: JSON.stringify({ club: null, club_role: null }),
          headers: { Prefer: 'return=minimal' }
        }).catch(() => { });
        return res.status(200).json({ club: null, members: [] });
      }

      await normalizeClub(code);
      const members = await membersOf(code);

      const mapped = members
        .map(m => ({
          name: m.name || '',
          username: m.username || '',
          avatar: m.avatar || m.picture || '',
          bio: m.bio || '',
          xp: m.xp || 0,
          level: m.level || 1,
          streak: m.streak || 0,
          role: m.club_role || DEFAULT_ROLE,
          rank: rankOf(m.club_role),
          me: String(m.email || '').toLowerCase() === email
        }))
        .sort((a, b) => (b.rank - a.rank) || (b.xp - a.xp));

      const meRow = mapped.filter(m => m.me)[0] || null;

      return res.status(200).json({
        club: {
          code: club[0].code, name: club[0].name,
          about: club[0].about || '', created_at: club[0].created_at || null
        },
        myRole: meRow ? meRow.role : null,
        members: mapped
      });
    }

    /* ---------- KLUBLAR REYTINGI ---------- */
    const clubs = await sb(CLUBS + '?select=code,name,about&limit=500');
    const scored = await sb(SCORES +
      '?select=club,xp,name,username,club_role&club=not.is.null&limit=5000');

    const agg = {};
    (scored || []).forEach(r => {
      const c = r.club;
      if (!c) return;
      if (!agg[c]) agg[c] = { xp: 0, members: 0, principal: '' };
      agg[c].xp += (r.xp || 0);
      agg[c].members += 1;
      if (r.club_role === 'principal') agg[c].principal = r.name || r.username || '';
    });

    const list = (clubs || []).map(c => {
      const a = agg[c.code] || { xp: 0, members: 0, principal: '' };
      return {
        code: c.code,
        name: c.name,
        about: c.about || '',
        principal: a.principal,
        xp: a.xp,
        members: a.members,
        avg: a.members ? Math.round(a.xp / a.members) : 0
      };
    }).sort((x, y) => y.xp - x.xp);

    return res.status(200).json({ clubs: list, roles: ROLES });

  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
