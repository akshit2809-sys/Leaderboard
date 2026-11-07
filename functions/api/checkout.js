import { json, sb, UUID } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  let S = {};
  try { const r = await sb(env, 'launch_settings?select=*&id=eq.1'); if (r.ok) S = (await r.json())[0] || {}; } catch {}
  if (S.payments_open) {
    if (/test\./.test(env.DODO_BASE || '')) return json({ error: 'Payments are not available yet.' }, 503);
  } else if (!env.TEST_PASSWORD || b.test_key !== env.TEST_PASSWORD) {
    return json({ error: 'Payments open soon.' }, 403);
  }

  const amount = Number(b.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000000) return json({ error: 'Enter a whole dollar amount of $1 or more.' }, 400);
  const first = String(b.first_name || '').trim().slice(0, 60), last = String(b.last_name || '').trim().slice(0, 60), email = String(b.email || '').trim().slice(0, 120);
  if (!first || !last || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Please enter your first name, last name and a valid email.' }, 400);

  const freeNow = S.free_ends_at && Date.now() < new Date(S.free_ends_at).getTime();
  const order = { amount_usd: amount, buyer_name: first + ' ' + last, buyer_email: email, gateway: 'dodo', status: 'created' };
  if (b.listing_id) {
    if (!UUID.test(b.listing_id)) return json({ error: 'Bad listing.' }, 400);
    const rows = await (await sb(env, 'listings?select=id&status=eq.approved&id=eq.' + b.listing_id)).json();
    if (!Array.isArray(rows) || !rows.length) return json({ error: 'That listing is not available.' }, 400);
    order.listing_id = b.listing_id;
  } else {
    if (!freeNow && amount < (S.min_new_price || 5)) return json({ error: 'New listings start at $' + (S.min_new_price || 5) + '.' }, 400);
    const name = String(b.name || '').trim().slice(0, 60), pitch = String(b.pitch || '').trim().slice(0, 140);
    let url; try { const u = new URL(String(b.url || '').trim()); if (!/^https?:$/.test(u.protocol)) throw 0; url = u.href; } catch { return json({ error: 'Enter a full website address starting with https://' }, 400); }
    if (!name) return json({ error: 'Add a name for your listing.' }, 400);
    const dup = await (await sb(env, 'listings?select=id&url=eq.' + encodeURIComponent(url))).json();
    if (Array.isArray(dup) && dup.length) return json({ error: 'That website is already listed. Use Add money on its row.' }, 400);
    Object.assign(order, { new_name: name, new_url: url, new_pitch: pitch || null });
  }

  const ins = await sb(env, 'orders', { method: 'POST', headers: { prefer: 'return=representation' }, body: order });
  if (!ins.ok) { console.error('order insert', await ins.text()); return json({ error: 'Could not start the payment.' }, 500); }
  const row = (await ins.json())[0];

  const res = await fetch(env.DODO_BASE + '/checkouts', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.DODO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      product_cart: [{ product_id: env.DODO_PRODUCT_ID, quantity: 1, amount: amount * 100 }],
      customer: { email, name: first + ' ' + last },
      return_url: env.SITE_URL + '/?paid=' + row.id,
      metadata: { order_id: row.id }
    })
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.checkout_url) {
    console.error('dodo error', res.status, JSON.stringify(d));
    await sb(env, 'rpc/close_order', { method: 'POST', body: { p_order: row.id, p_status: 'failed' } });
    return json({ error: 'The payment provider could not start the payment. Please try again.', detail: S.payments_open ? undefined : { status: res.status, body: d } }, 502);
  }
  await sb(env, 'orders?id=eq.' + row.id, { method: 'PATCH', body: { status: 'redirected' } });
  return json({ url: d.checkout_url });
}
