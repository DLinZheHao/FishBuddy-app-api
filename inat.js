// src/inat.js
import 'dotenv/config';
import { getJSON, slugify } from './utils/utils.js';
// import { getTaxonDistribution } from './utils/taxon.js';

// 找地點 → 逐批抓觀察 → 彙整成「物種清單 + 多張照片」，並把照片網址統一成指定尺寸，方便前端或後續管線使用。


//  iNaturalist API 的 v2 版本根網址
const INAT_V2 = 'https://api.inaturalist.org/v2';
const INAT_V1 = 'https://api.inaturalist.org/v1';
// 台灣 Country 級 place_id（iNaturalist 標準國家）：
const TAIWAN_PLACE_ID = 7887;

const ND_SET = new Set(['cc-by-nd', 'cc-by-nc-nd']);

// place 祖先快取：place_id -> Set(ancestor_ids)
const PLACE_ANCESTORS = new Map();

// place 基本資料快取：place_id -> { id, name, display_name, place_type, admin_level, bbox_area, ancestor_place_ids }
// 用來檢查地點是不是已經搜尋過了，這樣就不用重複獲取
const PLACE_BASICS = new Map();

async function fetchPlacesBasic(placeIds) {
  // 輸入 id 格式整理
  const ids = [...new Set((placeIds || []).map(n => Number(n)).filter(Number.isInteger))];
  // 沒有被查詢過的在進行查詢
  const miss = ids.filter(id => !PLACE_BASICS.has(id));
  if (miss.length) {
    const fields = 'id,name,display_name,place_type,admin_level,bbox_area,ancestor_place_ids';
    const url = `${INAT_V1}/places/${miss.join(',')}?fields=${encodeURIComponent(fields)}`;
    const data = await getJSON(url);
    const results = Array.isArray(data?.results) ? data.results : [];
    for (const r of results) {
      PLACE_BASICS.set(r.id, {
        id: r.id,
        name: r.name,
        display_name: r.display_name ?? r.name ?? String(r.id),
        place_type: r.place_type ?? null,
        admin_level: (typeof r.admin_level === 'number') ? r.admin_level : null,
        bbox_area: (typeof r.bbox_area === 'number') ? r.bbox_area : null,
        ancestor_place_ids: Array.isArray(r.ancestor_place_ids) ? r.ancestor_place_ids.map(Number) : []
      });
    }
  }
  return ids.map(id => PLACE_BASICS.get(id)).filter(Boolean);
}

// 取得某個 taxon 的相簿（不經由 observations），作為備援
async function fetchTaxonPhotos(taxonId, photoSize = 'large') {
  const fields = 'taxon_photos.photo.url,taxon_photos.photo.license_code,taxon_photos.photo.attribution';
  const url = `${INAT_V2}/taxa/${taxonId}?fields=${encodeURIComponent(fields)}`;
  const data = await getJSON(url);
  const results = data?.results?.[0]?.taxon_photos ?? [];
  const out = [];
  for (const tp of results) {
    const p = tp?.photo;
    if (!p?.url) continue;
    out.push({
      url: upsizePhotoUrl(p.url, photoSize),
      license_code: (p.license_code || '').toLowerCase() || null,
      attribution: p.attribution || null,
      source: 'taxon_gallery'
    });
  }
  return out;
}

// 將縮圖網址換成需要的尺寸（square/small/medium/large/original）
function upsizePhotoUrl(url, size = 'large') {
  // 常見格式： .../photos/<id>/square.jpeg
  return url.replace(/\/(square|small|medium|large|original)\.(jpg|jpeg|png)$/i, `/${size}.$2`);
}

async function fetchPlaceAncestors(placeId) {
  if (PLACE_ANCESTORS.has(placeId)) return PLACE_ANCESTORS.get(placeId);
  const fields = 'id,ancestor_place_ids';
  const url = `${INAT_V1}/places/${placeId}?fields=${encodeURIComponent(fields)}`;
  const data = await getJSON(url);
  const anc = new Set((data?.results?.[0]?.ancestor_place_ids || []).map(Number).filter(Number.isInteger));
  PLACE_ANCESTORS.set(placeId, anc);
  return anc;
}

