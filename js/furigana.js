// 例句標記格式：
//   {漢字|かな}  → 振假名
//   [[...]]      → 這句的目標單字（可包含振假名標記）

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function rubyize(s, toKana = false) {
  return esc(s).replace(/\{([^{}|]+)\|([^{}]+)\}/g, toKana ? '$2' : '<ruby>$1<rt>$2</rt></ruby>');
}

/**
 * 轉成 HTML。
 * @param {string} ja 標記過的日文
 * @param {{blank?: boolean, highlight?: boolean, kana?: boolean}} opts kana=true 時漢字全部換成假名
 */
export function renderJa(ja, { blank = false, highlight = true, kana: toKana = false } = {}) {
  const m = ja.match(/^(.*)\[\[(.*)\]\](.*)$/s);
  if (!m) return rubyize(ja, toKana);
  const [, before, target, after] = m;
  let mid;
  if (blank) mid = '<span class="blank" aria-label="空格"></span>';
  else if (highlight) mid = `<span class="target">${rubyize(target, toKana)}</span>`;
  else mid = rubyize(target, toKana);
  return rubyize(before, toKana) + mid + rubyize(after, toKana);
}

/** 只留漢字（去掉振假名與標記），用於顯示純文字。 */
export function plain(ja) {
  return ja.replace(/\[\[|\]\]/g, '').replace(/\{([^{}|]+)\|[^{}]+\}/g, '$1');
}

/** 全部換成假名，用於語音朗讀（避免漢字唸錯）。 */
export function kana(ja) {
  return ja.replace(/\[\[|\]\]/g, '').replace(/\{[^{}|]+\|([^{}]+)\}/g, '$1');
}

/** 把英文句中的重點字標出來。 */
export function markEn(en, focus) {
  if (!focus) return esc(en);
  const i = en.toLowerCase().indexOf(focus.toLowerCase());
  if (i < 0) return esc(en);
  return esc(en.slice(0, i)) + '<mark>' + esc(en.slice(i, i + focus.length)) + '</mark>' + esc(en.slice(i + focus.length));
}

/** 英文填空：把重點字挖空。 */
export function blankEn(en, focus) {
  const i = en.toLowerCase().indexOf(focus.toLowerCase());
  if (i < 0) return esc(en);
  return esc(en.slice(0, i)) + '<span class="blank" aria-label="空格"></span>' + esc(en.slice(i + focus.length));
}

export { esc };
