// 題庫格式檢查：node scripts/validate.mjs
// 新增或修改 data/*.json 後請執行，確保 App 能正確出題。
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEMES = new Set(['travel', 'gamedev', 'marketing']);
const REGISTERS = new Set(['polite', 'casual', 'business']);
const POS = new Set(['動詞', '名詞', 'い形容詞', 'な形容詞', '副詞', '表現', '其他']);

const manifest = JSON.parse(readFileSync(join(root, 'data', 'decks.json'), 'utf8'));
let errors = 0;
const err = (where, msg) => { errors++; console.error(`✗ ${where}: ${msg}`); };
const ids = new Set();

for (const deckInfo of manifest.decks) {
  const file = join(root, 'data', deckInfo.file);
  const deck = JSON.parse(readFileSync(file, 'utf8'));
  for (const w of deck.words) {
    const where = `${deckInfo.file} ${w.id}`;
    for (const k of ['id', 'word', 'reading', 'pos', 'zh', 'en']) if (!w[k]) err(where, `缺少欄位 ${k}`);
    if (ids.has(w.id)) err(where, '重複的 id');
    ids.add(w.id);
    if (!POS.has(w.pos)) err(where, `未知的詞性 ${w.pos}`);
    if (!Array.isArray(w.examples) || w.examples.length === 0) err(where, '沒有例句');
    (w.examples || []).forEach((ex, i) => {
      const at = `${where} 例句${i + 1}`;
      if (!THEMES.has(ex.theme)) err(at, `未知的情境 ${ex.theme}`);
      if (!REGISTERS.has(ex.register)) err(at, `未知的語氣 ${ex.register}`);
      for (const k of ['scene', 'ja', 'zh', 'en', 'enFocus']) if (!ex[k]) err(at, `缺少欄位 ${k}`);
      const targets = (ex.ja.match(/\[\[/g) || []).length;
      const closes = (ex.ja.match(/\]\]/g) || []).length;
      if (targets !== 1 || closes !== 1) err(at, `日文例句必須剛好有一組 [[目標字]]（目前 ${targets}）`);
      // 振假名格式 {漢字|かな}
      const stripped = ex.ja.replace(/\{[^{}|]+\|[぀-ゟ゠-ヿー]+\}/g, '');
      if (/[{}|]/.test(stripped)) err(at, `振假名格式錯誤：${ex.ja}`);
      if (/[一-鿿]/.test(stripped.replace(/\[\[|\]\]/g, ''))) err(at, `有漢字沒有標振假名：${stripped}`);
      if (!ex.en.toLowerCase().includes(ex.enFocus.toLowerCase())) err(at, `英文重點字「${ex.enFocus}」不在英文例句中`);
    });
  }
  console.log(`✓ ${deckInfo.file}：${deck.words.length} 個單字`);
}

if (errors) { console.error(`\n共 ${errors} 個錯誤`); process.exit(1); }
console.log('全部通過');
