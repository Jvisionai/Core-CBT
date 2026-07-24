'use client';
import { useState } from 'react';

export default function FrequentClient({ data }) {
  const [tab, setTab] = useState(0);
  const s = data.subjects[tab];
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {data.subjects.map((sub, i) => (
          <button
            key={sub.name}
            onClick={() => setTab(i)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${i === tab ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-300'}`}
          >
            {sub.name} <span className="opacity-70">· {sub.repeatRate}%</span>
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-slate-500">
        {s.name} — {s.total}문제 중 반복 유형 {s.clusters.length}개 (반복률 {s.repeatRate}%)
      </p>
      <div className="space-y-3">
        {s.clusters.map((c, i) => {
          const rep = c.items[0];
          return (
            <section key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-rose-50 px-2 py-1 font-mono text-xs font-bold text-rose-700">{c.rounds}회차 · {c.size}회 반복</span>
                <span className={`rounded-md px-2 py-1 font-mono text-xs font-bold ${c.kind === '동일' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{c.kind}</span>
                {c.wrongRate != null && (
                  <span className="rounded-md bg-indigo-50 px-2 py-1 font-mono text-xs font-bold text-indigo-700">오답률 {c.wrongRate}%</span>
                )}
              </div>
              <div className="whitespace-pre-wrap text-[15px] font-medium text-slate-800">{rep.question}</div>
              {rep.options?.length ? (
                <ol className="mt-2 list-decimal pl-5 text-sm text-slate-500">
                  {rep.options.map((o, k) => <li key={k}>{o}</li>)}
                </ol>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {c.items.map((it, k) => (
                  <a
                    key={k}
                    href={`/test/${it.sid}`}
                    target="_blank"
                    rel="noopener"
                    className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 font-mono text-xs font-semibold text-indigo-700 hover:bg-white"
                  >
                    {it.round} · {it.no}번 ↗
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
