// src/inat.js
import 'dotenv/config';
import { getJSON, slugify } from './utils/utils.js';

// 找地點 → 逐批抓觀察 → 彙整成「物種清單 + 多張照片」，並把照片網址統一成指定尺寸，方便前端或後續管線使用。


//  iNaturalist API 的 v2 版本根網址
const INAT_V2 = 'https://api.inaturalist.org/v2';

const ND_SET = new Set(['cc-by-nd', 'cc-by-nc-nd']);

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
  preferredPlaceId = 97387,
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
    'photos.attribution'
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
  // 若 observations 皆無照片或被授權篩掉，是否改抓 taxon 的相簿作為備援
  tryTaxonPhotosOnEmpty = true,
  preferTaxonPhotos = true
}) {
  const allow = new Set((licenseWhitelist || []).map(s => s.toLowerCase()));
  // const ND_SET = new Set(['cc-by-nd', 'cc-by-nc-nd']);
  const taxaMap = new Map(); // taxon_id -> { ... }
  const targetCount = maxPhotosPerTaxon

  for await (const obs of iterateObservations({
    taxonId, placeId, perPage, max, locale, preferredPlaceId
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
        _urlSet: new Set(),
        _ndCandidates: [], // 暫存 ND 授權候選
        _taxonPhotosFetched: false
      });
    }

    // 從 map 中，取出 set 得資料
    const entry = taxaMap.get(tax.id);
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
      if (preferTaxonPhotos && !entry._taxonPhotosFetched) {
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

  // 若仍然沒有可用照片，嘗試抓 taxon 相簿或使用 ND 候選
  // for (const entry of taxaMap.values()) {
  //   if (entry.photos.length === 0) {
  //     let usedND = false;

  //     if (tryTaxonPhotosOnEmpty && !entry._taxonPhotosFetched) {
  //       try {
  //         const tps = await fetchTaxonPhotos(entry.taxon_id, photoSize);
  //         for (const p of tps) {
  //           if (entry.photos.length >= targetCount) break;
  //           const lc = (p.license_code || '').toLowerCase();
  //           if (allow.size === 0 || allow.has(lc)) {
  //             if (!entry._urlSet.has(p.url)) {
  //               entry.photos.push({ ...p, source: 'taxon_gallery' });
  //               entry._urlSet.add(p.url);
  //             }
  //           } else if (allowNDFallback && ND_SET.has(lc)) {
  //             if (!entry._urlSet.has(p.url) && entry._ndCandidates.length < targetCount) {
  //               entry._ndCandidates.push({ ...p, source: 'taxon_gallery_nd' });
  //             }
  //           }
  //         }
  //       } catch (_) {
  //         // 忽略備援請求失敗
  //       } finally {
  //         entry._taxonPhotosFetched = true;
  //       }
  //     }

  //     // 若仍無照片且允許 ND 備援 → 使用 ND 候選
  //     if (entry.photos.length === 0 && allowNDFallback && entry._ndCandidates.length) {
  //       const take = entry._ndCandidates.slice(0, targetCount);
  //       for (const p of take) {
  //         if (entry.photos.length >= targetCount) break;
  //         if (!entry._urlSet.has(p.url)) {
  //           entry.photos.push(p);
  //           entry._urlSet.add(p.url);
  //           usedND = true;
  //         }
  //       }
  //     }

  //     if (usedND) entry.nd_fallback = true;
  //   }
  // }

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

      if (entry.photos.length >= targetCount) continue;

      // b) 用 default_photo 的多尺寸變體做為保底（內容相同但多張供取樣）
      // const tp = entry.default_photo || entry.taxon_default || null; // 兼容性變數，若無則使用下方 tax 物件
      // const sizes = ['square','small','medium','large','original'];
      // if (!tp && entry.taxon_id) {
      //   // 嘗試從已存的照片找出一張做為基準
      //   const base = entry.photos[0]?.url || null;
      //   if (base) {
      //     for (const sz of sizes) {
      //       if (entry.photos.length >= targetCount) break;
      //       const variant = base.replace(/\/(square|small|medium|large|original)\.(jpg|jpeg|png)$/i, `/${sz}.$2`);
      //       if (!entry._urlSet.has(variant)) {
      //         entry.photos.push({ url: variant, license_code: null, attribution: null, source: 'size_variant' });
      //         entry._urlSet.add(variant);
      //       }
      //     }
      //   }
      // } else if (tp?.square_url) {
      //   for (const sz of sizes) {
      //     if (entry.photos.length >= targetCount) break;
      //     const variant = upsizePhotoUrl(tp.square_url, sz);
      //     if (!entry._urlSet.has(variant)) {
      //       entry.photos.push({ url: variant, license_code: (tp.license_code || '').toLowerCase() || null, attribution: null, source: 'taxon_default_variant' });
      //       entry._urlSet.add(variant);
      //     }
      //   }
      // }

      // if (entry.photos.length >= targetCount) continue;

      // c) 仍不足 → 允許重複相片（以 URL 查詢參數標記 dup），保證長度
      // let dupIdx = 0;
      // while (entry.photos.length < targetCount && entry.photos.length > 0) {
      //   const baseUrl = entry.photos[dupIdx % entry.photos.length].url;
      //   const dupUrl = baseUrl.includes('?') ? `${baseUrl}&dup=${dupIdx}` : `${baseUrl}?dup=${dupIdx}`;
      //   // 不把 dup 放入 _urlSet，避免影響真實去重邏輯
      //   entry.photos.push({ url: dupUrl, license_code: entry.photos[dupIdx % entry.photos.length].license_code || null, attribution: entry.photos[dupIdx % entry.photos.length].attribution || null, source: 'duplicate_fill' });
      //   dupIdx++;
      // }
    }
  }

  const out = [...taxaMap.values()].map(v => {
    if (v._urlSet) delete v._urlSet;
    if (v._ndCandidates) delete v._ndCandidates;
    if (v._taxonPhotosFetched) delete v._taxonPhotosFetched;
    return v;
  });
  return out;
}