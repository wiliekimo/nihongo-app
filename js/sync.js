// 雲端同步：透過 Google Apps Script 寫入你自己的 Google 試算表。
// 沒網路時紀錄留在手機的佇列，下次有網路自動補傳。
import { load, save, getSettings } from './store.js';
import { getProgress, getQueue, getLog, mergeProgress, mergeLogs, device } from './state.js';

let inflight = null;
const listeners = new Set();

export const onSyncChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(syncStatus()); } catch { /* ignore */ } });

export function syncStatus() {
  const s = getSettings();
  const meta = load('syncMeta', {});
  return {
    configured: !!(s.scriptUrl && s.token),
    syncing: !!inflight,
    pending: getQueue().length,
    lastSync: meta.lastSync || 0,
    lastError: meta.lastError || '',
  };
}

async function post(url, body) {
  // 不設定 Content-Type（預設 text/plain），避免 CORS 預檢；Apps Script 會 302 轉址到回應內容。
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('回應不是 JSON，請確認 Apps Script 已用「網頁應用程式」部署，且存取權為「所有人」');
  }
}

export async function testConnection(url, token) {
  const r = await post(url, { action: 'ping', token });
  if (!r.ok) throw new Error(r.error || '連線失敗');
  return r;
}

export function sync() {
  if (inflight) return inflight;
  const s = getSettings();
  if (!s.scriptUrl || !s.token) return Promise.resolve({ skipped: true });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve({ offline: true });

  const meta = load('syncMeta', {});
  const queue = getQueue();
  const batch = queue.slice(0, 500);
  const body = {
    action: 'sync',
    token: s.token,
    device: device(),
    logs: batch,
    progress: getProgress(),
    since: meta.serverSince || 0,
  };

  inflight = (async () => {
    try {
      const r = await post(s.scriptUrl, body);
      if (!r.ok) throw new Error(r.error || '同步失敗');
      const sent = new Set(batch.map((e) => e.id));
      save('queue', getQueue().filter((e) => !sent.has(e.id)));
      save('progress', mergeProgress(getProgress(), r.progress || {}));
      const incoming = r.logs || [];
      save('log', mergeLogs(getLog(), incoming));
      const maxTs = incoming.reduce((m, e) => Math.max(m, e.ts || 0), meta.serverSince || 0);
      save('syncMeta', { lastSync: Date.now(), lastError: '', serverSince: maxTs });
      return { ok: true, more: queue.length > batch.length };
    } catch (e) {
      save('syncMeta', { ...meta, lastError: String(e.message || e) });
      return { ok: false, error: String(e.message || e) };
    } finally {
      inflight = null;
      emit();
    }
  })();
  emit();
  return inflight.then(async (r) => (r.ok && r.more ? sync() : r));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => sync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && getQueue().length) sync();
  });
}
