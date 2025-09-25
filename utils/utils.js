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