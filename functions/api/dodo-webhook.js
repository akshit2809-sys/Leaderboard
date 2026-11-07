import { sb, UUID } from '../_lib.js';

const enc = new TextEncoder();
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function same(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

async function verify(env, req, body) {
  const id = req.headers.get('webhook-id'), ts = req.headers.get('webhook-timestamp'), sig = req.headers.get('webhook-signature');
  if (!id || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', b64d(env.DODO_WEBHOOK_SECRET.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(id + '.' + ts + '.' + body)));
  const expected = btoa(String.fromCharCode(...mac));
  return sig.split(' ').some(p => { const [v, s] = p.split(','); return v === 'v1' && s && same(s, expected); });
}

export async function onRequestPost({ request, env }) {
  const body = await request.text();
  if (!(await verify(env, request, body))) return new Response('Invalid signature', { status: 400 });
  let ev; try { ev = JSON.parse(body); } catch { return new Response('Bad body', { status: 400 }); }
  const d = ev.data || {}, m = d.metadata || {}, oid = m.order_id || m.orderId;
  if (!oid || !UUID.test(oid)) return new Response('ok');
  try {
    if (ev.type === 'payment.succeeded') {
      await sb(env, 'orders?id=eq.' + oid, { method: 'PATCH', body: { charge_amount: d.total_amount != null ? d.total_amount / 100 : null, charge_currency: d.currency || null } });
      const r = await sb(env, 'rpc/confirm_order', { method: 'POST', body: { p_order: oid, p_gateway_ref: d.payment_id || null } });
      if (r.status >= 500) return new Response('retry', { status: 500 });
      if (!r.ok) console.error('confirm_order failed', oid, await r.text());
    } else if (ev.type === 'payment.failed' || ev.type === 'payment.cancelled') {
      await sb(env, 'rpc/close_order', { method: 'POST', body: { p_order: oid, p_status: ev.type === 'payment.failed' ? 'failed' : 'cancelled' } });
    }
  } catch (e) { console.error(e); return new Response('retry', { status: 500 }); }
  return new Response('ok');
}
