import express from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { DATABASE_URL, ADMIN_PASSWORD = '', PORT = 3000, PUBLIC_URL = '' } = process.env;
// Email alert for each new pledge, sent like a website contact form through FormSubmit (free, no sign-up).
// Optional: set RESEND_API_KEY to use Resend instead.
const {
  NOTIFY_EMAIL = '', FORMSUBMIT_ALIAS = '', ADMIN_URL = '',
  FORMSUBMIT_URL = 'https://formsubmit.co/ajax/',
  RESEND_API_KEY = '', RESEND_API_URL = 'https://api.resend.com/emails',
  NOTIFY_FROM: NOTIFY_FROM_RAW = '',
} = process.env;
const NOTIFY_FROM = NOTIFY_FROM_RAW || 'Musikana Foundation <onboarding@resend.dev>';
// FormSubmit expects requests from a website; Render sets RENDER_EXTERNAL_URL to this site's address
const SITE_URL = process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || PUBLIC_URL || 'http://localhost';
// APP_MODE decides which site this server runs:
//   public = the donor wish list only (no admin page or admin API at all)
//   admin  = the admin dashboard only, on its own address
//   all    = both together (handy for local testing)
const APP_MODE = ['public', 'admin', 'all'].includes(process.env.APP_MODE) ? process.env.APP_MODE : 'all';
const SERVE_PUBLIC = APP_MODE !== 'admin', SERVE_ADMIN = APP_MODE !== 'public';
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add your Neon connection string.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.use(express.json({ limit: '20kb' }));
const ADMIN_FILES = new Set(['/admin', '/admin.html', '/admin.js']);
const PUBLIC_FILES = new Set(['/index.html', '/registry.js']);
app.use((req, res, next) => {
  if (!SERVE_ADMIN && ADMIN_FILES.has(req.path)) return res.status(404).send('Not found');
  if (!SERVE_PUBLIC && PUBLIC_FILES.has(req.path)) return res.status(404).send('Not found');
  if (APP_MODE === 'admin') res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
// The 6 website files live in public/ — or at the top level if they were uploaded flat.
// Only these files are ever sent to visitors, so server code and settings stay hidden.
const WEB_DIR = fs.existsSync(path.join(__dirname, 'public', 'index.html')) ? path.join(__dirname, 'public') : __dirname;
const WEB_FILES = new Set(['index.html', 'admin.html', 'styles.css', 'common.js', 'registry.js', 'admin.js']);
const sendWeb = (file) => (req, res) => res.sendFile(path.join(WEB_DIR, file));
app.get('/', sendWeb(APP_MODE === 'admin' ? 'admin.html' : 'index.html'));
app.get('/admin', sendWeb('admin.html'));
app.get('/:file', (req, res, next) => (WEB_FILES.has(req.params.file) ? res.sendFile(path.join(WEB_DIR, req.params.file)) : next()));

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const toInt = (v) => Number.parseInt(v, 10);

const ITEMS_SQL = `
  SELECT i.id, i.name, i.unit, i.qty, i.received, i.sort, i.size::float AS size, i.measure,
         COALESCE(SUM(p.qty) FILTER (WHERE p.status <> 'cancelled'), 0)::int AS pledged,
         COALESCE(SUM(p.qty) FILTER (WHERE p.status = 'received'), 0)::int AS "receivedPledged"
  FROM items i LEFT JOIN pledges p ON p.item_id = i.id
  GROUP BY i.id ORDER BY i.sort, i.id`;

async function getSettings() {
  const { rows } = await pool.query(
    'SELECT home, intro, visit_date AS "visitDate", dropoff, deadline, whatsapp, cash, end_date AS "endDate" FROM settings WHERE id = 1'
  );
  return rows[0];
}

/* ---------- Email alert for each new pledge ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function pledgeLine(it) {
  if (it.measure === 'choice') return `${it.name} (any amount)`;
  const extra = it.measure === 'kg' || it.measure === 'L' ? ` (${Math.round(it.qty * it.size * 10) / 10} ${it.measure})` : '';
  return `${it.name} × ${it.qty}${extra}`;
}
let warnedNoEmail = false;
async function postJson(url, body, headers) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 300)}`);
  return text;
}
async function notifyPledge({ ref, name, phone, email, items }) {
  const to = FORMSUBMIT_ALIAS || NOTIFY_EMAIL;
  if (!to && !RESEND_API_KEY) {
    if (!warnedNoEmail) { console.log('Pledge email alerts are off (set NOTIFY_EMAIL to turn them on).'); warnedNoEmail = true; }
    return;
  }
  const lines = items.map(pledgeLine);
  const contact = [phone, email].filter(Boolean).join(' · ');
  const subject = `New pledge: ${name} (Ref ${ref})`;
  try {
    if (RESEND_API_KEY) {
      const text = [`New pledge from ${name} (Ref ${ref})`, contact, '', ...lines.map((l) => '• ' + l), '', ADMIN_URL ? `Admin: ${ADMIN_URL}` : ''].join('\n');
      const html = `<div style="font-family:Arial,sans-serif;color:#3A4030;max-width:520px">
        <p style="font-size:12px;letter-spacing:.2em;color:#A2AE80;font-weight:bold;margin:0 0 8px">MUSIKANA FOUNDATION</p>
        <h2 style="margin:0 0 4px">New pledge from ${esc(name)}</h2>
        <p style="margin:0 0 14px;color:#66685A">Ref ${esc(ref)}${contact ? ' · ' + esc(contact) : ''}</p>
        <ul style="padding-left:18px;margin:0 0 16px">${lines.map((l) => `<li style="margin:4px 0">${esc(l)}</li>`).join('')}</ul>
        ${ADMIN_URL ? `<p><a href="${esc(ADMIN_URL)}">Open admin site</a></p>` : ''}</div>`;
      const body = { from: NOTIFY_FROM, to: [NOTIFY_EMAIL], subject, text, html };
      if (email) body.reply_to = email;
      await postJson(RESEND_API_URL, body, { Authorization: `Bearer ${RESEND_API_KEY}` });
      return;
    }
    // Contact-form style: FormSubmit emails these fields to you as a neat table
    const form = {
      _subject: subject, _template: 'table', _captcha: 'false',
      Name: name, Phone: phone || '–', Email: email || '–', Reference: ref,
      Pledged: lines.join('\n'),
    };
    if (ADMIN_URL) form['Admin site'] = ADMIN_URL;
    if (email) form._replyto = email; // hit Reply to answer the donor
    const reply = await postJson(FORMSUBMIT_URL + to.trim(), form, { Origin: SITE_URL, Referer: SITE_URL + '/' });
    if (/"success"\s*:\s*"?false/.test(reply)) console.error('Pledge email not sent yet:', reply.slice(0, 300));
  } catch (e) {
    console.error('Pledge email failed:', e.message);
  }
}

/* ---------- Simple rate limit for public pledges ---------- */
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now(), windowMs = 10 * 60 * 1000, max = 8;
  const list = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) return res.status(429).json({ error: 'Too many pledges from this device. Please try again later.' });
  list.push(now);
  hits.set(req.ip, list);
  next();
}
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();

