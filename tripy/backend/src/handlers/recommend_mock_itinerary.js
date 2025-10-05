// src/handlers/recommend.js
// DRYRUN: 旅程JSONを返すだけ（外部APIなし）
// MOCK: demo only / not wired in prod
exports.handler = async (event) => {
  if (event?.requestContext?.http?.method === 'OPTIONS') {
    return ok('');
  }

  // 最終セグメントが invoke / recommend / trips/recommend なら受理
  const path = event.rawPath || event.requestContext?.http?.path || '/';
  const last = '/' + path.replace(/\/+$/, '').split('/').pop();
  if (event.requestContext?.http?.method !== 'POST' ||
      !(['/invoke','/recommend'].includes(last) || path.endsWith('/trips/recommend'))) {
    return notFound();
  }

  // Token（開発用）
  const token = header(event, 'x-agent-token');
  const required = process.env.RECO_TOKEN;
  if (required && token !== required) return unauthorized();

  const body = parseJsonBody(event);
  const numDays = Number(body?.num_days ?? 3);
  const title    = body?.title    || 'ロンドン旅行';
  const duration = body?.duration || '2泊3日';
  const dates    = body?.dates    || '';

  const spots = [
    { name:'The George Inn',    lat:51.5045, lon:-0.0865 },
    { name:'Fortnum & Mason',   lat:51.5074, lon:-0.1372 },
    { name:'British Museum',    lat:51.5194, lon:-0.1270 },
    { name:'Covent Garden',     lat:51.5118, lon:-0.1226 },
    { name:'Westminster Abbey', lat:51.4994, lon:-0.1273 },
    { name:'Oxford Street',     lat:51.5154, lon:-0.1447 },
  ];
  const itinerary = buildItinerary('London', {lat:51.5074, lon:-0.1278}, spots,
                                   title, duration, dates, numDays);
  return ok(itinerary);
};

// -------------- helpers --------------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Agent-Token,X-User-Id',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};
const ok = (body) => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});
const notFound = () => ({
  statusCode: 404,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS },
  body: 'not found'
});
const unauthorized = () => ({
  statusCode: 401,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS },
  body: 'unauthorized'
});
const header = (event, key) =>
  (event.headers?.[key] ?? event.headers?.[key.toLowerCase()] ?? event.headers?.[key.toUpperCase()]);
const parseJsonBody = (event) => {
  try {
    const isB64 = event.isBase64Encoded === true;
    const raw = isB64 ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '{}');
    return JSON.parse(raw);
  } catch { return {}; }
};

const TIME = ['11:30','15:30','19:00'];
function inferType(name) {
  const s = (name || '').toLowerCase();
  if (/(bar|pub|izakaya|cafe|coffee|bakery|sweets|dessert|ramen|sushi|curry|burger|pizza|pasta|restaurant)/.test(s))
    return 'dining';
  if (/(museum|park|temple|church|palace|castle|tower|art|gallery|landmark|historic)/.test(s))
    return 'sightseeing';
  if (/(mall|market|shopping|store|department)/.test(s))
    return 'shopping';
  if (/(theatre|theater|music|live|cinema|club)/.test(s))
    return 'entertainment';
  return 'sightseeing';
}
function buildItinerary(cityLabel, center, spots, title, duration, dates, numDays) {
  const days = Array.from({length: numDays}, (_,i)=>({day:i+1, date:'', theme:'街歩き・食べ歩き', activities:[]}));
  spots.forEach((s, i) => {
    const d = i % numDays;
    days[d].activities.push({
      time: TIME[i % TIME.length],
      activity: s.name,
      location: s.name,
      locationEn: s.name,
      lat: s.lat, lng: s.lon,
      type: inferType(s.name)
    });
  });
  return { title, duration, dates, days };
}
