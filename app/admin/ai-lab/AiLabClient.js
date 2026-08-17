'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const beforeSetup = {
  title: 'Before · 현재 생성 흐름',
  badge: '기준선 수집 전',
  model: 'OpenAI direct · gpt-4.1',
  prompt: 'local prompt (현재 코드)',
  retrieval: '미연결',
  trace: '미기록',
};

const afterSetup = {
  title: 'After · 비교 후보',
  badge: '연결 대기',
  model: 'OpenRouter 후보 모델',
  prompt: 'Langfuse latest / production',
  retrieval: '벡터 검색 ON/OFF 비교',
  trace: 'Langfuse Trace',
};

function truncate(value, size = 96) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > size ? `${text.slice(0, size)}…` : text || '문제 본문 없음';
}

export default function AiLabClient({ corpus, anchors }) {
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(anchors.map((anchor) => anchor.key)));
  const [expandedKey, setExpandedKey] = useState('');
  const [copied, setCopied] = useState(false);

  const selected = useMemo(
    () => anchors.filter((anchor) => selectedKeys.has(anchor.key)),
    [anchors, selectedKeys],
  );
  const readyCount = selected.filter((anchor) => anchor.ready).length;
  const conceptCount = new Set(selected.map((anchor) => anchor.concept)).size;
  const selectedDistribution = useMemo(() => corpus.categoryCounts.map((item) => ({
    ...item,
    selected: selected.filter((anchor) => anchor.category === item.category).length,
  })), [corpus.categoryCounts, selected]);

  const toggle = (key) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copySpec = async () => {
    const payload = {
      experiment_name: 'core-cbt-generation-baseline-v1',
      planned_count: selected.length,
      source_data: 'current practical JSON corpus',
      anchors: selected.map(({ key, sessionId, problemNumber, category, concept }) => ({ key, sessionId, problemNumber, category, concept })),
      before: beforeSetup,
      after: afterSetup,
      primary_metric: 'extra_generator_calls / planned_count',
      required_attempt_fields: ['batch_id', 'source_problem_id', 'attempt_no', 'generator_model', 'judge_model', 'prompt_version', 'result', 'failure_reason', 'latency_ms', 'cost'],
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-7 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold tracking-[0.18em] text-sky-700 dark:text-sky-300">AI QUALITY LAB · V1</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white md:text-4xl">문제 생성 실험실</h1>
            </div>
            <Link href="/admin" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              일반 어드민으로 돌아가기
            </Link>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">현재 JSON 원본 문제로 고정 테스트 세트를 만들고, 이후 Before / After 생성 결과를 같은 조건으로 비교하기 위한 관리자 도구입니다.</p>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <StatusCard label="현재 원본 문제" value={`${corpus.total}개`} note="실기 JSON 코퍼스에서 읽음" tone="sky" />
          <StatusCard label="고정 테스트 세트" value={`${selected.length}개`} note={`${conceptCount}개 개념 · ${readyCount}개 생성 준비 완료`} tone="emerald" />
          <StatusCard label="실험 실행 이력" value="0회" note="Langfuse Trace 연결 전 · 기준선 수집 필요" tone="amber" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-xs font-bold text-sky-700 dark:text-sky-300">SOURCE COVERAGE</p><h2 className="mt-1 text-lg font-extrabold">현재 데이터 분포</h2></div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">실제 JSON 기준</span>
            </div>
            <div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={selectedDistribution} barGap={7}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="category" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: '#f1f5f9' }} /><Bar dataKey="count" name="전체 원본" fill="#cbd5e1" radius={[5, 5, 0, 0]} /><Bar dataKey="selected" name="테스트 선택" fill="#0284c7" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">선택된 20개는 SQL · Code · 이론을 순환하며, 가능한 한 서로 다른 개념을 우선해 구성했습니다.</p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-bold text-sky-700 dark:text-sky-300">COMPARISON CONTRACT</p><h2 className="mt-1 text-lg font-extrabold">Before / After 비교 조건</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><SetupCard setup={beforeSetup} tone="slate" /><SetupCard setup={afterSetup} tone="sky" /></div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"><b>한 번에 하나만 변경합니다.</b> 처음에는 현재 방식에 Trace만 추가해 Before를 수집하고, 이후 프롬프트·모델·벡터 검색을 각각 따로 비교합니다.</div>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800"><div><p className="text-xs font-bold text-sky-700 dark:text-sky-300">BENCHMARK SET</p><h2 className="mt-1 text-lg font-extrabold">고정 테스트 원본</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">체크된 문제만 다음 실험 배치에 포함됩니다. v1에서는 선택만 가능하며 AI 호출은 하지 않습니다.</p></div><div className="flex items-center gap-2"><button onClick={() => setSelectedKeys(new Set(anchors.map((anchor) => anchor.key)))} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">20개 복원</button><button onClick={copySpec} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-800">{copied ? '실험 명세 복사 완료' : '실험 명세 복사'}</button></div></div>
          <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-950/50 dark:text-slate-400"><tr><th className="px-5 py-3">선택</th><th className="px-3 py-3">원본</th><th className="px-3 py-3">분류</th><th className="px-3 py-3">개념</th><th className="px-3 py-3">문제 미리보기</th><th className="px-5 py-3">준비 상태</th></tr></thead><tbody>{anchors.map((anchor) => <AnchorRow key={anchor.key} anchor={anchor} checked={selectedKeys.has(anchor.key)} expanded={expandedKey === anchor.key} onToggle={() => toggle(anchor.key)} onExpand={() => setExpandedKey((key) => key === anchor.key ? '' : anchor.key)} />)}</tbody></table></div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-bold text-sky-700 dark:text-sky-300">METRIC PREVIEW</p><h2 className="mt-1 text-lg font-extrabold">첫 실행 뒤 채워질 지표</h2><div className="mt-4 grid grid-cols-2 gap-3"><Metric label="재생성 요청률" value="—" note="추가 Generator 호출 ÷ 선택 문제 수" /><Metric label="최종 반려율" value="—" note="예산 소진 후 통과 실패" /><Metric label="중복·노출 실패" value="—" note="하드 게이트 사유 분포" /><Metric label="문제당 비용" value="—" note="Generator + Judge 호출 기준" /></div></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-bold text-sky-700 dark:text-sky-300">TRACE DESIGN</p><h2 className="mt-1 text-lg font-extrabold">Langfuse에 남길 최소 실행 데이터</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{['batch_id · 20문제 묶음', 'source_problem_id · 원본 식별자', 'attempt_no · 0 / 1 / 2', 'generator_model · 생성 모델', 'judge_model · 심사 모델', 'prompt_version · 적용 버전', 'result · accepted / rejected', 'failure_reason · 재생성 원인', 'latency_ms · 호출 시간', 'cost / usage · 비용·토큰'].map((item) => <div key={item} className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{item}</div>)}</div></article>
        </section>

        <footer className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100"><b>다음 구현 단계:</b> Langfuse와 OpenRouter를 연결한 뒤, 이 선택 세트를 실행하는 <code className="rounded bg-white/70 px-1.5 py-0.5 dark:bg-slate-950">Before 실행</code> 버튼과 시도별 결과 테이블을 추가합니다. 지금은 기준선이 될 원본 데이터와 측정 계약을 확정하는 v1입니다.</footer>
      </div>
    </main>
  );
}

