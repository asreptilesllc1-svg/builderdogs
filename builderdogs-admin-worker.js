// ══════════════════════════════════════════════════
// Builder Dogs Admin + Upload Worker
//
// Two jobs:
//   1. POST /            → password-protected admin actions (JSON):
//      reads and moderates custom requests, market listings,
//      holder verifications and the guestbook
//   2. POST /upload      → public reference-image upload (multipart)
//      validates the real file bytes server-side, then stores it
//      via the service_role key. The Storage bucket is locked so
//      the browser CANNOT upload directly — only this Worker can.
//
//   3. POST /shopify/invoice → create a Shopify checkout link (Shop Pay)
//      POST /shopify/status  → check whether that checkout was paid
//      Only the store owner (signed in to builderdogs.com) can use these.
//
// Secrets required (set in Cloudflare dashboard):
//   ADMIN_PASSWORD       — your strong admin password (12+ characters)
//   SUPABASE_URL         — https://hhscynnazxzwdicobpkl.supabase.co
//   SUPABASE_SERVICE_KEY — the service_role secret key
// For Shop Pay invoices (optional):
//   OWNER_USER_ID        — your builderdogs.com account id (from Supabase)
//   SHOPIFY_SHOP         — your store's myshopify name, e.g. builderdogs
//   SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET — from your Dev Dashboard app
//     (or SHOPIFY_ADMIN_TOKEN if you have an older shpat_ admin token)
//
// The service_role key bypasses RLS and is NEVER sent to the browser.
// ══════════════════════════════════════════════════

// Only allow requests from your own site
const ALLOWED_ORIGINS = [
  'https://builderdogs.com',
  'https://www.builderdogs.com',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// Simple constant-time-ish password comparison
function passwordMatches(input, actual) {
  if (typeof input !== 'string' || typeof actual !== 'string') return false;
  if (input.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < input.length; i++) {
    diff |= input.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}

// Call Supabase REST API with the service_role key
async function supabase(env, method, path, body) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(e) {}
  return { ok: res.ok, status: res.status, data };
}

// ── Server-side image validation (cannot be bypassed by the client) ──
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;   // 10MB
const IMAGE_SIGNATURES = [
  { type: 'image/png',  ext: 'png',  check: b => b[0]===0x89 && b[1]===0x50 && b[2]===0x4E && b[3]===0x47 },
  { type: 'image/jpeg', ext: 'jpg',  check: b => b[0]===0xFF && b[1]===0xD8 && b[2]===0xFF },
  { type: 'image/gif',  ext: 'gif',  check: b => b[0]===0x47 && b[1]===0x49 && b[2]===0x46 && b[3]===0x38 },
  { type: 'image/webp', ext: 'webp', check: b => b[0]===0x52 && b[1]===0x49 && b[2]===0x46 && b[3]===0x46 && b[8]===0x57 && b[9]===0x45 && b[10]===0x42 && b[11]===0x50 },
];

// Inspect the leading bytes; return the matching signature or null
function identifyImage(bytes) {
  for (const sig of IMAGE_SIGNATURES) {
    if (sig.check(bytes)) return sig;
  }
  return null;
}

// Upload raw bytes to Supabase Storage using the service_role key
async function storageUpload(env, path, bytes, contentType) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/media/${path}`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body: bytes,
  });
  return { ok: res.ok, status: res.status };
}

// Handle the public /upload endpoint
async function handleUpload(request, env, origin) {
  // Enforce a hard size ceiling from the header before reading the body
  const declaredLen = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (declaredLen && declaredLen > MAX_UPLOAD_BYTES + 1024) {
    return json({ error: 'File too large' }, 413, origin);
  }

  let form;
  try {
    form = await request.formData();
  } catch(e) {
    return json({ error: 'Invalid form data' }, 400, origin);
  }

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ error: 'No file provided' }, 400, origin);
  }

  const buf = new Uint8Array(await file.arrayBuffer());

  // Size check on the actual bytes
  if (buf.length === 0) return json({ error: 'Empty file' }, 400, origin);
  if (buf.length > MAX_UPLOAD_BYTES) return json({ error: 'File too large' }, 413, origin);

  // The real gate: the bytes must BE a supported image
  const sig = identifyImage(buf);
  if (!sig) {
    return json({ error: 'File is not a valid image (PNG, JPG, WEBP, or GIF only)' }, 415, origin);
  }

  // Store it under a random, safe name with the verified extension
  const rand = crypto.randomUUID();
  const path = `custom-requests/${Date.now()}-${rand}.${sig.ext}`;
  const up = await storageUpload(env, path, buf, sig.type);
  if (!up.ok) {
    return json({ error: 'Storage upload failed' }, 502, origin);
  }

  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/media/${path}`;
  return json({ ok: true, url: publicUrl }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // CORS preflight — ALWAYS answer first, before any other logic,
    // so the browser is allowed to send the real request.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Everything else runs inside a guard so that even an unexpected
    // error still comes back WITH CORS headers (otherwise the browser
    // reports a misleading "No Access-Control-Allow-Origin" error).
    try {
      return await route(request, env, origin);
    } catch (err) {
      return json({ error: 'Server error', detail: String(err && err.message || err) }, 500, origin);
    }
  }
};

