import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// ===== Config =====
const CONFIG = (typeof window !== 'undefined' && window.APP_CONFIG) ? window.APP_CONFIG : {
  region: "us-west-2",  // ALSのリージョン
  apiKey: "v1.public.eyJqdGkiOiJjMDk2YTAzZi1lOGU5LTQ3ZGItYmE4NS04Mjk5NTAwNThlY2YifctnQ84751hBx5YVqNEfGq-V8TgZ0logmwK2ekr4j0WkoCi0_RUczzjKH_yCkK3xHyTaC9CQND3yT-V2EsR4G9YBAuXc-615wLwSR1nrtXL9U6xR5G3k1OKkdCtODY5PWqZeiBkSThGkj-_y_yjg3Xx1FkY3cxYZMVjSMdH9q1gYIt7qvhDCCaySsqataBnuAcfujoSGjxh24ePiBl075Q79pmsdrv2YjSzfVtMI0si8KSwah0htbi0MJhyuB5VtjiCG5A3-2HiHVlRizSFHpxW2r5fvfFkpuLBmMr4G0_ITjRL-TSRcQs9JNgpBX7AHSdGrh3UgwYjpmCkQla1sFlk.MGFjMDA4ZmUtYWRiYy00NTgyLTg0Y2MtZTY3MzFlZDRmYTQ1", // コンソールで発行したAPIキー
  styleName: "Standard", // Standard / Monochrome / Hybrid / Satellite
  language: "ja",  // Placesの応答言語
  myLocation: {lng: -0.07858, lat: 51.50956},  // ← 任意。指定時は現在地をこの値で上書き
  initialPinsUrl: '/pins.json'
};

const PIN_COLORS = {
  visited: '#1a73e8',
  favorite: '#fbbc04',
  recommended: '#ea4335',
  plan: '#00bcd4',
  added: '#6b4eff',
  me: '#34a853'
};

const CATEGORIES = ['visited','favorite','recommended','plan','added'];

// 固定ID（ルートのレイヤ/ソース名）
const ROUTE_SOURCE_ID = 'route-source';
const ROUTE_LAYER_ID = 'route-layer';