// 將 _placesMap 濃縮為地區清單，支援 'taiwan' 或 'global' 模式
async function refinePlaces(placesMap, scope = 'taiwan', taiwanId = TAIWAN_PLACE_ID) {
  // 1) 收集候選 place_id
  const entries = [...placesMap.values()]; // { place_id, observation_count }
  const candidates = entries.map(e => e.place_id);
  if (!candidates.length) return [];

  // 取得基礎資料
  const basics = await fetchPlacesBasic(candidates);
  const byId = new Map(basics.map(b => [b.id, b]));

  if (scope === 'taiwan') {
    // 2) 僅保留台灣階層：自己是台灣，或祖先包含台灣
    const keepIds = new Set();
    for (const b of basics) {
      if (!b) continue;
      if (b.id === taiwanId) { keepIds.add(b.id); continue; }
      const anc = new Set((b.ancestor_place_ids || []).map(Number).filter(Number.isInteger));
      if (anc.has(taiwanId)) keepIds.add(b.id);
    }
    if (keepIds.size === 0) return [];

    // 3) 同時有台灣與其子層 → 移除台灣本身，避免太大範圍混入
    if (keepIds.has(taiwanId) && [...keepIds].some(id => id !== taiwanId)) {
      keepIds.delete(taiwanId);
    }

    // 重新以 keepIds 建立基礎列表與索引
    const keptBasics = await fetchPlacesBasic([...keepIds]);
    const byIdTaiwan = new Map(keptBasics.map(b => [b.id, b]));

    // 4) 去祖先：若 A 的祖先包含 B，刪除 B（只留較細層）
    const resultSet = new Set(keepIds);
    for (const aId of keepIds) {
      const a = byIdTaiwan.get(aId);
      if (!a) continue;
      const anc = new Set((a.ancestor_place_ids || []).map(Number).filter(Number.isInteger));
      for (const bId of keepIds) {
        if (aId === bId) continue;
        if (anc.has(bId)) {
          resultSet.delete(bId);
        }
      }
    }

    // 5) 類型過濾：排除過大的層級（洲/海洋/區域）。允許 country 以便在沒有子層時仍可用。
    const EXCLUDE_TYPES = new Set(['continent', 'ocean', 'region']);
    const afterType = [...resultSet].filter(id => {
      const b = byIdTaiwan.get(id);
      return b ? !EXCLUDE_TYPES.has(b.place_type ?? '') : false;
    });
    if (afterType.length === 0) return [];

    // 6) 同型別/層級衝突 → 以 bbox_area 保留較小（更精確）
    const buckets = new Map(); // key: `${place_type}|${admin_level}` -> array of ids
    for (const id of afterType) {
      const b = byIdTaiwan.get(id);
      const key = `${b.place_type ?? 'unknown'}|${b.admin_level ?? 'na'}`;
      const arr = buckets.get(key) ?? [];
      arr.push(id);
      buckets.set(key, arr);
    }

    const finalIds = new Set();
    for (const arr of buckets.values()) {
      let best = arr[0];
      for (const id of arr) {
        const cur = byIdTaiwan.get(id);
        const bestB = byIdTaiwan.get(best);
        const curArea = (cur?.bbox_area ?? Number.POSITIVE_INFINITY);
        const bestArea = (bestB?.bbox_area ?? Number.POSITIVE_INFINITY);
        if (curArea < bestArea) best = id;
      }
      finalIds.add(best);
    }

    // 7) 以 observation_count 排序回傳（沿用原結構）
    const out = [...finalIds]
      .map(id => placesMap.get(id))
      .filter(Boolean)
      .sort((a, b) => b.observation_count - a.observation_count);
    return out;
  } else if (scope === 'taiwan_only') {
    // 只保留台灣本身以及其子層級（ancestor_place_ids 含 taiwanId）
    // 1) 篩選台灣及其子層
    const keepIds = new Set();
    for (const b of basics) {
      if (!b) continue;
      if (b.id === taiwanId) { keepIds.add(b.id); continue; }
      const anc = new Set((b.ancestor_place_ids || []).map(Number).filter(Number.isInteger));
      if (anc.has(taiwanId)) keepIds.add(b.id);
    }
    if (keepIds.size === 0) return [];

    // 2) 若同時有台灣與其子層，移除台灣本身
    if (keepIds.has(taiwanId) && [...keepIds].some(id => id !== taiwanId)) {
      keepIds.delete(taiwanId);
    }

    // 重新以 keepIds 建立基礎列表與索引
    const keptBasics = await fetchPlacesBasic([...keepIds]);
    const byIdTaiwan = new Map(keptBasics.map(b => [b.id, b]));

    // 3) 去祖先：只保留最細層（如果 A 的祖先包含 B，刪掉 B）
    const resultSet = new Set(keepIds);
    for (const aId of keepIds) {
      const a = byIdTaiwan.get(aId);
      if (!a) continue;
      const anc = new Set((a.ancestor_place_ids || []).map(Number).filter(Number.isInteger));
      for (const bId of keepIds) {
        if (aId === bId) continue;
        if (anc.has(bId)) {
          resultSet.delete(bId);
        }
      }
    }

    // 4) 同層級衝突：同型別與 admin_level，保留 bbox_area 較小的
    const buckets = new Map(); // key: `${place_type}|${admin_level}` -> array of ids
    for (const id of resultSet) {
      const b = byIdTaiwan.get(id);
      if (!b) continue;
      const key = `${b.place_type ?? 'unknown'}|${b.admin_level ?? 'na'}`;
      const arr = buckets.get(key) ?? [];
      arr.push(id);
      buckets.set(key, arr);
    }
    const finalIds = new Set();
    for (const arr of buckets.values()) {
      let best = arr[0];
      for (const id of arr) {
        const cur = byIdTaiwan.get(id);
        const bestB = byIdTaiwan.get(best);
        const curArea = (cur?.bbox_area ?? Number.POSITIVE_INFINITY);
        const bestArea = (bestB?.bbox_area ?? Number.POSITIVE_INFINITY);
        if (curArea < bestArea) best = id;
      }
      finalIds.add(best);
    }
    // 5) 依 observation_count 排序
    const out = [...finalIds]
      .map(id => placesMap.get(id))
      .filter(Boolean)
      .sort((a, b) => b.observation_count - a.observation_count);
    return out;
  } else if (scope === 'global') {
    // global 模式：保留所有輸入地區，但去除祖先，並同層級只留 bbox_area 最小
    // 1) 先去祖先：如果一個地區的祖先也存在，移除祖先（只留較細層）
    const inputIds = new Set(candidates);
    const resultSet = new Set(inputIds);
    for (const aId of inputIds) {
      const a = byId.get(aId);
      if (!a) continue;
      const anc = new Set((a.ancestor_place_ids || []).map(Number).filter(Number.isInteger));
      for (const bId of inputIds) {
        if (aId === bId) continue;
        if (anc.has(bId)) {
          resultSet.delete(bId);
        }
      }
    }
    // 2) 同型別/層級衝突 → 以 bbox_area 保留較小（更精確）
    const buckets = new Map(); // key: `${place_type}|${admin_level}` -> array of ids
    for (const id of resultSet) {
      const b = byId.get(id);
      if (!b) continue;
      const key = `${b.place_type ?? 'unknown'}|${b.admin_level ?? 'na'}`;
      const arr = buckets.get(key) ?? [];
      arr.push(id);
      buckets.set(key, arr);
    }
    const finalIds = new Set();
    for (const arr of buckets.values()) {
      let best = arr[0];
      for (const id of arr) {
        const cur = byId.get(id);
        const bestB = byId.get(best);
        const curArea = (cur?.bbox_area ?? Number.POSITIVE_INFINITY);
        const bestArea = (bestB?.bbox_area ?? Number.POSITIVE_INFINITY);
        if (curArea < bestArea) best = id;
      }
      finalIds.add(best);
    }
    // 依 observation_count 排序
    const out = [...finalIds]
      .map(id => placesMap.get(id))
      .filter(Boolean)
      .sort((a, b) => b.observation_count - a.observation_count);
    return out;
  } else {
    // 預設直接回傳排序
    return entries.sort((a, b) => b.observation_count - a.observation_count);
  }
}

