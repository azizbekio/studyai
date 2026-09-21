/* ============================================================
   /api/username.js  —  foydalanuvchi nomi (username)
   QAYERGA: repodagi  api/username.js  ni SHU fayl bilan almashtiring.

   GET  /api/username?check=aziz01        -> {available:true/false, reason:'...'}
   POST /api/username {email, username}   -> saqlaydi

   QOIDA: 3-20 belgi, FAQAT kichik lotin harf, raqam va pastki chiziq (_),
          birinchi belgi — harf.

   NEGA faqat kichik harf?
   "Azizbek" va "azizbek" ikki xil odam bo'lib ko'rinsa, odamlar
   bir-birini chalkashtiradi (bu — "homograph" muammosi). Shuning uchun
   Instagram, GitHub, Telegram ham username'ni kichik harfga keltiradi.
   Biz esa jim kichraytirmaymiz — foydalanuvchiga OCHIQ aytamiz.
   Ism (masalan "Azizbek") esa alohida "name" maydonida katta harf
   bilan saqlanadi va profilda aynan shu ko'rinadi.

   Kerakli env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
============================================================ */

const { requireUser, readSession } = require('./_session');
const { guard } = require('./_ratelimit');

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
    const dup = /duplicate key|already exists|unique/i.test(raw);
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

/* Xatoni ANIQ nomlab qaytaramiz — brauzer to'g'ri xabar ko'rsata olsin */
function describe(raw) {
  if (!raw) return 'empty';
  if (/[A-Z]/.test(raw)) return 'uppercase';
  if (/[^a-z0-9_]/.test(raw)) return 'charset';
  if (raw.length < 3) return 'short';
  if (raw.length > 20) return 'long';
  if (!/^[a-z]/.test(raw)) return 'start';
  return 'format';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!SB_URL || !SB_KEY) throw new Error('SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY sozlanmagan');

    /* ---------- BAND/BO'SH TEKSHIRUVI ---------- */
    if (req.method === 'GET') {
      const raw = String((req.query || {}).check || '').trim();
      if (!RULE.test(raw)) {
        return res.status(200).json({ available: false, reason: describe(raw) });
      }
      // lower(username) bo'yicha unique indeks bor, lekin qidiruvni ham
      // katta/kichik harfga befarq (ilike) qilamiz.
      const found = await sb(TABLE + '?select=email&username=ilike.' + encodeURIComponent(raw));
      const taken = !!(found && found.length);

      /* MUHIM: agar bu nom AYNAN SHU odamniki bo'lsa, "band" demaymiz.
         Ilgari shu sabab odam chiqib kirganda o'z username'ini
         qayta ola olmay qolardi. */
      const who = readSession(req);
      const mine = taken && who && String(found[0].email).toLowerCase() === who.email;
      return res.status(200).json({ available: !taken || !!mine, mine: !!mine, reason: mine ? 'mine' : 'ok' });
    }

    /* ---------- SAQLASH ---------- */
    if (req.method === 'POST') {
      const who = requireUser(req, res);
      if (!who) return;
      /* Username'ni cheksiz almashtirib, boshqalarnikini "band qilib" yurmasin */
      if (!guard(res, 'uname:' + who.email, 8, 300000)) return;
      const b = readBody(req);
      const email = who.email;
      const raw = String(b.username || '').trim();
      if (!RULE.test(raw)) {
        const why = describe(raw);
        const msg = why === 'uppercase'
          ? 'Username faqat KICHIK harflardan iborat bo\'ladi. Masalan: azizbek_a'
          : 'Username 3-20 belgi, kichik lotin harfi bilan boshlanadi, faqat harf/raqam/_ bo\'lishi mumkin';
        return res.status(400).json({ error: { message: msg, reason: why } });
      }

      // Boshqa odam bu nomni olganmi?
      const taken = await sb(TABLE + '?select=email&username=ilike.' + encodeURIComponent(raw));
      if (taken && taken.length && String(taken[0].email).toLowerCase() !== email) {
        return res.status(409).json({ error: { message: 'Bu username band, boshqasini tanlang' } });
      }

      try {
        await sb(TABLE + '?on_conflict=email', {
          method: 'POST',
          body: JSON.stringify({ email: email, username: raw, updated_at: new Date().toISOString() }),
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
        });
      } catch (err) {
        if (err.dup) return res.status(409).json({ error: { message: 'Bu username band, boshqasini tanlang' } });
        throw err;
      }
      return res.status(200).json({ ok: true, username: raw });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