export default function MapPage() {
  const location = useLocation();

  // pins: {id, lat, lng, name, description, category, isAdded}
  const [pins, setPins] = useState([]);
  const [routeState, setRouteState] = useState({ drawn: false, pinId: null, dest: null });
  const [mapReady, setMapReady] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all'); // ★ 一覧フィルター

  const mapRef = useRef(null);
  const mapDivRef = useRef(null);
  const markersRef = useRef([]);
  const meMarkerRef = useRef(null);
  const meLngLatRef = useRef(null); // [lng, lat]
  const actionPopupRef = useRef(null);

  const mapsEndpoint = `https://maps.geo.${CONFIG.region}.amazonaws.com`;
  const placesEndpoint = `https://places.geo.${CONFIG.region}.amazonaws.com`;
  const routesEndpoint = `https://routes.geo.${CONFIG.region}.amazonaws.com/v2/routes?key=${encodeURIComponent(CONFIG.apiKey)}`;
  const styleUrl = `${mapsEndpoint}/v2/styles/${encodeURIComponent(CONFIG.styleName)}/descriptor?key=${encodeURIComponent(CONFIG.apiKey)}`;

  // ---- Map init（初期表示＝myLocation があればそこ）
  useEffect(() => {
    if (mapRef.current) return;

    const initialCenter = (CONFIG.myLocation && Number.isFinite(CONFIG.myLocation.lng) && Number.isFinite(CONFIG.myLocation.lat))
      ? [CONFIG.myLocation.lng, CONFIG.myLocation.lat]
      : [139.767, 35.681];

    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: styleUrl,
      center: initialCenter,
      zoom: CONFIG.myLocation ? 14 : 12
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('load', () => setMapReady(true));

    // カスタム: Find my location（myLocation を最優先して移動）
    class FindMeControl {
      onAdd(m){
        this._map = m;
        const btn = document.createElement('button');
        btn.className = 'maplibregl-ctrl-icon';
        btn.type = 'button';
        btn.ariaLabel = 'Find my location';
        btn.style.backgroundImage = 'url(https://cdn-icons-png.flaticon.com/512/684/684908.png)';
        btn.style.backgroundSize = '24px 24px';
        btn.style.backgroundRepeat = 'no-repeat';
        btn.style.backgroundPosition = 'center';
        btn.onclick = () => {
          if (CONFIG.myLocation && Number.isFinite(CONFIG.myLocation.lng) && Number.isFinite(CONFIG.myLocation.lat)) {
            const lngLat = [CONFIG.myLocation.lng, CONFIG.myLocation.lat];
            setMyLocation(lngLat);
            this._map.flyTo({ center: lngLat, zoom: 14 });
            return;
          }
          if (navigator.geolocation){
            navigator.geolocation.getCurrentPosition(
              (pos)=>{
                const lngLat = [pos.coords.longitude, pos.coords.latitude];
                setMyLocation(lngLat);
                this._map.flyTo({ center: lngLat, zoom: 14 });
              },
              ()=> alert('現在地の取得が許可されていません')
            );
          } else {
            alert('このブラウザは位置情報に対応していません');
          }
        };
        const container = document.createElement('div');
        container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        container.appendChild(btn);
        this._container = container;
        return container;
      }
      onRemove(){ this._container?.remove(); this._map = undefined; }
    }
    map.addControl(new FindMeControl(), 'top-right');

    if (CONFIG.myLocation && Number.isFinite(CONFIG.myLocation.lng) && Number.isFinite(CONFIG.myLocation.lat)) {
      const lngLat = [CONFIG.myLocation.lng, CONFIG.myLocation.lat];
      setMyLocation(lngLat);
    }

    // クリック：Shift+クリックでピン追加／通常クリックでアクションポップアップ
    map.on('click', async (e) => {
      const { lng, lat } = e.lngLat;
      if (e.originalEvent && e.originalEvent.shiftKey) {
        addPin(lat, lng, `地点 ${pins.length + 1}`, '新しい観光地', 'added', true);
      } else {
        const als = await reverseGeocodeALS(placesEndpoint, CONFIG.apiKey, [lng, lat], CONFIG.language);
        const name = als?.title || suggestName(lat, lng);
        const address = als?.addressLabel;
        openActionPopup({ lng, lat, name, address, pinId: null, isAdded: false });
      }
    });

    mapRef.current = map;
    return () => map.remove();
    // eslint-disable-next-line
  }, []);

  // 旅程表からの場所をピン追加（added）
  useEffect(() => {
    const state = location && location.state;
    if (state?.center) {
      const [lat, lng] = state.center;
      addPin(lat, lng, state.locationName || '選択された場所', state.locationNameEn || '', 'added', true);
      if (mapRef.current) mapRef.current.flyTo({ center: [lng, lat], zoom: 15 });
    }
  }, [location]);

  // ✅ 初期ピン一覧を JSON からロード
  useEffect(() => {
    const url = CONFIG.initialPinsUrl || '/pins.json';
    (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) { console.warn('initial pins fetch failed', res.status); return; }
        const arr = await res.json();
        if (!Array.isArray(arr)) { console.warn('initial pins not array'); return; }
        const mapped = arr.map(normalizePinFromJson).filter(Boolean);
        if (mapped.length) setPins((prev) => [...prev, ...mapped]);
      } catch (e) {
        console.warn('initial pins load error', e);
      }
    })();
  }, []);

  // pins / ルート状態 / マップ準備 変更時にマーカー再描画
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current = [];

    pins.forEach((p) => {
      const marker = new maplibregl.Marker({ color: PIN_COLORS[p.category] || PIN_COLORS.added, scale: 1.0 })
        .setLngLat([p.lng, p.lat])
        .addTo(mapRef.current);

      // ★ ホバー表示：施設名 + カテゴリー + 説明（座標は表示しない）
      const titleHtml = `<div style="font-weight:700;font-size:14px">${escapeHtml(p.name || 'スポット')}</div>`;
      const catHtml = `<div style=\"font-size:12px;color:#888;margin-top:2px\">カテゴリ: ${escapeHtml(p.category || '-')}</div>`;
      const noteHtml = p.description ? `<div style=\"font-size:13px;color:#555;margin-top:4px\">${escapeHtml(p.description)}</div>` : '';
      attachHoverPopup(marker, `${titleHtml}${catHtml}${noteHtml}`);

      marker.getElement().addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const als = await reverseGeocodeALS(placesEndpoint, CONFIG.apiKey, [p.lng, p.lat], CONFIG.language);
        const name = p.name || als?.title || suggestName(p.lat, p.lng);
        const address = als?.addressLabel;
        openActionPopup({ lng: p.lng, lat: p.lat, name, address, pinId: p.id, isAdded: !!p.isAdded });
      });

      markersRef.current.push({ marker, pin: p });
    });
  }, [pins, routeState, mapReady]);

  // === リストからフォーカス移動 ===
  async function focusPin(p) {
    if (!mapRef.current) return;
    mapRef.current.flyTo({ center: [p.lng, p.lat], zoom: 15 });
    const als = await reverseGeocodeALS(placesEndpoint, CONFIG.apiKey, [p.lng, p.lat], CONFIG.language);
    const name = p.name || als?.title || suggestName(p.lat, p.lng);
    const address = als?.addressLabel;
    openActionPopup({ lng: p.lng, lat: p.lat, name, address, pinId: p.id, isAdded: !!p.isAdded });
  }
  // === Popup ボタンのイベントを安全に付与（component scope） ===
  function bindPopupButtons(popup, uid, lng, lat, pinId, demo) {
    const root = popup && popup.getElement ? popup.getElement() : null;
    if (!root) return;
    const q = (sel) => root.querySelector(sel);
    const routeBtn = q(`#${uid}_route`);
    const clearBtn = q(`#${uid}_clear`);
    const addBtn = q(`#${uid}_add`);
    const delBtn = q(`#${uid}_del`);
    if (routeBtn) routeBtn.onclick = () => routeTo(lng, lat, pinId);
    if (clearBtn) clearBtn.onclick = () => clearRouteForPin(pinId);
    if (addBtn) addBtn.onclick = () => addPin(lat, lng, demo.name, 'デモで追加', 'added', true);
    if (delBtn) delBtn.onclick = () => removePinById(pinId);
  }

  // === アクションポップアップ（ルート検索 / ピン操作 / デモ情報） ===
  function openActionPopup({ lng, lat, name, address, pinId, isAdded }) {
    const demo = buildDemoInfo(lat, lng, name, address);
    const uid = `p_${Date.now()}`; // 要素IDの衝突回避

    const showRouteClear = routeState.drawn && routeState.pinId != null && routeState.pinId === pinId; // そのピンに対してのみ
    const showPinDelete = !!pinId && !!isAdded; // 追加されたピンのみ

    const html = `
      <div style="max-width:420px; max-height:380px; overflow:auto;">
        <div style="font-weight:700;font-size:16px;margin-bottom:8px">${escapeHtml(demo.name)}</div>
        ${demo.address ? `<div style=\"font-size:12px;color:#666;margin:-4px 0 8px 0\">${escapeHtml(demo.address)}</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <button id="${uid}_route" class="btn" style="padding:6px 10px">ここへルート</button>
          ${showRouteClear ? `<button id="${uid}_clear" class="btn" style="padding:6px 10px">ルート削除</button>` : ''}
          ${!pinId ? `<button id="${uid}_add" class="btn" style="padding:6px 10px">ピンを追加</button>` : ''}
          ${showPinDelete ? `<button id="${uid}_del" class="btn" style="padding:6px 10px">ピンを削除</button>` : ''}
        </div>
        ${renderDemoCard(demo)}
      </div>`;

    if (actionPopupRef.current) actionPopupRef.current.remove();
// 先に open リスナーを登録してから addTo する（イベント取りこぼし防止）
const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '420px' })
  .setLngLat([lng, lat])
  .setHTML(html);

// open 時に安全にイベント付与
popup.on('open', () => bindPopupButtons(popup, uid, lng, lat, pinId, demo));

// 参照を保持してから addTo
actionPopupRef.current = popup;
popup.addTo(mapRef.current);

// 念のため即時バインド（環境によっては open 済みのことがある）
bindPopupButtons(popup, uid, lng, lat, pinId, demo);
  }

  // === ピン操作 ===
  function addPin(lat, lng, name, description = '', category = 'added', isAdded = true) {
    setPins((prev) => [...prev, { id: Date.now(), lat, lng, name, description, category, isAdded }]);
  }
  function removePinById(id) {
    setPins((prev) => prev.filter((p) => p.id !== id));
    if (routeState.drawn && routeState.pinId === id) {
      clearRouteOnMap(mapRef.current);
      setRouteState({ drawn: false, pinId: null, dest: null });
    }
  }

  // === 現在地の設定（マーカーのみ。ピン一覧には追加しない） ===
  function setMyLocation(lngLat) {
    meLngLatRef.current = lngLat;
    if (!mapRef.current) return;
    if (!meMarkerRef.current) meMarkerRef.current = new maplibregl.Marker({ color: PIN_COLORS.me, scale: 1.2 });
    meMarkerRef.current.setLngLat(lngLat).addTo(mapRef.current);
    attachHoverPopup(meMarkerRef.current, '<div style="font-weight:700">現在地</div>');
  }

  // === ルート検索（ALS Routes v2 / APIキー） ===
  async function routeTo(destLng, destLat, destPinId = null) {
    if (!mapRef.current) return;
    if (!meLngLatRef.current) {
      alert('現在地が未取得です。右上のコンパス（Find my location）ボタンを押すか、CONFIG.myLocation を設定してください。');
      return;
    }
    try {
      const body = { Origin: meLngLatRef.current, Destination: [destLng, destLat], TravelMode: 'Car', LegGeometryFormat: 'Simple' };
      const res = await fetch(routesEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const line = extractRouteLineString(json);
      drawRouteOnMap(mapRef.current, line, { source: ROUTE_SOURCE_ID, layer: ROUTE_LAYER_ID });
      setRouteState({ drawn: true, pinId: destPinId, dest: [destLng, destLat] });
    } catch (e) {
      console.error(e);
      alert('ルート検索に失敗しました。APIキーの権限（Routes）が有効か確認してください。');
    }
  }

  function clearRouteForPin(pinId) {
    if (!routeState.drawn || routeState.pinId == null) return;
    if (pinId !== routeState.pinId) return;
    clearRouteOnMap(mapRef.current);
    setRouteState({ drawn: false, pinId: null, dest: null });
  }

  const filteredPins = pins.filter((p) => categoryFilter === 'all' || p.category === categoryFilter);

  // ---- UI
  return (
    <div className="card">
      <h2 style={{ textAlign: 'center', marginBottom: 10, color: '#8B1538', fontSize: 32, fontWeight: 700, letterSpacing: '1px' }}>
        旅行マップ
      </h2>
      <p style={{ textAlign: 'center', marginBottom: 12, color: '#8B1538' }}>
        クリックでアクション（ルート検索／ピン追加）。
      </p>

      <div ref={mapDivRef} style={{ height: '500px', width: '100%', borderRadius: 15, overflow: 'hidden' }} />

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <h3 style={{ color: '#8B1538', fontSize: 20, fontWeight: 600, margin: 0 }}>ピン一覧 ({filteredPins.length}/{pins.length})</h3>
          <label style={{ fontSize: 12, color: '#444' }}>
            カテゴリフィルター：
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ marginLeft: 6, padding: '6px 8px', borderRadius: 8, border: '1px solid #ddd' }}
            >
              <option value="all">all</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>

        {/* ★ スクロール可能な一覧 */}
        <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
          {filteredPins.map((pin) => (
            <div
              key={pin.id}
              onClick={() => focusPin(pin)}
              role="button"
              style={{ marginBottom: 12, padding: 12, background: '#fafbfc', borderRadius: 12, border: '2px solid #e1e8ed', cursor: 'pointer' }}
              title="クリックでこのピンへ移動"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: PIN_COLORS[pin.category] || PIN_COLORS.added }} />
                <span style={{ fontSize: 12, color: '#666' }}>{pin.isAdded ? '追加ピン' : (pin.category || 'pin')}</span>
              </div>
              <input
                type="text"
                value={pin.name}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                onChange={(e) => setPins((prev) => prev.map((p) => p.id === pin.id ? { ...p, name: e.target.value } : p))}
                className="input"
                style={{ marginBottom: 6 }}
              />
              <input
                type="text"
                value={pin.description}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                onChange={(e) => setPins((prev) => prev.map((p) => p.id === pin.id ? { ...p, description: e.target.value } : p))}
                placeholder="説明を入力..."
                className="input"
              />
              {pin.isAdded && (
                <div style={{ marginTop: 8 }}>
                  <button className="btn" onClick={(e) => { e.stopPropagation(); removePinById(pin.id); }}>このピンを削除</button>
                </div>
              )}
            </div>
          ))}
          {filteredPins.length === 0 && (
            <div style={{ textAlign: 'center', color: '#8B1538', padding: 16 }}>
              該当するピンがありません。フィルター条件を変更してください。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Utils =====
function attachHoverPopup(marker, html) {
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 24 }).setHTML(html);
  marker.setPopup(popup);
  const el = marker.getElement();
  let open = false;
  const show = () => { if (!open) { marker.togglePopup(); open = true; } };
  const hide = () => { if (open) { marker.togglePopup(); open = false; } };
  el.addEventListener('mouseenter', show);
  el.addEventListener('mouseleave', hide);
}

function suggestName(lat, lng) { return `スポット (${lat.toFixed(4)}, ${lng.toFixed(4)})`; }

function buildDemoInfo(lat, lng, name, address) {
  const seed = Math.abs(Math.sin(lat * 7.3 + lng * 11.1));
  const rating = (3.5 + (seed * 1.4));
  const reviewCount = Math.floor(50 + seed * 450);
  const openNow = seed > 0.3;
  const weekday = ['月 10:00–20:00', '火 10:00–20:00', '水 10:00–20:00', '木 10:00–20:00', '金 10:00–21:00', '土 10:00–21:00', '日 10:00–19:00'];
  const image = `https://placehold.co/400x240?text=${encodeURIComponent('Demo+Image')}`;
  return {
    name: name || suggestName(lat, lng),
    address: address || `座標: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    image,
    review: { rating: Number(rating.toFixed(1)), count: reviewCount, open_now: openNow, weekday_text: weekday, phone: '03-1234-5678' }
  };
}

function renderDemoCard(d) {
  const stars = renderStars(d.review?.rating);
  const count = d.review?.count ? `<span style=\"font-size:12px;color:#666;\">（${d.review.count}）</span>` : '';
  const open = d.review?.open_now === true ? '<span style="color:#0a7c2f;margin-left:6px">営業中</span>' : (d.review?.open_now === false ? '<span style="color:#b00020;margin-left:6px">営業時間外</span>' : '');
  const hours = Array.isArray(d.review?.weekday_text)
    ? `<details style=\"font-size:12px;color:#444;margin-top:6px\"><summary>営業時間</summary>${d.review.weekday_text.map((h) => `<div>${escapeHtml(h)}</div>`).join('')}</details>`
    : '';
  const phone = d.review?.phone ? `<div style=\"font-size:12px;color:#444;margin-top:4px\">TEL: ${escapeHtml(d.review.phone)}</div>` : '';
  const img = d.image ? `<img src=\"${d.image}\" alt=\"img\" style=\"width:100%;height:180px;object-fit:cover;border-radius:8px;background:#fafafa\"/>` : '';
  return `
    <div style=\"border:1px solid #f0f0f0;border-radius:8px;padding:8px\">
      ${img}
      <div style=\"font-size:12px;color:#666;margin-top:6px\">${escapeHtml(d.address || '')}</div>
      <div style=\"margin-top:6px\">${stars} ${count} ${open}</div>
      ${hours}
      ${phone}
    </div>`;
}

function renderStars(rating) {
  if (!rating && rating !== 0) return '';
  const num = Number(rating);
  if (!Number.isFinite(num)) return '';
  const full = Math.floor(num);
  const half = num - full >= 0.5;
  let html = '<span style="line-height:1">';
  for (let i = 0; i < full; i++) html += '<span style="font-size:16px">★</span>';
  if (half) html += '<span style="font-size:16px">☆</span>';
  return html + ` <span style=\"font-size:12px;color:#666;\">${num.toFixed(1)}</span></span>`;
}

function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// === ルート描画ユーティリティ ===
function extractRouteLineString(resp) {
  const route = resp && resp.Routes && resp.Routes[0];
  if (!route) return [];
  const coords = [];
  (route.Legs || []).forEach((leg) => {
    const ls = (leg.Geometry && leg.Geometry.LineString)
      || (leg.VehicleLegDetails && leg.VehicleLegDetails.Geometry && leg.VehicleLegDetails.Geometry.LineString)
      || (leg.PedestrianLegDetails && leg.PedestrianLegDetails.Geometry && leg.PedestrianLegDetails.Geometry.LineString);
    if (Array.isArray(ls)) { coords.push(...ls); return; }
    const steps = (leg.VehicleLegDetails && leg.VehicleLegDetails.TravelSteps)
      || (leg.PedestrianLegDetails && leg.PedestrianLegDetails.TravelSteps)
      || leg.TravelSteps;
    if (Array.isArray(steps)) {
      steps.forEach((s) => { if (s.Geometry && Array.isArray(s.Geometry.LineString)) coords.push(...s.Geometry.LineString); });
    }
  });
  return coords;
}

function drawRouteOnMap(map, lineCoords, ids) {
  if (!map || !Array.isArray(lineCoords) || !lineCoords.length) return;
  const data = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords }, properties: {} }] };
  if (map.getSource(ids.source)) {
    map.getSource(ids.source).setData(data);
  } else {
    map.addSource(ids.source, { type: 'geojson', data });
    map.addLayer({ id: ids.layer, type: 'line', source: ids.source, paint: { 'line-width': 5, 'line-color': '#2c7be5' } });
  }
  const lons = lineCoords.map((c) => c[0]);
  const lats = lineCoords.map((c) => c[1]);
  const minLng = Math.min(...lons), maxLng = Math.max(...lons);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60 });
}

