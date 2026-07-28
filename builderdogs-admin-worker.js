// ══════════════════════════════════════════════════
// Builder Dogs Admin + Upload Worker
//
// Two jobs:
//   1. POST /            → password-protected admin actions (JSON)
//   2. POST /upload      → public reference-image upload (multipart)
//      validates the real file bytes server-side, then stores it
//      via the service_role key. The Storage bucket is locked so
//      the browser CANNOT upload directly — only this Worker can.
//
// Secrets required (set in Cloudflare dashboard):
//   ADMIN_PASSWORD       — your strong admin password
//   SUPABASE_URL         — https://hhscynnazxzwdicobpkl.supabase.co
//   SUPABASE_SERVICE_KEY — the service_role secret key
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
    'Access-Control-Allow-Headers': 'Content-Type',
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

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }

    // Reject requests not from our own site
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'Forbidden origin' }, 403, origin);
    }

    // ── Public upload endpoint (no admin password; validated by content) ──
    const url = new URL(request.url);
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

    // ── Authenticate every request ──
    if (!passwordMatches(password || '', env.ADMIN_PASSWORD)) {
      return json({ error: 'Unauthorized' }, 401, origin);
    }

    // ── Route allowed actions only ──
    try {
      switch (action) {

        // Approve a verification
        case 'approve_verification': {
          const { id, trait, notes } = params || {};
          if (!id) return json({ error: 'Missing id' }, 400, origin);
          const r = await supabase(env, 'PATCH',
            `doginal_verifications?id=eq.${encodeURIComponent(id)}`,
            { status: 'approved', trait: trait || null, admin_notes: notes || null, approved_at: new Date().toISOString() }
          );
          return json({ ok: r.ok, data: r.data }, r.ok ? 200 : 500, origin);
        }

        // Reject a verification
        case 'reject_verification': {
          const { id, notes } = params || {};
          if (!id) return json({ error: 'Missing id' }, 400, origin);
          const r = await supabase(env, 'PATCH',
            `doginal_verifications?id=eq.${encodeURIComponent(id)}`,
            { status: 'rejected', admin_notes: notes || null }
          );
          return json({ ok: r.ok, data: r.data }, r.ok ? 200 : 500, origin);
        }

        // Save notes / trait without changing status
        case 'update_verification': {
          const { id, trait, notes } = params || {};
          if (!id) return json({ error: 'Missing id' }, 400, origin);
          const r = await supabase(env, 'PATCH',
            `doginal_verifications?id=eq.${encodeURIComponent(id)}`,
            { trait: trait || null, admin_notes: notes || null }
          );
          return json({ ok: r.ok, data: r.data }, r.ok ? 200 : 500, origin);
        }

        // Delete a guestbook entry (moderation)
        case 'delete_guestbook': {
          const { id } = params || {};
          if (!id) return json({ error: 'Missing id' }, 400, origin);
          const r = await supabase(env, 'DELETE',
            `guestbook?id=eq.${encodeURIComponent(id)}`
          );
          return json({ ok: r.ok }, r.ok ? 200 : 500, origin);
        }

        // Update custom request status / notes
        case 'update_custom_request': {
          const { id, status, notes } = params || {};
          if (!id) return json({ error: 'Missing id' }, 400, origin);
          const body = {};
          if (status) body.status = status;
          if (notes !== undefined) body.admin_notes = notes;
          const r = await supabase(env, 'PATCH',
            `custom_requests?id=eq.${encodeURIComponent(id)}`,
            body
          );
          return json({ ok: r.ok, data: r.data }, r.ok ? 200 : 500, origin);
        }

        // Verify the admin password (for login screen)
        case 'verify_password': {
          return json({ ok: true }, 200, origin);
        }

        default:
          return json({ error: 'Unknown action' }, 400, origin);
      }
    } catch(err) {
      return json({ error: 'Server error' }, 500, origin);
    }
  }
};