// 取得物種分布（依 range → places → observations 優先順序）
/**
 * 依照「range → places → observations」的優先順序取得物種分布。
 * @param {number|string} taxonId
 * @returns {Promise<{ type: 'range', data: any } | { type: 'places', data: any } | { type: 'observations' }>}
 */
export async function getTaxonDistribution(taxonId) {
  const id = encodeURIComponent(taxonId);

  // Map-ready layers (Leaflet / Mapbox XYZ) – no server fetch, just URLs
  const layers = [
    // 1) Official / curated taxon range tiles (pink polygons on taxon pages). If none exist, tiles will be empty.
    { key: 'range_tiles',    type: 'xyz', url: `https://api.inaturalist.org/v1/taxon_ranges/${id}/{z}/{x}/{y}.png`,  minzoom: 0, maxzoom: 19 },

    // 2) Checklist places tiles (green polygons on taxon pages)
    { key: 'places_tiles',   type: 'xyz', url: `https://api.inaturalist.org/v1/taxon_places/${id}/{z}/{x}/{y}.png`,   minzoom: 0, maxzoom: 19 },

    // 3) Observation points tiles (clustered points)
    { key: 'points_tiles',   type: 'xyz', url: `https://api.inaturalist.org/v1/points/{z}/{x}/{y}.png?taxon_id=${id}&verifiable=true`, minzoom: 0, maxzoom: 19 },

    // 4) Observation heatmap tiles
    { key: 'heatmap_tiles',  type: 'xyz', url: `https://api.inaturalist.org/v1/heatmap/{z}/{x}/{y}.png?taxon_id=${id}&verifiable=true`, minzoom: 0, maxzoom: 19 }
  ];

  // Optional: a direct KML download for range (if available). Client may try to load/parse KML; if 404, ignore.
  const kml_url = `https://www.inaturalist.org/taxa/${id}/range.kml`;

  // Also try to provide a **filtered places list** (country/subcountry only) for legends / chips.
  // This is the only fetch in this function, and it is optional; errors are swallowed.
  let places = [];
  try {
    const placesUrl = `${INAT_V1}/taxa/${id}/places`;
    const data = await getJSON(placesUrl);
    const results = Array.isArray(data?.results) ? data.results : [];
    const EXCLUDE_TYPES = new Set(['continent', 'ocean', 'region']);
    places = results.filter(p => !EXCLUDE_TYPES.has(p.place_type));
  } catch (_) { /* ignore and proceed with tiles only */ }

  return { type: 'tiles', layers, kml_url, places };
}