async function route(request, env, origin) {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }

    // Reject requests not from our own site
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'Forbidden origin' }, 403, origin);
    }

    // ── Public upload endpoint (no admin password; validated by content) ──
    const url = new URL(request.url);
    if (url.pathname === '/shopify/invoice' || url.pathname === '/shopify/status') {
      return handleShopify(url.pathname, request, env, origin);
    }
    if (url.pathname === '/upload' || url.pathname.endsWith('/upload')) {
      return handleUpload(request, env, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch(e) {
      return json({ error: 'Invalid JSON' }, 400, origin);
    }

    const { password, action, params } = payload || {};

    // ── Refuse to run admin actions until a strong password is set ──
    if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) {
      return json({ error: 'Admin password not configured' }, 503, origin);
    }

    // ── Authenticate every request ──
    if (!passwordMatches(password || '', env.ADMIN_PASSWORD)) {
      // Slow down password guessing
      await new Promise(r => setTimeout(r, 1000));
      return json({ error: 'Unauthorized' }, 401, origin);
    }

    return adminAction(action, params || {}, env, origin);
}

// ── Admin actions ────────────────────────────────────────────────
// Every read and write of private data goes through here, using the
// service key that only this Worker holds. Only these tables and
// these fields can be touched.
const LIST_TABLES = {
  custom_requests:       'created_at',
  market_listings:       'created_at',
  doginal_verifications: 'submitted_at',
  guestbook:             'created_at',
};
const CUSTOM_STATUSES  = ['pending', 'quoted', 'approved', 'completed', 'declined'];
const LISTING_STATUSES = ['pending', 'approved', 'rejected'];

const validId = id => (typeof id === 'string' || typeof id === 'number') && /^[A-Za-z0-9-]{1,64}$/.test(String(id));
const text = (v, max) => (v == null || v === '') ? null : String(v).slice(0, max);

async function adminAction(action, p, env, origin) {
  const done = r => json({ ok: r.ok, data: r.data }, r.ok ? 200 : 502, origin);
  const needId = () => validId(p.id) ? null : json({ error: 'Missing or invalid id' }, 400, origin);
  const byId = table => `${table}?id=eq.${encodeURIComponent(p.id)}`;

  switch (action) {

    // Login check for the admin pages
    case 'verify_password':
      return json({ ok: true }, 200, origin);

    // Read a full table (admin only)
    case 'list': {
      const order = LIST_TABLES[p.table];
      if (!order) return json({ error: 'Unknown table' }, 400, origin);
      return done(await supabase(env, 'GET', `${p.table}?select=*&order=${order}.desc&limit=1000`));
    }

    // ── Custom requests ──
    case 'update_custom_request': {
      const bad = needId(); if (bad) return bad;
      const body = {};
      if (p.status !== undefined) {
        if (!CUSTOM_STATUSES.includes(p.status)) return json({ error: 'Invalid status' }, 400, origin);
        body.status = p.status;
      }
      if (p.notes !== undefined) body.admin_notes = text(p.notes, 5000);
      return done(await supabase(env, 'PATCH', byId('custom_requests'), body));
    }

    // ── Market listings ──
    case 'set_listing_status': {
      const bad = needId(); if (bad) return bad;
      if (!LISTING_STATUSES.includes(p.status)) return json({ error: 'Invalid status' }, 400, origin);
      return done(await supabase(env, 'PATCH', byId('market_listings'), { status: p.status }));
    }
    case 'delete_listing': {
      const bad = needId(); if (bad) return bad;
      return done(await supabase(env, 'DELETE', byId('market_listings')));
    }

    // ── Holder verifications ──
    case 'approve_verification': {
      const bad = needId(); if (bad) return bad;
      return done(await supabase(env, 'PATCH', byId('doginal_verifications'),
        { status: 'approved', trait: text(p.trait, 100), admin_notes: text(p.notes, 5000), approved_at: new Date().toISOString() }));
    }
    case 'reject_verification': {
      const bad = needId(); if (bad) return bad;
      return done(await supabase(env, 'PATCH', byId('doginal_verifications'),
        { status: 'rejected', admin_notes: text(p.notes, 5000) }));
    }
    case 'update_verification': {
      const bad = needId(); if (bad) return bad;
      return done(await supabase(env, 'PATCH', byId('doginal_verifications'),
        { trait: text(p.trait, 100), admin_notes: text(p.notes, 5000) }));
    }

    // ── Guestbook moderation ──
    case 'delete_guestbook': {
      const bad = needId(); if (bad) return bad;
      return done(await supabase(env, 'DELETE', byId('guestbook')));
    }

    default:
      return json({ error: 'Unknown action' }, 400, origin);
  }
}

// ── Shop Pay invoices via Shopify draft orders ───────────────────
// The signed-in store owner sends their builderdogs.com login token; we
// confirm it with Supabase, then create (or check) a Shopify draft order.
// Shopify's checkout for a draft order offers Shop Pay and cards.
const SHOPIFY_API_VERSION_DEFAULT = '2026-04';
let shopifyToken = null, shopifyTokenExp = 0;   // cached per Worker instance

