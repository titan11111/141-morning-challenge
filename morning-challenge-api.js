// Upstash Redis REST API helper (no external dependencies)
async function upstash(url, token, command, key, ...args) {
  const encodedKey = encodeURIComponent(key);
  const isRead = command === 'GET';
  const headers = { Authorization: `Bearer ${token}` };
  const config = { method: isRead ? 'GET' : 'POST', headers };
  if (!isRead) {
    headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(args.length ? args : []);
  }
  const r = await fetch(`${url}/${command}/${encodedKey}`, config);
  const j = await r.json();
  return j.result;
}

async function readTotals(url, token) {
  const [taro, jiro] = await Promise.all([
    upstash(url, token, 'GET', 'mc:global:taro_total_ok'),
    upstash(url, token, 'GET', 'mc:global:jiro_total_ok'),
  ]);
  return {
    taroTotalOk: Number(taro ?? 0) || 0,
    jiroTotalOk: Number(jiro ?? 0) || 0,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const hasKv = !!(url && token);

  if (req.method === 'GET') {
    if (!hasKv) {
      return res.status(200).json({ disabled: true, taroTotalOk: 0, jiroTotalOk: 0 });
    }
    const t = await readTotals(url, token);
    return res.status(200).json({ disabled: false, ...t });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body || '{}');
      } catch {
        return res.status(400).json({ error: 'invalid json' });
      }
    }
    const { who, date } = body || {};
    if (!who || !date || !['taro', 'jiro'].includes(who)) {
      return res.status(400).json({ error: 'bad request' });
    }
    if (!hasKv) {
      return res.status(200).json({ disabled: true, accepted: true, taroTotalOk: 0, jiroTotalOk: 0 });
    }

    const dayKey = `mc:day:${date}:${who}`;
    // SET NX: returns "OK" if newly set, null if key already existed
    const nx = await upstash(url, token, 'SET', dayKey, '1', 'NX');
    if (nx === null) {
      const t = await readTotals(url, token);
      return res.status(200).json({ accepted: false, reason: 'already_recorded', ...t });
    }

    const globalKey = who === 'taro' ? 'mc:global:taro_total_ok' : 'mc:global:jiro_total_ok';
    await upstash(url, token, 'INCR', globalKey);
    const t = await readTotals(url, token);
    return res.status(200).json({ accepted: true, ...t });
  }

  return res.status(405).json({ error: 'method not allowed' });
};