// --- KML → GeoJSON (minimal, dependency-free) ---------------------------------
// 支援 <Polygon> 的 outerBoundary / innerBoundary；忽略 Point/LineString。
function _parseKmlCoordString(coordStr) {
  // KML coordinates: "lon,lat,alt lon,lat lon,lat" (separated by space/newline)
  const pts = [];
  const tokens = String(coordStr || '').trim().split(/\s+/);
  for (const t of tokens) {
    const parts = t.split(',');
    if (parts.length >= 2) {
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        pts.push([lon, lat]);
      }
    }
  }
  // Ensure first == last for rings
  if (pts.length > 2) {
    const f = pts[0];
    const l = pts[pts.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) pts.push([f[0], f[1]]);
  }
  return pts;
}

function kmlToGeoJSON(kmlText) {
  const text = String(kmlText || '');
  const polygons = [];

  // Extract each <Polygon>...</Polygon>
  const polyRegex = /<\s*Polygon\b[\s\S]*?<\s*\/\s*Polygon\s*>/gi;
  let polyMatch;
  while ((polyMatch = polyRegex.exec(text)) !== null) {
    const polyBlock = polyMatch[0];

    // outerBoundary
    const outerMatch = /<\s*outerBoundaryIs\b[\s\S]*?<\s*coordinates\s*>([\s\S]*?)<\s*\/\s*coordinates\s*>[\s\S]*?<\s*\/\s*outerBoundaryIs\s*>/i.exec(polyBlock);
    const outer = outerMatch ? _parseKmlCoordString(outerMatch[1]) : [];
    if (outer.length < 4) continue; // need at least 3 + closing point

    // innerBoundary (holes) – multiple possible
    const holes = [];
    const innerRegex = /<\s*innerBoundaryIs\b[\s\S]*?<\s*coordinates\s*>([\s\S]*?)<\s*\/\s*coordinates\s*>[\s\S]*?<\s*\/\s*innerBoundaryIs\s*>/gi;
    let innerMatch;
    while ((innerMatch = innerRegex.exec(polyBlock)) !== null) {
      const hole = _parseKmlCoordString(innerMatch[1]);
      if (hole.length >= 4) holes.push(hole);
    }

    polygons.push([outer, ...holes]);
  }

  if (polygons.length === 0) {
    return null; // unsupported or empty
  }

  // If multiple polygons → MultiPolygon; else Polygon
  if (polygons.length === 1) {
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: polygons[0] },
      properties: {}
    };
  } else {
    return {
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: polygons.map(rings => [rings[0], ...rings.slice(1)]) },
      properties: {}
    };
  }
}

