// 載入題庫（data/decks.json 列出的檔案）與老師筆記（data/teacher.json）。
import { load, save } from './store.js';

export const THEMES = {
  travel: '旅遊',
  gamedev: '遊戲開發',
  marketing: '遊戲行銷',
};
export const REGISTERS = {
  polite: '禮貌體',
  casual: '口語',
  business: '商務',
};

let words = [];
let byId = new Map();

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

export async function loadData() {
  const manifest = await getJson('data/decks.json');
  const decks = await Promise.all(manifest.decks.map(async (d) => {
    const deck = await getJson(`data/${d.file}`);
    return deck.words.map((w, i) => ({ ...w, deck: d.id, order: i }));
  }));
  words = decks.flat();
  byId = new Map(words.map((w) => [w.id, w]));
  return words;
}

export const allWords = () => words;
export const getWord = (id) => byId.get(id);

const DEFAULT_TEACHER = {
  updated: '',
  message: '',
  newPerDay: 8,
  focus: { themes: {}, types: {} },
};

export async function loadTeacher() {
  try {
    const t = await getJson('data/teacher.json');
    save('teacher', t);
    return { ...DEFAULT_TEACHER, ...t };
  } catch {
    return { ...DEFAULT_TEACHER, ...load('teacher', {}) };
  }
}