function StatusCard({ label, value, note, tone }) {
  const tones = { sky: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100', emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100', amber: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100' };
  return <div className={`rounded-xl border p-4 ${tones[tone]}`}><p className="text-xs font-bold opacity-70">{label}</p><p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p><p className="mt-1 text-xs opacity-75">{note}</p></div>;
}

function SetupCard({ setup, tone }) {
  const toneClass = tone === 'sky' ? 'border-sky-200 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-950/30' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40';
  return <div className={`rounded-xl border p-4 ${toneClass}`}><div className="flex items-center justify-between gap-2"><h3 className="font-extrabold">{setup.title}</h3><span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">{setup.badge}</span></div><dl className="mt-3 space-y-2 text-xs"><Definition label="모델" value={setup.model} /><Definition label="프롬프트" value={setup.prompt} /><Definition label="검색" value={setup.retrieval} /><Definition label="기록" value={setup.trace} /></dl></div>;
}

function Definition({ label, value }) { return <div className="grid grid-cols-[52px_1fr] gap-2"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="font-semibold text-slate-700 dark:text-slate-200">{value}</dd></div>; }
function Metric({ label, value, note }) { return <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 text-2xl font-extrabold">{value}</p><p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{note}</p></div>; }

function AnchorRow({ anchor, checked, expanded, onToggle, onExpand }) {
  return <><tr className="border-t border-slate-100 align-top dark:border-slate-800"><td className="px-5 py-3"><input aria-label={`${anchor.key} 선택`} type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 accent-sky-700" /></td><td className="px-3 py-3"><p className="font-semibold text-slate-800 dark:text-slate-100">{anchor.sessionLabel}</p><p className="mt-0.5 text-xs text-slate-500">{anchor.problemNumber}번 · {anchor.key}</p></td><td className="px-3 py-3"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{anchor.category}</span></td><td className="px-3 py-3 text-slate-700 dark:text-slate-200">{anchor.concept}</td><td className="max-w-md px-3 py-3"><button onClick={onExpand} className="text-left text-slate-700 hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300">{truncate(anchor.questionText)}</button></td><td className="px-5 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${anchor.ready ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200'}`}>{anchor.ready ? '생성 가능' : '필드 확인 필요'}</span></td></tr>{expanded && <tr className="border-t border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"><td colSpan={6} className="px-5 py-4"><div className="grid gap-3 lg:grid-cols-3"><Detail title="문제 전체" value={anchor.questionText} /><Detail title="보기 / 코드" value={anchor.examples || '없음'} /><Detail title="정답" value={anchor.answer || '없음'} /></div></td></tr>}</>;
}

function Detail({ title, value }) { return <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-xs font-bold text-slate-500 dark:text-slate-400">{title}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{value}</p></div>; }
