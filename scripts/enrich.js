// enrich.js
import { setTimeout as delay } from 'node:timers/promises';
import { printProgress } from '../utils/progress.js';

const WIKI_ORIGIN = 'https://{lang}.wikipedia.org/api/rest_v1/page/summary/';

// 小工具：科名拆成 Genus/Species
function splitSciName(name = '') {
  const [Genus, ...rest] = String(name).trim().split(/\s+/);
  return { Genus, Species: rest.join(' ') };
}

// 正規化學名：Genus 首字大寫，其餘小寫；Species 只取第一個詞（避免帶到亞種/變種）
function normalizeSciParts(name = '') {
  const raw = String(name).trim().replace(/\s+/g, ' ');
  if (!raw) return { Genus: '', Species: '', Sub: '' };
  const [g, s, ...rest] = raw.split(' ');
  const Genus = g ? (g[0].toUpperCase() + g.slice(1).toLowerCase()) : '';
  const Species = s ? s.toLowerCase() : '';
  const Sub = rest.length ? rest.join(' ') : '';
  return { Genus, Species, Sub };
}

// 小工具：對外請求（含逾時）
async function httpGet(url, { timeoutMs = 10000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

// 取得 Wikipedia 摘要（不做內部語言 fallback）
// 回傳 {title, extract, url, lang, variant, query} 或 null
export async function fetchWikipediaSummary(query, { lang = 'zh', variant = 'zh-TW', timeoutMs = 10000 } = {}) {
  const title = encodeURIComponent(query);
  const langForDomain = String(lang).startsWith('zh') ? 'zh' : lang;
  const url = WIKI_ORIGIN.replace('{lang}', langForDomain) + title;
  try {
    const data = await httpGet(url, {
      timeoutMs,
      headers: { 'Accept-Language': variant }
    });
    if (data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
      return null;
    }
    const pageUrl = data.content_urls?.desktop?.page || data.content_urls?.mobile?.page;
    // 使用 displaytitle（依變體轉換後的顯示標題）；若無則退回原始 title。
    const clean = (s) => String(s || '').replace(/<[^>]*>/g, '').trim();
    const variantTitle = data.displaytitle ? clean(data.displaytitle) : clean(data.title);
    const finalUrl = pageUrl ? `${pageUrl}${pageUrl.includes('?') ? '&' : '?'}variant=${encodeURIComponent(String(variant).toLowerCase())}` : undefined;
    return { title: variantTitle, canonical_title: data.title, extract: data.extract, url: finalUrl, lang, variant, query };
  } catch {
    return null;
  }
}

// ── Wikipedia Action API: GET 工具 ────────────────────────────────────────────
async function wikiApiGet(lang, params) {
  const langForDomain = String(lang).startsWith('zh') ? 'zh' : lang;
  const base = `https://${langForDomain}.wikipedia.org/w/api.php`;
  const qs = new URLSearchParams({
    format: 'json',
    formatversion: '2',
    origin: '*', // 為了通用，雖然 Node 不需要
    ...params
  });
  const headers = params?.variant ? { 'Accept-Language': String(params.variant) } : {};
  return await httpGet(`${base}?${qs.toString()}`, { headers });
}

// 簡單把 HTML 片段轉純文字（足夠顯示；未來需要可換更嚴謹 parser）
function stripHtml(html = '') {
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 依多語關鍵字找章節，並抓回內容
async function fetchWikipediaSections(titleOrSciName, { lang = 'zh', variant = 'zh-tw' } = {}) {
  // 章節別名（中／英＋常見變體）
  const KEYWORDS = {
    distribution: [/分布|分佈|產地|棲地|分布與棲地/i, /distribution|range|habitat/i],
    description: [/特徵|形態|形態特徵|外觀/i, /description|morphology|appearance/i],
    ecology: [/生態|習性|生活史/i, /ecology|behavio(u)?r|life history|habitat/i],
    economic_use: [/經濟|利用|食用|人類利用/i, /economic|uses|human use|fishery/i],
  };

  // 1) 取得條目標題（不少情況 page 名會跟學名不同）
  // 先用 summary 取得最終標題；失敗則直接用傳入字串
  let title = titleOrSciName;
  try {
    const sum = await fetchWikipediaSummary(titleOrSciName, { lang, variant: variant.toUpperCase() });
    if (sum?.title) { title = sum.title; }
  } catch { /* ignore */ }

  // 2) 列章節
  const secListResp = await wikiApiGet(lang, {
    action: 'parse',
    page: title,
    prop: 'sections',
    variant,
  });
  const sections = secListResp?.parse?.sections || [];

  // 建立映射：章節名稱 -> 索引
  const byName = new Map(); // line(lowercased) -> index
  for (const s of sections) {
    // s.line 是章節顯示名稱
    byName.set(String(s.line).toLowerCase(), s.index);
  }

  // 工具：依關鍵字陣列在 sections 裡模糊比對
  const findIndexByRegexes = (regexes) => {
    for (const rx of regexes) {
      const hit = sections.find(s => rx.test(String(s.line)));
      if (hit) return hit.index;
    }
    return null;
  };

  const want = {
    distribution: findIndexByRegexes([...KEYWORDS.distribution]),
    description: findIndexByRegexes([...KEYWORDS.description]),
    ecology: findIndexByRegexes([...KEYWORDS.ecology]),
    economic_use: findIndexByRegexes([...KEYWORDS.economic_use]),
  };

  // 3) 把命中的章節抓回 HTML，再轉純文字
  const fetchOne = async (idx) => {
    if (!idx) return null;
    const res = await wikiApiGet(lang, {
      action: 'parse',
      page: title,
      prop: 'text',
      section: idx,
      variant,
    });
    const html = res?.parse?.text || '';
    return html ? stripHtml(html) : null;
  };

  const [distribution, description, ecology, economic_use] = await Promise.all([
    fetchOne(want.distribution),
    fetchOne(want.description),
    fetchOne(want.ecology),
    fetchOne(want.economic_use),
  ]);

  return { distribution, description, ecology, economic_use };
}


// 主函數：逐筆補資料
export async function enrichSpeciesMeta(items, { sources = ['wikipedia'], timeoutMs = 10000, progress = true, progressBarWidth = 30 } = {}) {
  const doWiki = sources.includes('wikipedia');

  const out = [];
  const total = items.length;
  let i = 0;
  for (const it of items) {
    const copy = JSON.parse(JSON.stringify(it));
    const sci = it.scientific_name || it.sciname || '';
    const { Genus, Species } = splitSciName(sci);
    const norm = normalizeSciParts(sci);
    const GenusN = norm.Genus;
    const SpeciesN = norm.Species;

    // Wikipedia 三段式查詢：sci@zh → common_name@zh → sci@en
    if (doWiki && sci) {
      copy.meta = copy.meta || {};
      let wikiSummary = null;
      let wikiStrategy = null;
      let wikiQueryUsed = null;

      // 1) 學名（繁中）
      wikiSummary = await fetchWikipediaSummary(sci, { lang: 'zh', variant: 'zh-TW', timeoutMs });
      if (wikiSummary) { wikiStrategy = 'sci_zh'; wikiQueryUsed = sci; }

      // 2) 若無，且有 common_name，以 common_name 查繁中
      if (!wikiSummary) {
        const cname = it.common_name || it.commonName || null;
        if (cname) {
          wikiSummary = await fetchWikipediaSummary(cname, { lang: 'zh', variant: 'zh-TW', timeoutMs });
          if (wikiSummary) { wikiStrategy = 'common_zh'; wikiQueryUsed = cname; }
        }
      }

      // 3) 若仍無，學名查英文
      if (!wikiSummary) {
        wikiSummary = await fetchWikipediaSummary(sci, { lang: 'en', variant: 'en', timeoutMs });
        if (wikiSummary) { wikiStrategy = 'sci_en'; wikiQueryUsed = sci; }
      }

      copy.meta.wikipedia = wikiSummary ? { ...wikiSummary, strategy: wikiStrategy, query: wikiQueryUsed } : null;

      // 章節內容（沿用決定後的語言與變體）
      if (wikiSummary?.title) {
        try {
          const sec = await fetchWikipediaSections(wikiSummary.title, {
            lang: wikiSummary.lang || 'zh',
            variant: (wikiSummary.variant || 'zh-TW').toLowerCase(),
          });
          if (copy.meta.wikipedia) {
            copy.meta.wikipedia.sections = sec;
          } else {
            copy.meta.wikipedia = { sections: sec };
          }
        } catch { /* ignore sections error */ }
      }

      await delay(50);
    }

    out.push(copy);
    i++;
    if (progress) {
      printProgress(i, total, progressBarWidth);
    }
  }
  return out;
}
