/* ============================================================
   /api/_ratelimit.js — sodda tezlik cheklovchi (rate limiter)
   QAYERGA: api/ papkasiga, nomi: _ratelimit.js

   Nima uchun: bitta odam soniyasiga 500 ta xabar yuborib,
   bazani to'ldirib tashlamasligi uchun.

   HALOL OGOHLANTIRISH (intervyuda aytsangiz — plus ball):
   Bu hisoblagich serverless funksiyaning XOTIRASIDA turadi.
   Vercel bir vaqtda bir nechta nusxa ishga tushirishi mumkin,
   shuning uchun bu cheklov "taxminiy" — u oddiy suiiste'molni
   to'xtatadi, lekin uyushgan hujumni emas.
   To'liq yechim: Upstash Redis (loyihada allaqachon bor) yoki
   Vercel Firewall orqali markazlashgan hisoblagich.
============================================================ */

const buckets = new Map();
const MAX_KEYS = 5000;   // xotira cheksiz o'smasligi uchun

/**
 * @param {string} key    kim (email yoki IP) + qaysi amal
 * @param {number} limit  oynada nechta so'rovga ruxsat
 * @param {number} windowMs oyna uzunligi (millisekund)
 * @returns {{ok:boolean, retryAfter:number}}
 */
function hit(key, limit, windowMs) {
  const now = Date.now();

  if (buckets.size > MAX_KEYS) buckets.clear();   // sodda tozalash

  let b = buckets.get(key);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;

  if (b.count > limit) {
    return { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Cheklovdan o'tmasa javobni o'zi yuboradi va false qaytaradi */
function guard(res, key, limit, windowMs) {
  const r = hit(key, limit, windowMs);
  if (!r.ok) {
    res.setHeader('Retry-After', String(r.retryAfter));
    res.status(429).json({
      error: {
        message: 'Juda tez yuboryapsiz. ' + r.retryAfter + ' soniyadan keyin urinib ko\'ring.',
        code: 'RATE_LIMIT'
      }
    });
    return false;
  }
  return true;
}

module.exports = { hit, guard };