function clearRouteOnMap(map) {
  if (!map) return;
  if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
  if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
}

// === Popup ボタンのイベントを安全に付与 ===
// moved inside MapPage component to capture routeTo/addPin scope.

// === ALS ReverseGeocode ===
async function reverseGeocodeALS(placesEndpoint, apiKey, lngLat, language = 'ja') {
  try {
    const url = `${placesEndpoint}/reverse-geocode?key=${encodeURIComponent(apiKey)}`;
    const body = { Language: language, MaxResults: 1, QueryPosition: lngLat };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    const json = await res.json();
    const item = Array.isArray(json?.ResultItems) ? json.ResultItems[0] : null;
    if (!item) return null;
    const title = item.Title || null;
    const addressLabel = item.Address?.Label || null;
    return { title, addressLabel, raw: item };
  } catch (e) {
    console.warn('ALS reverse geocode failed', e);
    return null;
  }
}

// === JSON → pin 正規化 ===
function normalizePinFromJson(o){
  if (!o) return null;
  const lat = toNum(o.lat ?? o.latitude);
  const lng = toNum(o.lng ?? o.lon ?? o.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const id = o.id ?? Date.now() + Math.floor(Math.random()*100000);
  const name = String(o.name ?? o.title ?? 'スポット');
  const description = String(o.description ?? o.note ?? '');
  const categoryWhitelist = ['visited','favorite','recommended','added','plan'];
  const category = categoryWhitelist.includes(o.category) ? o.category : 'recommended';
  const isAdded = !!o.isAdded; // 既定は false
  return { id, lat, lng, name, description, category, isAdded };
}
function toNum(x){ const n = Number(x); return Number.isFinite(n) ? n : NaN; }
