// 由本機作答紀錄計算統計（同步後會包含其他裝置的紀錄）。
import { todayStr } from './store.js';
import { stage } from './srs.js';

export function computeStats(log, progress, words) {
  const now = Date.now();
  const today = todayStr(now);

  const stages = [0, 0, 0, 0];
  for (const w of words) stages[stage(progress[w.id])] += 1;

  // 連續天數
  const days = new Set(log.map((e) => e.date));
  let streak = 0;
  const d = new Date();
  if (!days.has(today)) d.setDate(d.getDate() - 1); // 今天還沒練也不算斷
  while (days.has(todayStr(d.getTime()))) { streak += 1; d.setDate(d.getDate() - 1); }

  // 近 7 天
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const x = new Date(); x.setDate(x.getDate() - i);
    const ds = todayStr(x.getTime());
    const es = log.filter((e) => e.date === ds);
    week.push({ date: ds, label: i === 0 ? '今天' : `${x.getMonth() + 1}/${x.getDate()}`, n: es.length, ok: es.filter((e) => e.correct).length });
  }
  const weekTotal = week.reduce((s, x) => s + x.n, 0);
  const weekOk = week.reduce((s, x) => s + x.ok, 0);

  // 近 30 天：依情境、題型
  const since = now - 30 * 24 * 3600 * 1000;
  const recent = log.filter((e) => e.ts >= since);
  const group = (key) => {
    const m = {};
    for (const e of recent) {
      const k = e[key];
      if (!k) continue;
      m[k] ||= { n: 0, ok: 0 };
      m[k].n += 1;
      if (e.correct) m[k].ok += 1;
    }
    return m;
  };

  // 最需要加強的字
  const perWord = {};
  for (const e of recent) {
    perWord[e.wordId] ||= { n: 0, ng: 0, word: e.word };
    perWord[e.wordId].n += 1;
    if (!e.correct) perWord[e.wordId].ng += 1;
  }
  const weak = Object.entries(perWord)
    .filter(([, v]) => v.ng > 0)
    .map(([id, v]) => ({ id, ...v, rate: v.ng / v.n }))
    .sort((a, b) => b.rate - a.rate || b.ng - a.ng)
    .slice(0, 6);

  return {
    stages,
    learned: stages[1] + stages[2] + stages[3],
    streak,
    todayCount: log.filter((e) => e.date === today).length,
    week,
    weekAcc: weekTotal ? weekOk / weekTotal : null,
    byTheme: group('theme'),
    byType: group('type'),
    weak,
  };
}