// 下載 iNaturalist 的 KML 並嘗試轉成 GeoJSON（若無 range 會回 null）
export async function fetchTaxonRangeGeoJSON(taxonId) {
  const id = encodeURIComponent(taxonId);
  const kmlUrl = `https://www.inaturalist.org/taxa/${id}/range.kml`;
  try {
    const kmlText = await httpGet(kmlUrl, { headers: { 'Accept': 'application/vnd.google-earth.kml+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.5' } });
    const geo = kmlToGeoJSON(kmlText);
    return geo; // may be null if unsupported/empty
  } catch (e) {
    // 404 或其他網路錯誤都當作沒有 range
    return null;
  }
}

function findCoordinatePair(value) {
  if (!Array.isArray(value)) return null;
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
  }
  for (const item of value) {
    const nested = findCoordinatePair(item);
    if (nested) return nested;
  }
  return null;
}

function extractObservationCoordinates(obs) {
  if (!obs || typeof obs !== 'object') return null;
  const gj = obs.geojson;
  if (gj && typeof gj === 'object') {
    const pair = findCoordinatePair(gj.coordinates);
    if (pair) {
      const [lng, lat] = pair;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
  }

  const location = typeof obs.location === 'string' ? obs.location.trim() : '';
  if (location) {
    const parts = location.split(',').map(part => Number.parseFloat(part.trim()));
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      const [lat, lng] = parts;
      return { lat, lng };
    }
  }
  return null;
}

// 1) 由關鍵字找 place_id（例如 "Taiwan"）
// API: places，可以直接用 url request 取得 json 資料
// 用途：取回系統中的指定地點 ID
export async function resolvePlaceId(query) {
  const url = `${INAT_V2}/places?q=${encodeURIComponent(query)}&per_page=10&order_by=area`; // 把一段字串轉換成「安全的 URL 編碼格式」，避免特殊字元在網址裡造成錯誤或被誤解
  const data = await getJSON(url);
  const items = data?.results ?? [];
  if (!items.length) throw new Error(`找不到地點：${query}`);
  items.sort((a, b) => (a.admin_level ?? 999) - (b.admin_level ?? 999));
  // 取最高級別的資料，最符合需求
  return items[0].id;
}

// `qualityGrades`: quality grade filter for observations, default ['research']; accepts 'casual', 'needs_id', 'research' (can be array or single string)
// 2) 以 id_above 逐批抓觀察；加入 locale 與 preferred_place_id 讓常用名本地化
export async function* iterateObservations({
  taxonId,
  placeId,
  perPage = 200,
  max = 5000,
  locale = 'zh-TW',
  preferredPlaceId = TAIWAN_PLACE_ID,
  qualityGrades = ['research', 'needs_id']
}) {
  let fetched = 0;
  let idAbove = 0;
  const fields = [
    'id',
    'observed_on',
    'place_ids',
    'quality_grade',
    'taxon.id',
    'taxon.name',
    'taxon.rank',
    'taxon.preferred_common_name',
    'taxon.default_photo.square_url',
    'taxon.default_photo.license_code',
    'photos.url',
    'photos.license_code',
    'photos.attribution',
    'geojson',
    'location'
  ].join(',');


  // 在獲取足夠數量的資料前，會不斷地呼叫 fetch，並且內部的狀態值都會被保存
  while (fetched < max) {
    const url =
      `${INAT_V2}/observations?taxon_id=${taxonId}` +
      `&place_id=${placeId}` +
      `&quality_grade=${Array.isArray(qualityGrades) ? qualityGrades.join(',') : qualityGrades}&order_by=id&order=asc` +
      `&id_above=${idAbove}` +
      `&per_page=${perPage}` +
      `&locale=${encodeURIComponent(locale)}` +
      `&preferred_place_id=${encodeURIComponent(preferredPlaceId)}` +
      `&fields=${encodeURIComponent(fields)}`;

    const data = await getJSON(url, {
      // 加 Accept-Language 強化（非必需）
      headers: { 'Accept-Language': locale }
    });

    // 結果資料
    const results = data?.results ?? [];
    if (!results.length) break;

    // 每次呼叫 fetch 請求回來的資料多筆
    for (const obs of results) {
      yield obs; // 每一筆資料 (obs) 會透過 yield 送出去，讓外層 for await (const obs of iterateObservations(...)) { ... } 可以逐筆處理。
      fetched++;
      if (fetched >= max) break;
    }
    idAbove = results[results.length - 1].id;
  }
}

