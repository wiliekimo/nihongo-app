// 間隔重複（簡化版 SM-2）。
// 每個單字一筆紀錄：
//   { reps, interval(天), ease, due(ms), lapses, correct, wrong, first(ms), last(ms) }
const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

export function newRecord(now = Date.now()) {
  return { reps: 0, interval: 0, ease: 2.5, due: now, lapses: 0, correct: 0, wrong: 0, first: now, last: 0 };
}

/**
 * 依作答結果更新排程。
 * @param {object|undefined} rec
 * @param {boolean} correct
 * @param {number} ms 作答時間
 * @param {{schedule?: boolean}} opts schedule=false 時（隨機小考）答對不推進排程，只記次數
 */
export function review(rec, correct, ms, { schedule = true, now = Date.now() } = {}) {
  const r = { ...(rec || newRecord(now)) };
  r.last = now;
  if (correct) {
    r.correct += 1;
    if (!schedule) return r;
    r.reps += 1;
    if (r.reps === 1) r.interval = 1;
    else if (r.reps === 2) r.interval = 3;
    else r.interval = Math.max(r.interval + 1, Math.round(r.interval * r.ease));
    if (ms < 5000) r.ease = Math.min(3.0, r.ease + 0.05); // 答得快：之後間隔拉長一點
    r.due = startOfDay(now) + r.interval * DAY + 4 * 60 * MIN; // 那天清晨 4 點後到期
  } else {
    r.wrong += 1;
    r.lapses += 1;
    r.reps = 0;
    r.interval = 0;
    r.ease = Math.max(1.3, r.ease - 0.2);
    r.due = now + 10 * MIN;
  }
  return r;
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 0 新字 / 1 學習中 / 2 熟悉 / 3 精通 */
export function stage(rec) {
  if (!rec || (!rec.reps && !rec.correct && !rec.wrong)) return 0;
  if (rec.interval >= 21) return 3;
  if (rec.interval >= 7) return 2;
  return 1;
}

export const STAGE_LABELS = ['新字', '學習中', '熟悉', '精通'];

export function isDue(rec, now = Date.now()) {
  return !!rec && stage(rec) > 0 && rec.due <= now;
}
