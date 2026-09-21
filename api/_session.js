/* ============================================================
   /api/_session.js — IMZOLANGAN SESSIYA (session token)
   QAYERGA: api/ papkasiga, nomi: _session.js
   (pastki chiziq bilan boshlangani uchun Vercel uni alohida
    sahifa/endpoint deb hisoblamaydi — bu shunchaki yordamchi modul)

   MUAMMO: ilgari brauzer serverga "men azizbek@gmail.com man" deb
   yozardi va server shunga ishonardi. Ya'ni har kim boshqa odamning
   email'ini yozib, uning ballini o'zgartira olardi.

   YECHIM: kirishda server Google token'ni tekshiradi va O'ZI
   imzolagan kichik "chipta" (session) beradi. Keyingi har bir
   so'rovda brauzer shu chiptani yuboradi. Server imzoni qaytadan
   hisoblab ko'radi — agar bitta harf ham o'zgartirilgan bo'lsa,
   imzo mos kelmaydi va so'rov rad etiladi.

   Bu — JWT'ning (JSON Web Token) soddalashtirilgan, kutubxonasiz
   ko'rinishi: payload.signature, HMAC-SHA256 bilan imzolangan.
============================================================ */

const crypto = require('crypto');

const DAYS = 30;

/* Maxfiy kalit. SESSION_SECRET qo'yilmagan bo'lsa, allaqachon mavjud
   bo'lgan Supabase service kalitidan hosil qilamiz — sayt to'xtab
   qolmasligi uchun. Ishlab chiqarishda alohida SESSION_SECRET qo'ying. */
function secret() {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!s) throw new Error('SESSION_SECRET sozlanmagan');
  return crypto.createHash('sha256').update('studyai:' + s).digest();
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  str = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function hmac(data) {
  return b64url(crypto.createHmac('sha256', secret()).update(data).digest());
}

/* Chipta yaratish */
function createSession(user) {
  const payload = {
    e: String(user.email || '').toLowerCase(),
    n: String(user.name || '').slice(0, 60),
    p: String(user.picture || '').slice(0, 300),
    iat: Date.now(),
    exp: Date.now() + DAYS * 24 * 3600 * 1000
  };
  const body = b64url(JSON.stringify(payload));
  return body + '.' + hmac(body);
}

/* Chiptani tekshirish. To'g'ri bo'lsa — foydalanuvchi, aks holda null. */
function verifySession(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const expected = hmac(parts[0]);
    /* timingSafeEqual — imzoni belgima-belgi solishtirishda
       vaqt farqidan foydalanib kalitni topishning oldini oladi
       (timing attack). Oddiy === bilan solishtirish xavfliroq. */
    const a = Buffer.from(parts[1]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(unb64url(parts[0]).toString('utf8'));
    if (!payload || !payload.e) return null;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return { email: payload.e, name: payload.n || '', picture: payload.p || '' };
  } catch (e) {
    return null;
  }
}

/* So'rovdan chiptani topish: header, body yoki query */
function readSession(req) {
  let token = '';
  try {
    token = (req.headers && (req.headers['x-session'] || req.headers['X-Session'])) || '';
    if (!token && req.query && req.query.session) token = req.query.session;
    if (!token && req.body) {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
      if (b && b.session) token = b.session;
    }
  } catch (e) { }
  return verifySession(token);
}

/* Qulay yordamchi: sessiya bo'lmasa 401 qaytaradi va null beradi */
function requireUser(req, res) {
  const u = readSession(req);
  if (!u) {
    res.status(401).json({
      error: { message: 'Sessiya tugagan yoki yo\'q. Iltimos, qaytadan kiring.', code: 'NO_SESSION' }
    });
    return null;
  }
  return u;
}

module.exports = { createSession, verifySession, readSession, requireUser };
