// scripts/fetchInat.js
import { ensureDirs } from '../utils/fs.js';
import { resolvePlaceId, collectSpeciesWithPhoto } from '../inat.js';

let enrichSpeciesMeta = null;
export async function main() {
  await ensureDirs();

  // 搜尋條件
  const placeQuery = process.env.INAT_PLACE_QUERY || 'Taiwan';
  const taxonId = Number(process.env.INAT_TAXON_ID || 47178);
  const perPage = Number(process.env.INAT_PER_PAGE || 200);
  const max = Number(process.env.INAT_MAX_OBS || 5000);
  const licenseWhitelist = (process.env.PHOTO_LICENSE_WHITELIST || 'cc0,cc-by,cc-by-sa')
    .split(',').map(s => s.trim()).filter(Boolean);

  const locale = process.env.INAT_LOCALE || 'zh-TW';
  const preferredPID = Number(process.env.INAT_PREFERRED_PLACE_ID || 97387);
  const maxPhotos = Number(process.env.MAX_PHOTOS_PER_TAXON || 6);
  const photoSize = process.env.INAT_PHOTO_SIZE || 'large';

  // 只有開啟補充內容模式才會走 wiki 內容抓取
  const ENABLE_ENRICH = process.env.ENRICH_METADATA === '1';
  const ENRICH_SOURCES = (process.env.ENRICH_SOURCES || 'wikipedia')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean); // 把 """ 空字串、null、undefined 過濾
  const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 10000);

  if (ENABLE_ENRICH) {
    // 載入補充模式辦法
    try {
      ({ enrichSpeciesMeta } = await import('./enrich.js'));
    } catch (e) {
      console.warn('⚠️ 無法載入 enrich.js；將跳過補充資訊。', e?.message || e);
    }
  }

  // 先查詢地點的 ID
  console.log(`🔎 解析地點：「${placeQuery}」→ place_id ...`);
  const placeId = await resolvePlaceId(placeQuery);
  console.log(`✅ place_id = ${placeId}`);
  console.log(`⬇️ 下載 iNaturalist (taxon=${taxonId}, place=${placeId}, locale=${locale}) ...`);

  // 建立物種基本名稱資料、圖片（放入上方設置好的條件）
  const species = await collectSpeciesWithPhoto({
    taxonId,
    placeId,
    perPage,
    max,
    licenseWhitelist,
    locale,
    preferredPlaceId: preferredPID,
    maxPhotosPerTaxon: maxPhotos,
    photoSize
  });

  // 補充模式
  let enriched = species;
  if (ENABLE_ENRICH && typeof enrichSpeciesMeta === 'function') {
    try {
      enriched = await enrichSpeciesMeta(species, {
        sources: ENRICH_SOURCES,
        timeoutMs: HTTP_TIMEOUT_MS,
      });
    } catch (e) {
      console.warn('⚠️ 補充步驟發生錯誤：', e?.message || e);
    }
  }

  const fs = await import('node:fs/promises');

  // 輸出結果
  const out = {
    source: 'iNaturalist',
    locale,
    preferred_place_id: preferredPID,
    place_query: placeQuery,
    place_id: placeId,
    taxon_id: taxonId,
    license_whitelist: licenseWhitelist,
    total_species: species.length,
    enriched: ENABLE_ENRICH,
    enrich_sources: ENABLE_ENRICH ? ENRICH_SOURCES : [],
    items: ENABLE_ENRICH ? enriched : species
  };

  await fs.writeFile('data/raw/inat_fishes_tw.json', JSON.stringify(out, null, 2), 'utf8');
  console.log(`💾 已輸出：data/raw/inat_fishes_tw.json（物種數：${(ENABLE_ENRICH ? enriched : species).length}，含補充欄位：${ENABLE_ENRICH}）`);
}