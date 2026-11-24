// 學習進度與作答紀錄（本機），雲端同步見 sync.js。
import { load, save, todayStr } from './store.js';
import { review } from './srs.js';

const LOG_CAP = 3000;

export const getProgress = () => load('progress', {});
export const getLog = () => load('log', []);
export const getQueue = () => load('queue', []);

export function device() {
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Other';
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 記錄一次作答：更新排程、寫入紀錄、排入上傳佇列。
 */
export function recordAnswer({ word, type, theme, correct, ms, answer, expected, mode }) {
  const now = Date.now();
  const progress = getProgress();
  const before = progress[word.id];
  progress[word.id] = review(before, correct, ms, { schedule: mode === 'practice' || !correct, now });
  save('progress', progress);

  const entry = {
    id: uid(),
    ts: now,
    date: todayStr(now),
    wordId: word.id,
    word: word.word,
    type,
    theme: theme || '',
    correct,
    ms: Math.round(ms),
    answer,
    expected,
    mode,
    device: device(),
  };
  const log = getLog();
  log.push(entry);
  save('log', log.slice(-LOG_CAP));
  const queue = getQueue();
  queue.push(entry);
  save('queue', queue);
  return progress[word.id];
}

/** 合併兩份進度：每個字保留「最後作答時間」較新的那筆。 */
export function mergeProgress(a, b) {
  const out = { ...a };
  for (const [id, rec] of Object.entries(b || {})) {
    if (!out[id] || (rec.last || 0) > (out[id].last || 0)) out[id] = rec;
  }
  return out;
}

export function mergeLogs(local, incoming) {
  const seen = new Set(local.map((e) => e.id));
  const merged = local.concat((incoming || []).filter((e) => e && e.id && !seen.has(e.id)));
  merged.sort((x, y) => x.ts - y.ts);
  return merged.slice(-LOG_CAP);
}

export function exportAll() {
  return {
    exportedAt: new Date().toISOString(),
    progress: getProgress(),
    log: getLog(),
    queue: getQueue(),
    settings: { ...load('settings', {}), token: undefined },
  };
}

export function importAll(data) {
  if (!data || typeof data !== 'object') throw new Error('檔案格式不正確');
  if (data.progress) save('progress', mergeProgress(getProgress(), data.progress));
  if (Array.isArray(data.log)) save('log', mergeLogs(getLog(), data.log));
}

export function resetAll() {
  save('progress', {});
  save('log', []);
  save('queue', []);
  save('syncMeta', {});
}
