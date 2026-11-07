import { json, sb, UUID } from '../_lib.js';
export async function onRequestGet({ request, env }) {
  const o = new URL(request.url).searchParams.get('o') || '';
  if (!UUID.test(o)) return json({ error: 'Bad request' }, 400);
  const rows = await (await sb(env, 'orders?select=status&id=eq.' + o)).json();
  return json({ status: Array.isArray(rows) && rows[0] ? rows[0].status : 'unknown' });
}
