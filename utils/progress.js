// utils/progress.js
// 簡易 ASCII 進度條
export function printProgress(current, total, width = 30) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const clamped = Math.min(Math.max(0, Number(current) || 0), safeTotal);
  const percent = Math.floor((clamped / safeTotal) * 100);
  const filled = Math.floor((percent / 100) * width);
  const bar = '█'.repeat(filled) + '-'.repeat(width - filled);
  process.stdout.write(`\r[${bar}] ${percent}% (${clamped}/${safeTotal})`);
  if (clamped === safeTotal) process.stdout.write('\n');
}