/* ---------- Public API ---------- */
const pub = express.Router();
pub.get('/registry', wrap(async (req, res) => {
  const [settings, items, donors] = await Promise.all([
    getSettings(),
    pool.query(ITEMS_SQL),
    pool.query(`SELECT donor_name FROM pledges WHERE show_name AND status <> 'cancelled'
                GROUP BY donor_name ORDER BY MIN(created_at)`),
  ]);
  res.set('Cache-Control', 'no-store');
  res.json({
    settings,
    items: items.rows.map(({ sort, ...i }) => i),
    donors: donors.rows.map((r) => r.donor_name),
  });
}));

pub.post('/pledges', rateLimit, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true, ref: '', items: [] }); // honeypot: bots fill hidden field
  const name = clean(b.name, 60);
  const phone = clean(b.phone, 20);
  const email = clean(b.email, 120).toLowerCase();
  const showName = b.showName !== false;

  // Merge the selection into { itemId -> qty }
  const want = new Map();
  for (const x of Array.isArray(b.items) ? b.items : []) {
    const id = toInt(x?.itemId), q = toInt(x?.qty);
    if (!Number.isInteger(id) || !Number.isInteger(q) || q < 1 || q > 1000) return res.status(400).json({ error: 'Check the quantities you chose.' });
    want.set(id, (want.get(id) || 0) + q);
  }
  if (!want.size) return res.status(400).json({ error: 'Choose at least one item to pledge.' });
  if (want.size > 50) return res.status(400).json({ error: 'Too many items in one pledge.' });
  if (!name) return res.status(400).json({ error: 'Enter your name.' });
  if (!phone && !email) return res.status(400).json({ error: 'Give us a phone number or an email address so we can reach you.' });
  if (phone && !/^[0-9+\s-]{7,20}$/.test(phone)) return res.status(400).json({ error: 'Check the phone number.' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Check the email address.' });

  const ids = [...want.keys()].sort((a, c) => a - c);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the chosen items so they can't be deleted mid-pledge
    const items = await client.query('SELECT id, name, unit, qty, size::float AS size, measure FROM items WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [ids]);
    // Goals are targets, not limits: more than the goal is welcome. Only check the items still exist.
    if (items.rowCount !== ids.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'One of your items has been removed from the list. Please review your selection.' });
    }

    const ref = crypto.randomBytes(3).toString('hex').toUpperCase();
    for (const it of items.rows) {
      if (it.measure === 'choice') want.set(it.id, 1); // select-only items: no quantity
      await client.query(
        'INSERT INTO pledges (item_id, donor_name, phone, email, qty, show_name, ref) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [it.id, name, phone, email, want.get(it.id), showName, ref]);
    }
    await client.query('COMMIT');
    const saved = items.rows.map((it) => ({ name: it.name, unit: it.unit, size: it.size, measure: it.measure, qty: it.measure === 'choice' ? 1 : want.get(it.id) }));
    res.status(201).json({ ok: true, ref, items: saved });
    notifyPledge({ ref, name, phone, email, items: saved }); // after the pledge is saved; never blocks the donor
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}));

