// src/handlers/recommend_spots.js
exports.handler = async (event) => {
  if (event?.requestContext?.http?.method === 'OPTIONS') return ok('');

  const path = event.rawPath || event.requestContext?.http?.path || '/';
  const last = '/' + path.replace(/\/+$/, '').split('/').pop();
  if (event.requestContext?.http?.method !== 'POST' ||
      !(['/recommend','/spots','/trips/recommend'].includes(last))) return notFound();

  const token = header(event, 'x-agent-token');
  const required = process.env.RECO_TOKEN;
  if (required && token !== required) return unauthorized();

  const body = parseJsonBody(event);
  const city = (body?.city || 'London').toLowerCase();
  const persona = body?.persona_id || 'uni_female_hp_cafe_beginner';

  // --- デモ用：ロンドン + ペルソナ1 固定の候補 ---
  const result = buildForPersona1London();

  return ok({
    chat: result.chat,     // 1) チャットで返す文面
    map: result.map        // 2) フロントがピン打ちに使う
  });
};

// ===== helpers（既存 from your fileを流用でOK） =====
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Agent-Token,X-User-Id',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};
const ok = (body) => ({ statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }, body: JSON.stringify(body) });
const notFound = () => ({ statusCode: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS }, body: 'not found' });
const unauthorized = () => ({ statusCode: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS }, body: 'unauthorized' });
const header = (event, key) => (event.headers?.[key] ?? event.headers?.[key.toLowerCase()] ?? event.headers?.[key.toUpperCase()]);
const parseJsonBody = (event) => { try { const isB64 = event.isBase64Encoded === true; const raw = isB64 ? Buffer.from(event.body||'', 'base64').toString('utf8') : (event.body||'{}'); return JSON.parse(raw); } catch { return {}; } };

function buildForPersona1London() {
  const spots = [
    { name: "King’s Cross Platform 9¾", lat: 51.5323, lon: -0.1240, category: "harry_potter", why: "写真映え＆駅直結で行きやすい" },
    { name: "Leadenhall Market", lat: 51.5124, lon: -0.0830, category: "harry_potter", why: "HPロケ地の雰囲気、昼〜夕方に◎" },
    { name: "Millennium Bridge", lat: 51.5106, lon: -0.0988, category: "harry_potter", why: "テムズ川の映えスポット" },
    { name: "House of MinaLima", lat: 51.5120, lon: -0.1314, category: "harry_potter_shop", why: "HPデザイングッズの聖地" },
    { name: "Cecil Court", lat: 51.5103, lon: -0.1278, category: "street", why: "レトロな書店街で“世界観”散歩" },
    { name: "Warner Bros. Studio Tour London", lat: 51.6905, lon: -0.4172, category: "harry_potter_studio", why: "本命体験。事前予約＆郊外移動" },
    { name: "Peggy Porschen Belgravia", lat: 51.4939, lon: -0.1507, category: "cafe", why: "ピンクの外観が映える人気カフェ" },
    { name: "EL&N Cafe (Park Lane)", lat: 51.5052, lon: -0.1531, category: "cafe", why: "店内デコがフォトジェニック" },
    { name: "Sketch (Gallery)", lat: 51.5111, lon: -0.1416, category: "cafe_brunch", why: "特別感あるティー体験" },
    { name: "Notting Hill – Farm Girl", lat: 51.5160, lon: -0.2023, category: "cafe", why: "ノッティングヒル散策とセット" }
  ];

  const chat = [
    "卒業旅行＆ハリポタ好き向けに、ロンドンの『映え×行きやすさ』優先で10スポットを選びました。",
    "中心地で回しやすい順で並べ、スタジオツアーだけは郊外枠として別途予約推奨です。",
    "・King’s Cross 9¾：まずは駅で写真！",
    "・Leadenhall Market／MinaLima／Cecil Court：HP世界観を街歩きで。",
    "・Millennium Bridge：テムズの定番映え橋。",
    "・Peggy Porschen／EL&N／Sketch／Farm Girl：カフェは写真重視でピック。",
    "・WB Studio Tour：半日〜1日枠、事前予約が安全です。",
    "希望があれば、午前/午後での回し方や地下鉄ルートも提案できます。"
  ].join("\n");

  return {
    chat,
    map: { city: "London", center: { lat: 51.5074, lon: -0.1278 }, spots }
  };
}
