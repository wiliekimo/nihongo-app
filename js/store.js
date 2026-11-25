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

export const SETTINGS_VERSION = 2;
export const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  scriptUrl: '',
  token: '',
  newPerDay: null,        // null = 用老師設定（data/teacher.json）
  sessionSize: 20,
  script: 'kana',         // 題目文字：kana（只用假名）| kanji（漢字＋振假名）
  listening: false,       // 是否出聽力題
  furigana: 'show',       // show | tap | hide（單字頁與漢字模式）
  autoplay: false,        // 作答後自動播放發音
  rate: 0.9,
};

export function getSettings() {
  const saved = load('settings', {});
  if ((saved.v || 1) < 2) {
    // v2：使用者希望在外面不出聲、題目不顯示漢字
    Object.assign(saved, { v: 2, script: 'kana', listening: false, autoplay: false });
    save('settings', saved);
  }
  return { ...DEFAULT_SETTINGS, ...saved };
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
