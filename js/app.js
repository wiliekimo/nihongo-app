import { loadData, loadTeacher, allWords, getWord, THEMES, REGISTERS } from './data.js';
import { getSettings, setSettings, load, save } from './store.js';
import { renderJa, markEn, kana, esc } from './furigana.js';
import { speak, canSpeak } from './speech.js';
import { TYPES, makeQuestion, buildPractice, buildQuiz, practiceCounts, SPEAKER_SVG } from './quiz.js';
import { stage, STAGE_LABELS } from './srs.js';
import { getProgress, getLog, recordAnswer, exportAll, importAll, resetAll } from './state.js';
import { sync, syncStatus, onSyncChange, testConnection } from './sync.js';
import { computeStats } from './stats.js';

const APP_VERSION = '0.2.0';
const view = document.getElementById('view');
let teacher = { newPerDay: 8, focus: { themes: {}, types: {} }, message: '' };
let session = null;

/* ---------------- helpers ---------------- */
const $ = (sel, root = view) => root.querySelector(sel);
const $$ = (sel, root = view) => [...root.querySelectorAll(sel)];

function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function applyAppearance() {
  const s = getSettings();
  const theme = load('appearance', 'auto');
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  view.classList.toggle('furi-hidden', s.furigana === 'hide');
  view.classList.toggle('furi-tap', s.furigana === 'tap');
}

function themeBadge(theme) {
  if (!theme) return '';
  return `<span class="badge theme-${theme}"><span class="dot"></span>${THEMES[theme] || theme}</span>`;
}
function registerBadge(reg) {
  return reg ? `<span class="badge">${REGISTERS[reg] || reg}</span>` : '';
}
function speakBtn(text, lang, label) {
  if (!canSpeak()) return '';
  return `<button class="icon-btn" data-speak="${esc(text)}" data-lang="${lang}" aria-label="${label}">${lang.startsWith('en') ? '<span class="lbl">EN</span>' : SPEAKER_SVG}</button>`;
}
function timeAgo(ts) {
  if (!ts) return '從未';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return '剛剛';
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  return `${Math.floor(s / 86400)} 天前`;
}
function pct(x) { return x == null ? '—' : `${Math.round(x * 100)}%`; }

function exampleHtml(ex) {
  return `<div class="example">
    <div class="meta">${themeBadge(ex.theme)}${registerBadge(ex.register)}<span class="sub">${esc(ex.scene)}</span></div>
    <div class="ja" lang="ja">${renderJa(ex.ja)}</div>
    <div class="zh">${esc(ex.zh)}</div>
    <div class="en" lang="en">${markEn(ex.en, ex.enFocus)}</div>
    <div class="speak-row">${speakBtn(kana(ex.ja), 'ja-JP', '播放日文')}${speakBtn(ex.en, 'en-US', '播放英文')}</div>
  </div>`;
}

function wordCardHtml(w, { examples = w.examples, kanaFirst = false } = {}) {
  const [main, second] = kanaFirst ? [w.reading, w.word] : [w.word, w.reading];
  return `<div class="word-head">
      <div><div class="w ja" lang="ja">${esc(main)}</div><div class="r ja" lang="ja">${esc(second)}</div></div>
      <div style="margin-left:auto">${speakBtn(w.reading, 'ja-JP', '播放發音')}</div>
    </div>
    <div class="meaning"><b>${esc(w.zh)}</b> <span class="en">· ${esc(w.en)}</span> <span class="badge">${esc(w.pos)}</span></div>
    ${examples.map(exampleHtml).join('')}`;
}

/* 全域點擊：播放語音、點擊顯示振假名 */
view.addEventListener('click', (e) => {
  const sp = e.target.closest('[data-speak]');
  if (sp) { speak(sp.dataset.speak, sp.dataset.lang); return; }
  if (view.classList.contains('furi-tap')) {
    const ja = e.target.closest('.ja');
    if (ja && !ja.closest('button')) ja.classList.toggle('reveal');
  }
});

/* ---------------- router ---------------- */
const routes = {
  home: renderHome,
  words: renderWords,
  word: renderWord,
  stats: renderStats,
  settings: renderSettings,
};

