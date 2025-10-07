// src/utils.js

// 小工具：安全取 JSON（含簡單重試）
export async function getJSON(url, { headers = {}, retry = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < retry; i++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 600 * (i + 1))); // 指數回退
    }
  }
  throw lastErr;
}

// 乾淨字串
export const clean = s => (s ?? '').toString().trim();

// 產出檔名安全的 slug
export function slugify(s) {
  return clean(s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}


// 小工具：科名拆成 Genus/Species
export function splitSciName(name = '') {
  const [Genus, ...rest] = String(name).trim().split(/\s+/);
  return { Genus, Species: rest.join(' ') };
}

// 正規化學名：Genus 首字大寫，其餘小寫；Species 只取第一個詞（避免帶到亞種/變種）
export function normalizeSciParts(name = '') {
  const raw = String(name).trim().replace(/\s+/g, ' ');
  if (!raw) return { Genus: '', Species: '', Sub: '' };
  const [g, s, ...rest] = raw.split(' ');
  const Genus = g ? (g[0].toUpperCase() + g.slice(1).toLowerCase()) : '';
  const Species = s ? s.toLowerCase() : '';
  const Sub = rest.length ? rest.join(' ') : '';
  return { Genus, Species, Sub };
}

// 小工具：對外請求（含逾時）
export async function httpGet(url, { timeoutMs = 10000, headers = {} } = {}) {
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