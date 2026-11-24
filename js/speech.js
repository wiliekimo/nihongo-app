// 瀏覽器內建語音（Web Speech API）。iOS / Android / 桌機 Chrome 都有日文與英文語音。
import { getSettings } from './store.js';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];

function refreshVoices() {
  if (!synth) return;
  voices = synth.getVoices();
}
if (synth) {
  refreshVoices();
  synth.addEventListener?.('voiceschanged', refreshVoices);
}

export const canSpeak = () => !!synth && typeof SpeechSynthesisUtterance !== 'undefined';

function pickVoice(lang) {
  const base = lang.slice(0, 2);
  const list = voices.filter((v) => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith(base));
  if (!list.length) return null;
  const exact = list.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
  const pool = exact.length ? exact : list;
  return pool.find((v) => /premium|enhanced|natural|google/i.test(v.name)) || pool.find((v) => v.localService) || pool[0];
}

export function hasVoice(lang) {
  if (!canSpeak()) return false;
  if (!voices.length) return true; // 語音清單還沒載入，先假設有
  return !!pickVoice(lang);
}

export function speak(text, lang = 'ja-JP') {
  if (!canSpeak() || !text) return;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.rate = getSettings().rate || 0.9;
    synth.speak(u);
  } catch { /* ignore */ }
}
