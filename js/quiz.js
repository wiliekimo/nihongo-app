// 出題邏輯：今日練習（間隔重複）與隨機小考。
import { allWords } from './data.js';
import { renderJa, blankEn, esc } from './furigana.js';
import { stage, isDue } from './srs.js';
import { canSpeak } from './speech.js';
import { getSettings } from './store.js';

/** 今天開始學的新字數（由進度推算，跨裝置一致）。 */
function newToday(progress, now = Date.now()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  return Object.values(progress).filter((r) => (r.first || 0) >= start).length;
}

export const TYPES = {
  meaning: '意思',
  word: '單字',
  listen: '聽力',
  cloze: '填空',
  say: '怎麼說',
  english: '英文',
};
const EXAMPLE_TYPES = ['cloze', 'say', 'english'];

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightedPick(items, weightOf) {
  const ws = items.map((x) => Math.max(0, weightOf(x)));
  const total = ws.reduce((s, w) => s + w, 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function pickDistractors(correct, pool, keyOf, n = 3) {
  const seen = new Set([keyOf(correct).toLowerCase()]);
  const out = [];
  for (const x of shuffle(pool)) {
    const k = keyOf(x).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
    if (out.length >= n) break;
  }
  return out;
}

function pickExample(word, teacher, theme) {
  if (theme) {
    const ex = word.examples.find((e) => e.theme === theme);
    if (ex) return ex;
  }
  const tw = teacher?.focus?.themes || {};
  return weightedPick(word.examples, (e) => tw[e.theme] ?? 1);
}

function pickType(word, rec, teacher, { onlyExampleTypes = false } = {}) {
  const fresh = !rec || (rec.correct === 0);
  let types = fresh ? ['meaning', 'listen'] : Object.keys(TYPES);
  if (onlyExampleTypes) types = EXAMPLE_TYPES;
  if (!canSpeak() || !getSettings().listening) types = types.filter((t) => t !== 'listen');
  if (!types.length) types = ['meaning'];
  const tw = teacher?.focus?.types || {};
  return weightedPick(types, (t) => tw[t] ?? 1);
}

/** 產生一題。 */
export function makeQuestion(word, type, { teacher, theme } = {}) {
  const words = allWords();
  const others = words.filter((w) => w.id !== word.id);
  const kanaMode = getSettings().script !== 'kanji';
  // 題目裡顯示的日文：假名模式只用讀音，不出現漢字
  const jaWord = (w) => `<span class="ja" lang="ja">${esc(kanaMode ? w.reading : w.word)}</span>`;
  const wordKey = (w) => (kanaMode ? w.reading : w.word);
  const q = { type, word, theme: null, example: null, options: [], answer: '', promptHtml: '', speak: null };

  const optionList = (correctItem, distractors, labelOf, valueOf, subOf) =>
    shuffle([correctItem, ...distractors]).map((x) => ({ label: labelOf(x), value: valueOf(x), sub: subOf ? subOf(x) : '' }));

  switch (type) {
    case 'meaning': {
      const ds = pickDistractors(word, others, (w) => w.zh);
      q.promptHtml = kanaMode
        ? `<div class="big ja" lang="ja">${esc(word.reading)}</div>`
        : `<div class="big ja" lang="ja">${esc(word.word)}</div><div class="reading ja furi-line" lang="ja">${esc(word.reading)}</div>`;
      q.options = optionList(word, ds, (w) => esc(w.zh), (w) => w.zh);
      q.answer = word.zh;
      q.speak = { text: word.reading, lang: 'ja-JP' };
      q.ask = '這個字是什麼意思？';
      break;
    }
    case 'word': {
      const samePos = others.filter((w) => w.pos === word.pos);
      const ds = pickDistractors(word, samePos.length >= 3 ? samePos : others, wordKey);
      q.promptHtml = `<div class="mid">${esc(word.zh)}</div><div class="hint">${esc(word.en)}</div>`;
      q.options = optionList(word, ds, jaWord, (w) => w.word);
      q.answer = word.word;
      q.ask = '日文怎麼說？';
      break;
    }
    case 'listen': {
      const ds = pickDistractors(word, others, (w) => w.word);
      q.promptHtml = `<button class="icon-btn lg" data-action="replay" aria-label="再聽一次">${SPEAKER_SVG}</button>`;
      q.options = optionList(word, ds, (w) => `<span class="ja" lang="ja">${esc(w.word)}</span>`, (w) => w.word);
      q.answer = word.word;
      q.speak = { text: word.reading, lang: 'ja-JP', auto: true };
      q.ask = '聽到的是哪個字？';
      break;
    }
    case 'cloze': {
      const ex = pickExample(word, teacher, theme);
      const samePos = others.filter((w) => w.pos === word.pos);
      const ds = pickDistractors(word, samePos.length >= 3 ? samePos : others, wordKey);
      q.example = ex; q.theme = ex.theme;
      q.promptHtml = `<div class="scene">${esc(ex.scene)}</div><div class="mid ja" lang="ja">${renderJa(ex.ja, { blank: true, kana: kanaMode })}</div><div class="hint">${esc(ex.zh)}</div>`;
      q.options = optionList(word, ds, jaWord, (w) => w.word, (w) => (kanaMode ? '' : w.reading));
      q.answer = word.word;
      q.ask = '空格要填哪個字？（選項為原形）';
      break;
    }
    case 'say': {
      const ex = pickExample(word, teacher, theme);
      const pool = words.flatMap((w) => (w.id === word.id ? [] : w.examples.filter((e) => e.theme === ex.theme)));
      const ds = pickDistractors(ex, pool, (e) => e.ja);
      q.example = ex; q.theme = ex.theme;
      q.promptHtml = `<div class="scene">${esc(ex.scene)}</div><div class="mid">「${esc(ex.zh)}」</div>`;
      q.options = optionList(ex, ds, (e) => `<span class="ja" lang="ja">${renderJa(e.ja, { highlight: false, kana: kanaMode })}</span>`, (e) => e.ja);
      q.answer = ex.ja;
      q.sentence = true;
      q.ask = '你想這樣說，日文要怎麼講？';
      break;
    }
    case 'english': {
      const ex = pickExample(word, teacher, theme);
      const pool = words.flatMap((w) => (w.id === word.id ? [] : w.examples));
      const ds = pickDistractors(ex, pool, (e) => e.enFocus);
      q.example = ex; q.theme = ex.theme;
      q.promptHtml = `<div class="scene">${esc(ex.scene)}</div><div class="mid" lang="en">${blankEn(ex.en, ex.enFocus)}</div><div class="hint">${esc(ex.zh)}</div>`;
      q.options = optionList(ex, ds, (e) => esc(e.enFocus), (e) => e.enFocus);
      q.answer = ex.enFocus;
      q.ask = '英文空格要填什麼？';
      break;
    }
    default:
      throw new Error(`unknown type ${type}`);
  }
  return q;
}

/** 今日練習：先複習到期的字，再加新字。 */
export function buildPractice({ progress, teacher, settings, now = Date.now() }) {
  const words = allWords();
  const due = words.filter((w) => isDue(progress[w.id], now)).sort((a, b) => progress[a.id].due - progress[b.id].due);
  const newPerDay = settings.newPerDay ?? teacher.newPerDay ?? 8;
  const remainingNew = Math.max(0, newPerDay - newToday(progress, now));
  const fresh = words.filter((w) => stage(progress[w.id]) === 0).slice(0, remainingNew);

  const size = settings.sessionSize || 20;
  const reviewItems = due.slice(0, size).map((w) => ({ word: w, isNew: false }));
  const newItems = fresh.slice(0, Math.max(0, size - reviewItems.length)).map((w) => ({ word: w, isNew: true }));

  // 新字平均插在複習題之間
  const items = [...reviewItems];
  newItems.forEach((it, i) => {
    const pos = Math.round(((i + 1) * (items.length + 1)) / (newItems.length + 1));
    items.splice(Math.min(pos, items.length), 0, it);
  });
  return items.map((it) => ({ ...it, type: pickType(it.word, progress[it.word.id], teacher) }));
}

export function practiceCounts({ progress, teacher, settings, now = Date.now() }) {
  const words = allWords();
  const due = words.filter((w) => isDue(progress[w.id], now)).length;
  const newPerDay = settings.newPerDay ?? teacher.newPerDay ?? 8;
  const fresh = Math.min(Math.max(0, newPerDay - newToday(progress, now)), words.filter((w) => stage(progress[w.id]) === 0).length);
  return { due, fresh };
}

/** 隨機小考：從學過的字出題；指定情境時只出例句題。 */
export function buildQuiz({ progress, teacher, theme = null, count = 10 }) {
  const words = allWords();
  let pool = words.filter((w) => stage(progress[w.id]) > 0);
  if (pool.length < 4) pool = words;
  const picked = shuffle(pool).slice(0, count);
  return picked.map((w) => ({
    word: w,
    isNew: false,
    theme,
    type: theme ? pickType(w, { correct: 1 }, teacher, { onlyExampleTypes: true }) : pickType(w, progress[w.id] || { correct: 1 }, teacher),
  }));
}

export const SPEAKER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