function route() {
  const [, name = 'home', arg] = (location.hash || '#/home').split('/');
  if (session && name !== 'session') endSession(false);
  document.body.classList.remove('in-quiz');
  const fn = routes[name] || renderHome;
  document.querySelectorAll('#tabbar a').forEach((a) => {
    const tab = name === 'word' ? 'words' : name;
    a.classList.toggle('active', a.dataset.tab === tab);
  });
  fn(arg ? decodeURIComponent(arg) : undefined);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
// 點目前所在的分頁也重新整理畫面
document.querySelectorAll('#tabbar a').forEach((a) => a.addEventListener('click', () => {
  if (a.getAttribute('href') === location.hash) route();
}));

/* ---------------- home ---------------- */
function renderHome() {
  const progress = getProgress();
  const settings = getSettings();
  const { due, fresh } = practiceCounts({ progress, teacher, settings });
  const st = syncStatus();
  const h = new Date().getHours();
  const greet = h < 11 ? 'おはよう' : h < 18 ? 'こんにちは' : 'こんばんは';
  const total = due + fresh;

  view.innerHTML = `
    <h1><span class="ja" lang="ja">${greet}</span></h1>
    <section class="card hero-card">
      <h2>今日練習</h2>
      <div class="counts">
        <div><div class="n">${due}</div><div class="l">待複習</div></div>
        <div><div class="n">${fresh}</div><div class="l">新單字</div></div>
      </div>
      ${total
        ? `<button class="btn block" data-action="practice">開始練習</button>`
        : `<div class="sub" style="margin-bottom:10px">今天的份量完成了！想多練可以做小考。</div>`}
    </section>

    <section class="card">
      <h2>情境小考 · 10 題</h2>
      <div class="sub" style="margin-bottom:10px">選一個情境，專練例句題（填空、怎麼說、英文）</div>
      <div class="chips" id="quiz-theme">
        <button class="chip" aria-pressed="true" data-theme="">綜合</button>
        ${Object.entries(THEMES).map(([k, v]) => `<button class="chip" aria-pressed="false" data-theme="${k}">${v}</button>`).join('')}
      </div>
      <button class="btn primary block" style="margin-top:14px" data-action="quiz">開始小考</button>
    </section>

    ${teacher.message ? `
    <section class="card teacher">
      <div class="row between"><h2>老師的話</h2><span class="sub">${esc(teacher.updated || '')}</span></div>
      <div class="msg">${esc(teacher.message)}</div>
    </section>` : ''}

    ${!st.configured ? `
    <section class="card">
      <h2>尚未設定雲端紀錄</h2>
      <div class="sub" style="margin-bottom:10px">設定後，作答紀錄會存到你的 Google 試算表，換手機也不會不見，我也能幫你分析。</div>
      <a class="btn block" href="#/settings">前往設定</a>
    </section>` : ''}

    <div class="sync-line" id="sync-line"></div>
  `;
  updateSyncLine();

  let quizTheme = '';
  $$('#quiz-theme .chip').forEach((c) => c.addEventListener('click', () => {
    quizTheme = c.dataset.theme;
    $$('#quiz-theme .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
  }));
  $('[data-action="practice"]')?.addEventListener('click', () => {
    const items = buildPractice({ progress: getProgress(), teacher, settings: getSettings() });
    if (!items.length) { toast('目前沒有要練習的字'); return; }
    startSession(items, 'practice');
  });
  $('[data-action="quiz"]').addEventListener('click', () => {
    const items = buildQuiz({ progress: getProgress(), teacher, theme: quizTheme || null });
    startSession(items, 'quiz');
  });
}

function updateSyncLine() {
  const el = document.getElementById('sync-line');
  if (!el) return;
  const st = syncStatus();
  if (!st.configured) { el.textContent = st.pending ? `${st.pending} 筆紀錄存在手機` : ''; return; }
  if (st.syncing) { el.textContent = '同步中…'; return; }
  const err = st.lastError ? `<span class="warn">同步失敗：${esc(st.lastError)}</span><br>` : '';
  el.innerHTML = `${err}雲端同步：${timeAgo(st.lastSync)}${st.pending ? ` · ${st.pending} 筆待上傳` : ''}`;
}
onSyncChange(updateSyncLine);

/* ---------------- session (practice / quiz) ---------------- */
function startSession(items, mode) {
  session = { items: items.slice(), i: 0, mode, results: [], requeued: new Set(), startedAt: Date.now(), q: null, answered: false };
  history.replaceState(null, '', '#/session');
  document.body.classList.add('in-quiz');
  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.remove('active'));
  showItem();
}

function endSession(goHome = true) {
  session = null;
  document.body.classList.remove('in-quiz');
  sync();
  if (goHome) location.hash = '#/home';
}

function sessionTop() {
  const total = session.items.length;
  const done = session.i;
  return `<div class="quiz-top">
    <button class="close-btn" data-action="close" aria-label="結束">×</button>
    <div class="progress" aria-label="進度"><i style="width:${(done / total) * 100}%"></i></div>
    <span class="sub">${Math.min(done + 1, total)} / ${total}</span>
  </div>`;
}

function bindSessionTop() {
  $('[data-action="close"]').addEventListener('click', () => {
    if (session.results.length === 0 || confirm('要結束這次練習嗎？已作答的紀錄都會保留。')) endSession(true);
  });
}

function showItem() {
  if (!session) return;
  if (session.i >= session.items.length) { showSummary(); return; }
  const item = session.items[session.i];
  const s = getSettings();
  window.scrollTo(0, 0);

  if (item.isNew && !item.cardShown) {
    item.cardShown = true;
    view.innerHTML = `${sessionTop()}
      <div class="q-type"><span class="badge" style="background:var(--accent);color:#fff">新單字</span><span>先看一下，等等就考你</span></div>
      <section class="card">${wordCardHtml(item.word, { kanaFirst: s.script !== 'kanji' })}</section>
      <div class="next-bar"><button class="btn primary block" data-action="next">記住了，開始作答</button></div>`;
    bindSessionTop();
    $('[data-action="next"]').addEventListener('click', showItem);
    if (s.autoplay) speak(item.word.reading, 'ja-JP');
    return;
  }

  let q;
  try {
    q = makeQuestion(item.word, item.type, { teacher, theme: item.theme });
  } catch {
    q = makeQuestion(item.word, 'meaning', { teacher });
  }
  session.q = q;
  session.answered = false;
  const ex = q.example;
  view.innerHTML = `${sessionTop()}
    <div class="q-type"><span class="badge">${TYPES[q.type]}</span>${ex ? themeBadge(ex.theme) + registerBadge(ex.register) : ''}</div>
    <div class="sub">${esc(q.ask)}</div>
    <div class="prompt">${q.promptHtml}</div>
    <div class="options">
      ${q.options.map((o, i) => `<button class="option${q.sentence ? ' sentence' : ''}" data-i="${i}"><span class="key">${i + 1}</span><span>${o.label}${o.sub ? `<span class="sub-line ja" lang="ja">${esc(o.sub)}</span>` : ''}</span></button>`).join('')}
    </div>
    <div class="feedback hidden" id="feedback"></div>
    <div class="next-bar hidden" id="next-bar"><button class="btn primary block" data-action="next">${session.i + 1 >= session.items.length ? '看結果' : '下一題'}</button></div>`;
  bindSessionTop();
  $$('.option').forEach((b) => b.addEventListener('click', () => answer(Number(b.dataset.i))));
  $('[data-action="replay"]')?.addEventListener('click', () => speak(q.speak.text, q.speak.lang));
  $('[data-action="next"]').addEventListener('click', () => { session.i += 1; showItem(); });
  session.qStart = performance.now();
  if (q.speak?.auto) setTimeout(() => speak(q.speak.text, q.speak.lang), 250);
}

function answer(i) {
  if (!session || session.answered) return;
  session.answered = true;
  const q = session.q;
  const item = session.items[session.i];
  const chosen = q.options[i];
  const correct = chosen.value === q.answer;
  const ms = performance.now() - session.qStart;

  $$('.option').forEach((b, idx) => {
    b.disabled = true;
    if (q.options[idx].value === q.answer) b.classList.add('correct');
    else if (idx === i) b.classList.add('wrong');
  });

  recordAnswer({
    word: item.word, type: q.type, theme: q.theme, correct, ms,
    answer: chosen.value, expected: q.answer, mode: session.mode,
  });
  session.results.push({ word: item.word, type: q.type, correct });

  if (!correct && !session.requeued.has(item.word.id)) {
    session.requeued.add(item.word.id);
    session.items.push({ word: item.word, isNew: false, cardShown: true, type: item.type, theme: item.theme });
  }

  const ex = q.example || item.word.examples.find((e) => (teacher.focus?.themes?.[e.theme] ?? 1) > 0) || item.word.examples[0];
  const fb = $('#feedback');
  fb.innerHTML = `<section class="card">
    <div class="verdict ${correct ? 'ok' : 'ng'}">${correct ? '✓ 答對了' : '✗ 再記一下'}</div>
    ${wordCardHtml(item.word, { examples: [ex], kanaFirst: getSettings().script !== 'kanji' })}
  </section>`;
  fb.classList.remove('hidden');
  $('#next-bar').classList.remove('hidden');
  const top = fb.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4;
  if (top > window.scrollY) window.scrollTo({ top, behavior: 'smooth' });

  if (getSettings().autoplay) {
    if (q.type === 'english') speak(ex.en, 'en-US');
    else if (q.type === 'say' || q.type === 'cloze') speak(kana(ex.ja), 'ja-JP');
    else speak(item.word.reading, 'ja-JP');
  }
}

function showSummary() {
  const r = session.results;
  const ok = r.filter((x) => x.correct).length;
  const mins = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
  const wrongWords = [...new Map(r.filter((x) => !x.correct).map((x) => [x.word.id, x.word])).values()];
  const mode = session.mode;
  session = null;
  document.body.classList.remove('in-quiz');
  history.replaceState(null, '', '#/summary');

  view.innerHTML = `
    <h1>${mode === 'practice' ? '練習完成' : '小考完成'}</h1>
    <section class="card">
      <div class="summary-score"><div class="n">${r.length ? Math.round((ok / r.length) * 100) : 0}%</div><div class="sub">${r.length} 題答對 ${ok} 題 · 約 ${mins} 分鐘</div></div>
    </section>
    ${wrongWords.length ? `<section class="card"><h2>要多注意的字</h2>
      <ul class="word-list">${wrongWords.map((w) => `<li><a href="#/word/${encodeURIComponent(w.id)}"><span class="w ja" lang="ja">${esc(w.word)}</span><span class="m">${esc(w.reading)} · ${esc(w.zh)}</span></a></li>`).join('')}</ul>
    </section>` : ''}
    <a class="btn primary block" href="#/home">回首頁</a>
    <div class="sync-line" id="sync-line"></div>`;
  updateSyncLine();
  sync().then(updateSyncLine);
}

document.addEventListener('keydown', (e) => {
  if (!session) return;
  if (!session.answered && /^[1-4]$/.test(e.key)) answer(Number(e.key) - 1);
  else if (e.key === 'Enter') $('[data-action="next"]')?.click();
});

/* ---------------- words ---------------- */
function renderWords() {
  const progress = getProgress();
  let filter = load('wordFilter', 'all');
  view.innerHTML = `
    <h1>單字</h1>
    <input class="search" type="search" placeholder="搜尋日文、假名、中文、英文" id="q" autocomplete="off">
    <div class="chips" id="pos" style="margin-bottom:8px">
      ${[['all', '全部'], ['動詞', '動詞'], ['名詞', '名詞'], ['adj', '形容詞']].map(([k, v]) => `<button class="chip" data-k="${k}" aria-pressed="${filter === k}">${v}</button>`).join('')}
    </div>
    <div class="legend" style="margin:6px 0 4px">${STAGE_LABELS.map((l, i) => `<span><span class="stage-dot s${i}" style="display:inline-block;margin-right:6px;vertical-align:0"></span>${l}</span>`).join('')}</div>
    <ul class="word-list" id="list"></ul>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const list = allWords().filter((w) => {
      if (filter === 'adj' && !w.pos.includes('形容詞')) return false;
      if (filter !== 'all' && filter !== 'adj' && w.pos !== filter) return false;
      if (!q) return true;
      return [w.word, w.reading, w.zh, w.en].some((s) => s.toLowerCase().includes(q));
    });
    $('#list').innerHTML = list.map((w) => {
      const s = stage(progress[w.id]);
      return `<li><a href="#/word/${encodeURIComponent(w.id)}">
        <span class="stage-dot s${s}" title="${STAGE_LABELS[s]}"></span>
        <span class="w ja" lang="ja">${esc(w.word)}</span>
        <span class="m">${esc(w.reading)} · ${esc(w.zh)}</span>
      </a></li>`;
    }).join('') || '<li class="empty">找不到符合的單字</li>';
  };
  $('#q').addEventListener('input', draw);
  $$('#pos .chip').forEach((c) => c.addEventListener('click', () => {
    filter = c.dataset.k; save('wordFilter', filter);
    $$('#pos .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
    draw();
  }));
  draw();
}

function renderWord(id) {
  const w = getWord(id);
  if (!w) { view.innerHTML = '<p class="empty">找不到這個單字</p><a href="#/words">回單字列表</a>'; return; }
  const rec = getProgress()[w.id];
  const s = stage(rec);
  const due = rec && s > 0 ? new Date(rec.due) : null;
  view.innerHTML = `
    <a href="#/words" class="sub" style="text-decoration:none">‹ 單字列表</a>
    <section class="card" style="margin-top:10px">${wordCardHtml(w)}</section>
    <section class="card">
      <div class="row between"><span>狀態</span><span><span class="stage-dot s${s}" style="display:inline-block;margin-right:6px"></span>${STAGE_LABELS[s]}</span></div>
      ${rec ? `<div class="row between sub" style="margin-top:6px"><span>答對 / 答錯</span><span>${rec.correct} / ${rec.wrong}</span></div>` : ''}
      ${due ? `<div class="row between sub" style="margin-top:6px"><span>下次複習</span><span>${due.getMonth() + 1}/${due.getDate()}</span></div>` : ''}
    </section>`;
}

/* ---------------- stats ---------------- */
function renderStats() {
  const words = allWords();
  const st = computeStats(getLog(), getProgress(), words);
  const totalWords = words.length;
  const maxDay = Math.max(1, ...st.week.map((d) => d.n));

  const hbars = (obj, labels) => {
    const keys = Object.keys(labels).filter((k) => obj[k]);
    if (!keys.length) return '<div class="empty">還沒有紀錄</div>';
    return `<div class="hbars">${keys.map((k) => {
      const v = obj[k]; const acc = v.ok / v.n;
      return `<div class="hbar"><span>${labels[k]}</span><span class="track"><i style="width:${acc * 100}%"></i></span><span class="val">${pct(acc)} · ${v.n} 題</span></div>`;
    }).join('')}</div>`;
  };

  view.innerHTML = `
    <h1>學習紀錄</h1>
    <div class="tiles">
      <div class="tile"><div class="label">連續天數</div><div class="value">${st.streak}<small>天</small></div></div>
      <div class="tile"><div class="label">今日答題</div><div class="value">${st.todayCount}<small>題</small></div></div>
      <div class="tile"><div class="label">近 7 天正確率</div><div class="value">${pct(st.weekAcc)}</div></div>
      <div class="tile"><div class="label">已學單字</div><div class="value">${st.learned}<small>/ ${totalWords}</small></div></div>
    </div>

    <section class="card">
      <h2>單字熟練度</h2>
      <div class="seg-bar" role="img" aria-label="${STAGE_LABELS.map((l, i) => `${l} ${st.stages[i]}`).join('、')}">
        ${[1, 2, 3, 0].map((i) => st.stages[i] ? `<i style="flex:${st.stages[i]};background:${i ? `var(--stage-${i})` : 'var(--surface-2)'}" title="${STAGE_LABELS[i]} ${st.stages[i]}"></i>` : '').join('')}
      </div>
      <div class="legend">${[1, 2, 3, 0].map((i) => `<span><span class="sw" style="background:${i ? `var(--stage-${i})` : 'var(--surface-2)'}"></span>${STAGE_LABELS[i]} ${st.stages[i]}</span>`).join('')}</div>
    </section>

    <section class="card">
      <h2>近 7 天答題數</h2>
      <div class="cols" id="cols">
        ${st.week.map((d, i) => `<div class="col${i === 6 ? ' today' : ''}" data-i="${i}">
          ${i === 6 && d.n ? `<span class="v">${d.n}</span>` : ''}
          <i style="height:${(d.n / maxDay) * 100}%"></i>
        </div>`).join('')}
      </div>
      <div class="col-labels">${st.week.map((d) => `<span>${d.label}</span>`).join('')}</div>
    </section>

    <section class="card"><h2>情境正確率 <span class="sub">近 30 天</span></h2>${hbars(st.byTheme, THEMES)}</section>
    <section class="card"><h2>題型正確率 <span class="sub">近 30 天</span></h2>${hbars(st.byType, TYPES)}</section>

    <section class="card">
      <h2>最需要加強</h2>
      ${st.weak.length ? `<ul class="weak-list">${st.weak.map((w) => {
        const word = getWord(w.id);
        return `<li><a href="#/word/${encodeURIComponent(w.id)}" class="ja" lang="ja" style="text-decoration:none;color:var(--ink)">${esc(w.word)}${word ? ` <span class="sub">${esc(word.zh)}</span>` : ''}</a><span class="sub">錯 ${w.ng} / ${w.n} 次</span></li>`;
      }).join('')}</ul>` : '<div class="empty">目前沒有特別弱的字</div>'}
    </section>
    <div class="sync-line" id="sync-line"></div>`;
  updateSyncLine();

  $$('#cols .col').forEach((c) => c.addEventListener('click', () => {
    $$('#cols .tip').forEach((t) => t.remove());
    const d = st.week[Number(c.dataset.i)];
    const tip = document.createElement('div');
    const ci = Number(c.dataset.i);
    tip.className = `tip${ci >= 5 ? ' end' : ci <= 1 ? ' start' : ''}`;
    tip.textContent = `${d.label}：${d.n} 題${d.n ? `，正確率 ${pct(d.ok / d.n)}` : ''}`;
    c.appendChild(tip);
    setTimeout(() => tip.remove(), 2500);
  }));
}

/* ---------------- settings ---------------- */
function renderSettings() {
  const s = getSettings();
  const appearance = load('appearance', 'auto');
  const st = syncStatus();
  const newPerDay = s.newPerDay ?? teacher.newPerDay ?? 8;

  view.innerHTML = `
    <h1>設定</h1>
    <section class="card">
      <h2>雲端紀錄（Google 試算表）</h2>
      <div class="field"><label for="url">Apps Script 網址</label><input id="url" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(s.scriptUrl)}"></div>
      <div class="field"><label for="token">密碼（跟 Apps Script 裡設定的一樣）</label><input id="token" type="password" autocomplete="off" value="${esc(s.token)}"></div>
      <div class="row">
        <button class="btn primary" data-action="save-sync">儲存並測試</button>
        <button class="btn" data-action="sync-now" ${st.configured ? '' : 'disabled'}>立即同步</button>
      </div>
      <div class="sync-line" id="sync-line" style="text-align:left;margin-top:10px"></div>
    </section>

    <section class="card">
      <h2>練習</h2>
      <div class="field"><label for="newPerDay">每天新單字數</label>
        <select id="newPerDay">${[3, 5, 8, 10, 15, 20].map((n) => `<option value="${n}" ${n === newPerDay ? 'selected' : ''}>${n} 個</option>`).join('')}</select></div>
      <div class="field"><label for="size">每次練習最多題數</label>
        <select id="size">${[10, 20, 30, 50].map((n) => `<option value="${n}" ${n === s.sessionSize ? 'selected' : ''}>${n} 題</option>`).join('')}</select></div>
      <div class="field"><label>題目中的日文</label>
        <div class="seg" id="script">${[['kana', '只用假名'], ['kanji', '漢字＋振假名']].map(([k, v]) => `<button data-k="${k}" aria-pressed="${s.script === k}">${v}</button>`).join('')}</div>
        <div class="sub" style="margin-top:6px">「只用假名」可避免看漢字就猜到意思；作答後的解說仍會附上漢字。</div></div>
      <div class="switch-row"><label for="listening">出聽力題<span class="sub" style="display:block">在外面不方便出聲時建議關閉</span></label><input id="listening" type="checkbox" ${s.listening ? 'checked' : ''}></div>
      <div class="field"><label>振假名（單字頁、作答解說）</label>
        <div class="seg" id="furi">${[['show', '顯示'], ['tap', '點一下才顯示'], ['hide', '隱藏']].map(([k, v]) => `<button data-k="${k}" aria-pressed="${s.furigana === k}">${v}</button>`).join('')}</div></div>
      <div class="switch-row"><label for="autoplay">自動播放發音</label><input id="autoplay" type="checkbox" ${s.autoplay ? 'checked' : ''}></div>
      <div class="field"><label for="rate">語速</label>
        <select id="rate">${[[0.7, '慢'], [0.9, '稍慢'], [1, '正常']].map(([n, l]) => `<option value="${n}" ${n === s.rate ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${canSpeak() ? '<button class="btn small" data-speak="こんにちは。よろしくお願いします。" data-lang="ja-JP">試聽日文</button> <button class="btn small" data-speak="Nice to meet you." data-lang="en-US">試聽英文</button>' : '<div class="sub">這個瀏覽器不支援語音播放，聽力題會自動略過。</div>'}
    </section>

    <section class="card">
      <h2>外觀</h2>
      <div class="seg" id="appearance">${[['auto', '跟隨系統'], ['light', '淺色'], ['dark', '深色']].map(([k, v]) => `<button data-k="${k}" aria-pressed="${appearance === k}">${v}</button>`).join('')}</div>
    </section>

    <section class="card">
      <h2>資料</h2>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn small" data-action="export">匯出備份</button>
        <label class="btn small" style="cursor:pointer">匯入備份<input type="file" accept="application/json" id="import" hidden></label>
        <button class="btn small danger" data-action="reset">清除本機進度</button>
      </div>
      <div class="sub" style="margin-top:10px">清除只影響這支手機；雲端試算表的紀錄不會被刪除，下次同步會再下載回來。</div>
    </section>
    <div class="sub" style="text-align:center">版本 ${APP_VERSION} · <a href="https://github.com/wiliekimo/nihongo-app">GitHub</a></div>`;
  updateSyncLine();

  $('[data-action="save-sync"]').addEventListener('click', async (e) => {
    const url = $('#url').value.trim();
    const token = $('#token').value.trim();
    if (!url || !token) { toast('請填入網址和密碼'); return; }
    e.target.disabled = true;
    try {
      await testConnection(url, token);
      setSettings({ scriptUrl: url, token });
      toast('連線成功！開始同步…');
      await sync();
      renderSettings();
    } catch (err) {
      toast(`連線失敗：${err.message}`, 4000);
    } finally {
      e.target.disabled = false;
    }
  });
  $('[data-action="sync-now"]').addEventListener('click', async () => {
    const r = await sync();
    toast(r.ok ? '同步完成' : r.offline ? '目前沒有網路' : `同步失敗：${r.error || ''}`);
  });
  $('#newPerDay').addEventListener('change', (e) => setSettings({ newPerDay: Number(e.target.value) }));
  $('#size').addEventListener('change', (e) => setSettings({ sessionSize: Number(e.target.value) }));
  $('#rate').addEventListener('change', (e) => setSettings({ rate: Number(e.target.value) }));
  $('#autoplay').addEventListener('change', (e) => setSettings({ autoplay: e.target.checked }));
  $('#listening').addEventListener('change', (e) => setSettings({ listening: e.target.checked }));
  $$('#script button').forEach((b) => b.addEventListener('click', () => {
    setSettings({ script: b.dataset.k });
    $$('#script button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $$('#furi button').forEach((b) => b.addEventListener('click', () => {
    setSettings({ furigana: b.dataset.k }); applyAppearance();
    $$('#furi button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $$('#appearance button').forEach((b) => b.addEventListener('click', () => {
    save('appearance', b.dataset.k); applyAppearance();
    $$('#appearance button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('[data-action="export"]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nihongo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#import').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { importAll(JSON.parse(await f.text())); toast('匯入完成'); } catch (err) { toast(`匯入失敗：${err.message}`); }
  });
  $('[data-action="reset"]').addEventListener('click', () => {
    if (confirm('確定要清除這支手機上的學習進度嗎？')) { resetAll(); toast('已清除'); }
  });
}

/* ---------------- boot ---------------- */
async function boot() {
  applyAppearance();
  view.innerHTML = '<p class="empty">載入中…</p>';
  try {
    [, teacher] = await Promise.all([loadData(), loadTeacher()]);
  } catch (e) {
    view.innerHTML = `<p class="empty">題庫載入失敗：${esc(e.message)}<br>請確認網路後重新整理。</p>`;
    return;
  }
  if (location.hash === '#/session' || location.hash === '#/summary') history.replaceState(null, '', '#/home');
  route();
  sync().then(() => { if (!session && (location.hash === '' || location.hash === '#/home')) renderHome(); });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
