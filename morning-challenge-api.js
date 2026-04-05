const { kv } = require('@vercel/kv');

async function readTotals() {
  const taro = Number((await kv.get('mc:global:taro_total_ok')) ?? 0) || 0;
  const jiro = Number((await kv.get('mc:global:jiro_total_ok')) ?? 0) || 0;
  return { taroTotalOk: taro, jiroTotalOk: jiro };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const hasKv = !!process.env.KV_REST_API_URL;

  if (req.method === 'GET') {
    if (!hasKv) {
      return res.status(200).json({ disabled: true, taroTotalOk: 0, jiroTotalOk: 0 });
    }
    const t = await readTotals();
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
    const nx = await kv.set(dayKey, '1', { nx: true });
    if (nx === null) {
      const t = await readTotals();
      return res.status(200).json({
        accepted: false,
        reason: 'already_recorded',
        ...t,
      });
    }

    const globalKey = who === 'taro' ? 'mc:global:taro_total_ok' : 'mc:global:jiro_total_ok';
    await kv.incr(globalKey);
    const t = await readTotals();
    return res.status(200).json({ accepted: true, ...t });
  }

  return res.status(405).json({ error: 'method not allowed' });
};