// 3) 物種彙整：每個 taxon 蒐集多張照片（授權過濾 + 尺寸放大）
export async function collectSpeciesWithPhoto({
  taxonId,
  placeId,
  perPage,
  max,
  licenseWhitelist,
  locale = 'zh-TW',
  preferredPlaceId = 97387,
  maxPhotosPerTaxon = 6,
  photoSize = 'large',
  forceFillToTarget = true,
  // 若嚴格授權下拿不到照片，是否允許以 ND（不允許衍生）授權作為備援
  allowNDFallback = true,
  taiwanPlaceId = TAIWAN_PLACE_ID
}) {
  const allow = new Set((licenseWhitelist || []).map(s => s.toLowerCase()));
  // const ND_SET = new Set(['cc-by-nd', 'cc-by-nc-nd']);
  const taxaMap = new Map(); // taxon_id -> { ... }
  const targetCount = Math.max(maxPhotosPerTaxon || 0, 0) || 6;
  const coordinateLimit = Math.max(targetCount, 50);

  for await (const obs of iterateObservations({
    taxonId, placeId, perPage, max, locale, preferredPlaceId: taiwanPlaceId
  })) {
    const tax = obs.taxon;
    if (!tax?.id) continue;

    // 取得或建立物種資料
    if (!taxaMap.has(tax.id)) {
      taxaMap.set(tax.id, {
        taxon_id: tax.id,
        scientific_name: tax.name || null,
        common_name: tax.preferred_common_name || null, // 已受 locale + preferred_place_id 影響
        rank: tax.rank || null,
        slug: slugify(tax.name || String(tax.id)),
        photos: [],
        nd_fallback: false,
        coordinates: [],
        places: [],
        _urlSet: new Set(),
        _coordSet: new Set(),
        _placesMap: new Map(),
        _ndCandidates: [], // 暫存 ND 授權候選
        _taxonPhotosFetched: false
      });
    }

    // 從 map 中，取出 set 得資料
    const entry = taxaMap.get(tax.id);

    const coords = extractObservationCoordinates(obs);
    if (coords && entry.coordinates.length < coordinateLimit) {
      const key = `${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`;
      if (!entry._coordSet.has(key)) {
        entry.coordinates.push({
          lat: coords.lat,
          lng: coords.lng,
          observation_id: obs.id ?? null,
          observed_on: obs.observed_on || null,
          quality_grade: obs.quality_grade || null,
          source: 'observation'
        });
        entry._coordSet.add(key);
      }
    }

    if (Array.isArray(obs.place_ids) && entry._placesMap.size < 5000) {
      const seen = new Set();
      for (const raw of obs.place_ids) {
        const pid = Number(raw);
        if (!Number.isInteger(pid) || seen.has(pid)) continue;
        seen.add(pid);
        const current = entry._placesMap.get(pid) ?? { place_id: pid, observation_count: 0 };
        current.observation_count += 1;
        entry._placesMap.set(pid, current);
      }
    }

    if (entry.photos.length >= targetCount) continue;

    // 蒐集觀察中的多張照片（授權過濾）
    if (Array.isArray(obs.photos)) {
      for (const p of obs.photos) {
        if (!p?.url) continue;
        const lc = (p.license_code || '').toLowerCase();
        const upsized = upsizePhotoUrl(p.url, photoSize);

        // 允許清單 → 直接納入
        if (allow.size === 0 || allow.has(lc)) {
          if (!entry._urlSet.has(upsized)) {
            entry.photos.push({ url: upsized, license_code: lc, attribution: p.attribution || null, source: 'observation' });
            entry._urlSet.add(upsized);
          }
        } else if (allowNDFallback) {
          // ND 候選：只有在最終沒有其他授權時才使用
          if (!entry._urlSet.has(upsized) && entry._ndCandidates.length < targetCount) {
            entry._ndCandidates.push({ url: upsized, license_code: lc, attribution: p.attribution || null, source: 'observation_nd' });
          }
        }

        if (entry.photos.length >= targetCount) break;
      }
    }

    // 若還不滿足上限，優先補 taxon_photos（主要圖源），最後才補 default_photo
    if (entry.photos.length < targetCount) {
      // 1) 主要圖源：taxon_photos（避免重複抓取）
      if (!entry._taxonPhotosFetched) {
        try {
          const tps = await fetchTaxonPhotos(entry.taxon_id, photoSize);
          for (const p of tps) {
            if (entry.photos.length >= targetCount) break;
            const lc = (p.license_code || '').toLowerCase();
            if (allow.size === 0 || allow.has(lc)) {
              if (!entry._urlSet.has(p.url)) {
                entry.photos.push({ ...p, source: 'taxon_gallery' });
                entry._urlSet.add(p.url);
              }
            } else if (allowNDFallback && ND_SET.has(lc)) {
              if (!entry._urlSet.has(p.url) && entry._ndCandidates.length < targetCount) {
                entry._ndCandidates.push({ ...p, source: 'taxon_gallery_nd' });
              }
            }
          }
        } catch (_) {
          // ignore
        } finally {
          entry._taxonPhotosFetched = true;
        }
      }

      // 2) 仍未滿 → 使用 taxon.default_photo 作為保底
      if (entry.photos.length < targetCount) {
        const tp = tax.default_photo;
        if (tp?.square_url) {
          const lc = (tp.license_code || '').toLowerCase();
          const upsized = upsizePhotoUrl(tp.square_url, photoSize);
          const allowDefault = (allow.size === 0 || !tp.license_code || allow.has(lc));
          if (allowDefault) {
            if (!entry._urlSet.has(upsized)) {
              entry.photos.push({ url: upsized, license_code: lc || null, attribution: null, source: 'taxon_default' });
              entry._urlSet.add(upsized);
            }
          } else if (allowNDFallback) {
            if (!entry._urlSet.has(upsized) && entry._ndCandidates.length < targetCount) {
              entry._ndCandidates.push({ url: upsized, license_code: lc, attribution: null, source: 'taxon_default_nd' });
            }
          }
        }
      }
    }
  }

  if (allowNDFallback) {
    for (const entry of taxaMap.values()) {
      if (entry.photos.length > 0 || entry._ndCandidates.length === 0) continue;
      const take = entry._ndCandidates.slice(0, targetCount);
      for (const p of take) {
        if (entry.photos.length >= targetCount) break;
        if (!entry._urlSet.has(p.url)) {
          entry.photos.push(p);
          entry._urlSet.add(p.url);
          entry.nd_fallback = true;
        }
      }
    }
  }

  // 最終補齊：即使授權不足，也盡量補到 targetCount（以利後續管線公平處理）
  if (forceFillToTarget) {
    for (const entry of taxaMap.values()) {
      if (entry.photos.length >= targetCount) continue;

      // a) 無視授權，再抓一次 taxon 相簿補圖
      try {
        const tps2 = await fetchTaxonPhotos(entry.taxon_id, photoSize);
        for (const p of tps2) {
          if (entry.photos.length >= targetCount) break;
          if (!entry._urlSet.has(p.url)) {
            entry.photos.push({ ...p, source: 'taxon_gallery_any_license', license_override: true });
            entry._urlSet.add(p.url);
          }
        }
      } catch (_) {}
    }
  }

  const entries = [...taxaMap.values()];
  // 先對每個物種的地區做濃縮
  for (const v of entries) {
    if (v._placesMap) {
      v.places = await refinePlaces(v._placesMap, 'taiwan_only', taiwanPlaceId);
      delete v._placesMap;
    }
    // 新增分布資訊
    try {
      v.distribution = await getTaxonDistribution(v.taxon_id);
    } catch (e) {
      v.distribution = { type: 'error', error: e?.message ?? String(e) };
    }
    // 若需要可互動的多邊形，嘗試抓 KML 並轉成 GeoJSON（MapKit 可直接用）
    try {
      const gj = await fetchTaxonRangeGeoJSON(v.taxon_id);
      if (gj) {
        v.range_geojson = gj;
      }
    } catch (_) {}
    if (v._urlSet) delete v._urlSet;
    if (v._coordSet) delete v._coordSet;
    if (v._ndCandidates) delete v._ndCandidates;
    if (v._taxonPhotosFetched) delete v._taxonPhotosFetched;
  }
  return entries;
}
