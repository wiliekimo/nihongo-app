// localStorage 包裝：所有讀寫都可能失敗（私密瀏覽、空間不足），一律 try/catch。
const PREFIX = 'nh.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

export const DEFAULT_SETTINGS = {
  scriptUrl: '',
  token: '',
  newPerDay: null,        // null = 用老師設定（data/teacher.json）
  sessionSize: 20,
  furigana: 'show',       // show | tap | hide
  autoplay: true,
  rate: 0.9,
};

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...load('settings', {}) };
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  save('settings', next);
  return next;
}

export function todayStr(ts = Date.now()) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