async function shopifyAccessToken(env) {
  if (env.SHOPIFY_ADMIN_TOKEN) return env.SHOPIFY_ADMIN_TOKEN;
  if (shopifyToken && Date.now() < shopifyTokenExp) return shopifyToken;
  if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) throw new Error('Shopify is not connected yet.');
  const res = await fetch(`https://${env.SHOPIFY_SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error('Shopify login failed' + (data.error ? ': ' + data.error : '') + '.');
  shopifyToken = data.access_token;
  shopifyTokenExp = Date.now() + (Math.max(300, (data.expires_in || 86399)) - 120) * 1000;
  return shopifyToken;
}

async function shopifyGraphQL(env, query, variables) {
  const token = await shopifyAccessToken(env);
  const version = env.SHOPIFY_API_VERSION || SHOPIFY_API_VERSION_DEFAULT;
  const res = await fetch(`https://${env.SHOPIFY_SHOP}.myshopify.com/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors) throw new Error('Shopify error: ' + JSON.stringify(data.errors || res.status).slice(0, 300));
  return data.data;
}

async function signedInOwner(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': auth },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user && user.id && user.id === env.OWNER_USER_ID ? user : null;
}

const money2 = n => (Math.round(Number(n) * 100) / 100).toFixed(2);

async function handleShopify(path, request, env, origin) {
  if (!env.SHOPIFY_SHOP || !env.OWNER_USER_ID) return json({ error: 'Shop Pay isn\'t set up yet.' }, 503, origin);
  const owner = await signedInOwner(request, env);
  if (!owner) return json({ error: 'Sign in as the store owner to use Shop Pay invoices.' }, 401, origin);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400, origin); }
  const id = body && body.invoice_id;
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return json({ error: 'Missing invoice id' }, 400, origin);

  const found = await supabase(env, 'GET', `invoices?id=eq.${id}&user_id=eq.${owner.id}&select=*`);
  const inv = found.ok && Array.isArray(found.data) ? found.data[0] : null;
  if (!inv) return json({ error: 'Invoice not found.' }, 404, origin);

  if (path === '/shopify/status') {
    if (!inv.shop_draft_id) return json({ ok: true, paid: false, status: 'none' }, 200, origin);
    const d = await shopifyGraphQL(env, `query($id: ID!) { draftOrder(id: $id) { status order { name displayFinancialStatus } } }`, { id: inv.shop_draft_id });
    const dr = d && d.draftOrder;
    const fin = dr && dr.order ? dr.order.displayFinancialStatus : null;
    return json({ ok: true, status: dr ? dr.status : 'missing', order: dr && dr.order ? dr.order.name : null,
                  financial: fin, paid: fin === 'PAID' || fin === 'PARTIALLY_REFUNDED' }, 200, origin);
  }

  // /shopify/invoice — create a fresh checkout link for this invoice
  if (inv.status !== 'open') return json({ error: 'Only open invoices can get a checkout link.' }, 400, origin);
  const lineItems = (inv.lines || []).map(l => ({
    title: String(l.title || 'Item').slice(0, 255),
    quantity: Math.max(1, parseInt(l.qty, 10) || 1),
    originalUnitPriceWithCurrency: { amount: money2(l.price), currencyCode: 'USD' },
    requiresShipping: true,
  }));
  const input = {
    lineItems,
    note: `Builder Dogs invoice #${inv.number}` + (inv.buyer_handle ? ` for @${inv.buyer_handle}` : ''),
    tags: ['builderdogs-invoice', `invoice-${inv.number}`],
  };
  if (Number(inv.discount) > 0) input.appliedDiscount = { title: 'Discount', value: Number(money2(inv.discount)), valueType: 'FIXED_AMOUNT' };
  if (Number(inv.shipping) > 0) input.shippingLine = { title: 'Shipping', priceWithCurrency: { amount: money2(inv.shipping), currencyCode: 'USD' } };

  const d = await shopifyGraphQL(env,
    `mutation($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id invoiceUrl totalPriceSet { shopMoney { amount } } } userErrors { field message } } }`,
    { input });
  const out = d && d.draftOrderCreate;
  if (!out || (out.userErrors && out.userErrors.length) || !out.draftOrder) {
    return json({ error: 'Shopify: ' + ((out && out.userErrors || []).map(e => e.message).join('; ') || 'could not create checkout') }, 502, origin);
  }
  const upd = await supabase(env, 'PATCH', `invoices?id=eq.${id}&user_id=eq.${owner.id}`,
    { shop_url: out.draftOrder.invoiceUrl, shop_draft_id: out.draftOrder.id, updated_at: new Date().toISOString() });
  if (!upd.ok) return json({ error: 'Saved in Shopify but could not update the invoice.' }, 502, origin);
  return json({ ok: true, shop_url: out.draftOrder.invoiceUrl, shopify_total: out.draftOrder.totalPriceSet && out.draftOrder.totalPriceSet.shopMoney.amount }, 200, origin);
}