/* ---------- Admin API ---------- */
function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'ADMIN_PASSWORD is not set on the server.' });
  const given = crypto.createHash('sha256').update(req.get('x-admin-key') || '').digest();
  const want = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (!crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: 'Wrong password.' });
  next();
}
const admin = express.Router();
admin.use(requireAdmin);

admin.get('/data', wrap(async (req, res) => {
  const [settings, items, pledges] = await Promise.all([
    getSettings(),
    pool.query(ITEMS_SQL),
    pool.query(`SELECT p.id, p.item_id AS "itemId", i.name AS item, i.unit, i.size::float AS size, i.measure, p.donor_name AS name, p.phone, p.email, p.ref,
                       p.qty, p.show_name AS "showName", p.status, p.created_at AS "createdAt"
                FROM pledges p JOIN items i ON i.id = p.item_id ORDER BY p.created_at DESC`),
  ]);
  res.set('Cache-Control', 'no-store');
  res.json({ settings, items: items.rows, pledges: pledges.rows, publicUrl: PUBLIC_URL || (SERVE_PUBLIC ? '/' : '') });
}));

admin.put('/settings', wrap(async (req, res) => {
  const b = req.body || {};
  await pool.query(
    `UPDATE settings SET home=$1, intro=$2, visit_date=$3, dropoff=$4, deadline=$5, whatsapp=$6, cash=$7, end_date=$8 WHERE id = 1`,
    [clean(b.home, 120), clean(b.intro, 800), clean(b.visitDate, 80), clean(b.dropoff, 160),
     clean(b.deadline, 80), clean(b.whatsapp, 20), clean(b.cash, 800),
     /^\d{4}-\d{2}-\d{2}$/.test(String(b.endDate || '')) ? b.endDate : '']);
  res.json({ ok: true });
}));

