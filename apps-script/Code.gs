/** @OnlyCurrentDoc */
/**
 * 日文溝通練習 — Google 試算表後端
 * （第一行的 @OnlyCurrentDoc 讓這個程式只能存取「這一份」試算表）
 *
 * 使用方式（詳見 README）：
 * 1. 打開 Google 試算表「日文學習紀錄」→ 擴充功能 → Apps Script
 * 2. 把這整個檔案貼上，並把下面的 TOKEN 改成你自己的密碼
 * 3. 執行一次 setup（會要求授權）
 * 4. 部署 → 新增部署作業 → 類型「網頁應用程式」
 *    執行身分：我；誰可以存取：所有人 → 部署，複製網址
 * 5. 在 App 的「設定」頁貼上網址和密碼
 *
 * ⚠️ 不要把改好密碼的版本放回 GitHub（repo 是公開的）。
 */
const TOKEN = 'change-me';

const LOG_SHEET = '作答紀錄';
const PROGRESS_SHEET = '單字進度';
const LOG_HEADERS = ['紀錄ID', '時間', '日期', '單字ID', '單字', '題型', '情境', '結果', '秒數', '我的答案', '正確答案', '模式', '裝置', 'ts'];
const PROGRESS_HEADERS = ['單字ID', '階段', '下次複習', '間隔(天)', '難易度', '答對', '答錯', '連續答對', '失誤', '最後作答', 'json'];
const TYPE_LABELS = { meaning: '意思', word: '單字', listen: '聽力', cloze: '填空', say: '怎麼說', english: '英文' };
const THEME_LABELS = { travel: '旅遊', gamedev: '遊戲開發', marketing: '遊戲行銷' };
const STAGE_LABELS = ['新字', '學習中', '熟悉', '精通'];
const RETURN_LOG_LIMIT = 2000;

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, LOG_SHEET, LOG_HEADERS);
  ensureSheet_(ss, PROGRESS_SHEET, PROGRESS_HEADERS);
  const first = ss.getSheets()[0];
  if (first.getName() === '工作表1' || first.getName() === 'Sheet1') {
    if (first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  }
  return '設定完成';
}

function doGet() {
  return json_({ ok: true, message: '日文溝通練習後端運作中' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: '請求格式錯誤' });
  }
  if (!req || req.token !== TOKEN || TOKEN === 'change-me') {
    return json_({ ok: false, error: TOKEN === 'change-me' ? '請先在 Apps Script 裡把 TOKEN 改成你的密碼' : '密碼錯誤' });
  }
  if (req.action === 'ping') return json_({ ok: true });
  if (req.action !== 'sync') return json_({ ok: false, error: '未知的動作' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ensureSheet_(ss, LOG_SHEET, LOG_HEADERS);
    const progSheet = ensureSheet_(ss, PROGRESS_SHEET, PROGRESS_HEADERS);
    appendLogs_(logSheet, req.logs || []);
    const merged = mergeProgress_(readProgress_(progSheet), req.progress || {});
    writeProgress_(progSheet, merged);
    const logs = readLogsSince_(logSheet, Number(req.since) || 0);
    return json_({ ok: true, progress: merged, logs: logs });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- 作答紀錄 ---------- */
function appendLogs_(sheet, logs) {
  if (!logs.length) return;
  const last = sheet.getLastRow();
  const existing = new Set();
  if (last > 1) {
    const n = Math.min(last - 1, 3000);
    sheet.getRange(last - n + 1, 1, n, 1).getValues().forEach(function (r) { existing.add(String(r[0])); });
  }
  const rows = logs
    .filter(function (l) { return l && l.id && !existing.has(String(l.id)); })
    .map(function (l) {
      return [
        l.id,
        new Date(l.ts),
        "'" + l.date, // 以文字儲存，避免時區轉換
        l.wordId,
        l.word,
        TYPE_LABELS[l.type] || l.type,
        THEME_LABELS[l.theme] || l.theme || '',
        l.correct ? '○' : '×',
        Math.round((l.ms || 0) / 100) / 10,
        l.answer,
        l.expected,
        l.mode === 'quiz' ? '小考' : '練習',
        l.device || '',
        l.ts,
      ];
    });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LOG_HEADERS.length).setValues(rows);
}

function readLogsSince_(sheet, since) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const n = Math.min(last - 1, RETURN_LOG_LIMIT);
  const values = sheet.getRange(last - n + 1, 1, n, LOG_HEADERS.length).getValues();
  const typeKeys = invert_(TYPE_LABELS);
  const themeKeys = invert_(THEME_LABELS);
  return values
    .filter(function (r) { return Number(r[13]) > since; })
    .map(function (r) {
      return {
        id: String(r[0]),
        ts: Number(r[13]),
        date: typeof r[2] === 'string' ? r[2] : Utilities.formatDate(new Date(r[2]), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        wordId: r[3],
        word: r[4],
        type: typeKeys[r[5]] || r[5],
        theme: themeKeys[r[6]] || r[6] || '',
        correct: r[7] === '○',
        ms: Math.round(Number(r[8]) * 1000),
        answer: String(r[9]),
        expected: String(r[10]),
        mode: r[11] === '小考' ? 'quiz' : 'practice',
        device: r[12],
      };
    });
}

/* ---------- 單字進度 ---------- */
function readProgress_(sheet) {
  const out = {};
  const last = sheet.getLastRow();
  if (last < 2) return out;
  sheet.getRange(2, 1, last - 1, PROGRESS_HEADERS.length).getValues().forEach(function (r) {
    try { out[r[0]] = JSON.parse(r[10]); } catch (err) { /* skip */ }
  });
  return out;
}

function mergeProgress_(a, b) {
  const out = {};
  Object.keys(a).forEach(function (k) { out[k] = a[k]; });
  Object.keys(b).forEach(function (k) {
    if (!out[k] || (b[k].last || 0) > (out[k].last || 0)) out[k] = b[k];
  });
  return out;
}

function stage_(rec) {
  if (!rec || (!rec.reps && !rec.correct && !rec.wrong)) return 0;
  if (rec.interval >= 21) return 3;
  if (rec.interval >= 7) return 2;
  return 1;
}

function writeProgress_(sheet, progress) {
  const ids = Object.keys(progress).sort();
  const rows = ids.map(function (id) {
    const r = progress[id];
    return [
      id,
      STAGE_LABELS[stage_(r)],
      r.due ? new Date(r.due) : '',
      r.interval || 0,
      Math.round((r.ease || 2.5) * 100) / 100,
      r.correct || 0,
      r.wrong || 0,
      r.reps || 0,
      r.lapses || 0,
      r.last ? new Date(r.last) : '',
      JSON.stringify(r),
    ];
  });
  const last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, PROGRESS_HEADERS.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, PROGRESS_HEADERS.length).setValues(rows);
}

/* ---------- utils ---------- */
function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function invert_(obj) {
  const out = {};
  Object.keys(obj).forEach(function (k) { out[obj[k]] = k; });
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
