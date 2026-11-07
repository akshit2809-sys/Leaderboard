export const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export function sb(env, path, opts = {}) {
  const k = env.SUPABASE_SERVICE_KEY;
  const h = { apikey: k, 'content-type': 'application/json', ...(opts.headers || {}) };
  if (!k.startsWith('sb_')) h.authorization = 'Bearer ' + k;
  return fetch(env.SUPABASE_URL + '/rest/v1/' + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