function itemBody(b) {
  const name = clean(b.name, 80), unit = clean(b.unit, 40) || 'each';
  const qty = toInt(b.qty), received = toInt(b.received ?? 0);
  const measure = ['kg', 'L', 'pack', 'unit', 'choice'].includes(b.measure) ? b.measure : 'unit';
  const size = measure === 'kg' || measure === 'L' ? Number(b.size) : 1;
  if (!name) return { error: 'Item name is required.' };
  if (!Number.isInteger(qty) || qty < 0) return { error: 'Target must be 0 or more.' };
  if (!Number.isInteger(received) || received < 0) return { error: 'Extra received must be 0 or more.' };
  if (!Number.isFinite(size) || size <= 0 || size > 1000) return { error: 'Size per unit must be more than 0.' };
  if (measure === 'choice') return { name, unit, qty: 0, received, size: 1, measure };
  return { name, unit, qty, received, size, measure };
}
admin.post('/items', wrap(async (req, res) => {
  const v = itemBody(req.body || {});
  if (v.error) return res.status(400).json(v);
  const { rows } = await pool.query(
    `INSERT INTO items (name, unit, qty, received, size, measure, sort)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT MAX(sort) + 1 FROM items), 0)) RETURNING id`,
    [v.name, v.unit, v.qty, v.received, v.size, v.measure]);
  res.status(201).json({ id: rows[0].id });
}));
admin.put('/items/:id', wrap(async (req, res) => {
  const v = itemBody(req.body || {});
  if (v.error) return res.status(400).json(v);
  const r = await pool.query('UPDATE items SET name=$1, unit=$2, qty=$3, received=$4, size=$5, measure=$6 WHERE id=$7',
    [v.name, v.unit, v.qty, v.received, v.size, v.measure, toInt(req.params.id)]);
  if (!r.rowCount) return res.status(404).json({ error: 'Item not found.' });
  res.json({ ok: true });
}));
admin.delete('/items/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM items WHERE id = $1', [toInt(req.params.id)]);
  res.json({ ok: true });
}));

admin.patch('/pledges/:id', wrap(async (req, res) => {
  const status = String(req.body?.status || '');
  if (!['pledged', 'received', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Unknown status.' });
  await pool.query('UPDATE pledges SET status = $1 WHERE id = $2', [status, toInt(req.params.id)]);
  res.json({ ok: true });
}));
admin.delete('/pledges/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM pledges WHERE id = $1', [toInt(req.params.id)]);
  res.json({ ok: true });
}));

admin.get('/pledges.csv', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.created_at, p.ref, p.donor_name, p.phone, p.email, i.name AS item, i.unit, p.qty, p.status, p.show_name
     FROM pledges p JOIN items i ON i.id = p.item_id ORDER BY p.created_at`);
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const head = ['Date', 'Reference', 'Name', 'Phone', 'Email', 'Item', 'Unit', 'Quantity', 'Status', 'Name shown publicly'];
  const lines = rows.map((r) => [new Date(r.created_at).toISOString(), r.ref, r.donor_name, r.phone, r.email, r.item, r.unit, r.qty, r.status, r.show_name ? 'yes' : 'no'].map(esc).join(','));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="musikana-pledges.csv"');
  res.send([head.map(esc).join(','), ...lines].join('\n'));
}));

if (SERVE_PUBLIC) app.use('/api', pub);
if (SERVE_ADMIN) app.use('/api/admin', admin);
app.get('/healthz', (req, res) => res.send('ok'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

/* ---------- Start ---------- */
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
// Both sites share one database; a lock stops them updating the tables at the same moment
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(schema);
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    client.release();
  }
}
migrate()
  .then(() => app.listen(PORT, () => console.log(`Musikana registry (${APP_MODE} site) running on port ${PORT}`)))
  .catch((e) => { console.error('Could not set up the database:', e.message); process.exit(1); });
