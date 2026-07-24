import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import data from './_data/frequent.json';
import FrequentClient from './FrequentClient';

export const metadata = {
  title: '빈출 문제 (Beta) — 정보처리산업기사 필기',
  description: '반복 출제 유형을 임베딩으로 자동 분석한 빈출 문제 모음.',
};

export default function FrequentPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-100 px-4 py-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 md:py-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={16} /> 홈
        </Link>
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">빈출 문제</h1>
          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">Beta</span>
        </div>
        <p className="mb-6 max-w-2xl text-sm text-slate-500">
          {data.exam} {data.rounds}회차를 임베딩으로 자동 분석 — 반복 출제된 유형을 과목별로. 회차 뱃지를 누르면 실제 시험이 열립니다.
        </p>
        <FrequentClient data={data} />
      </div>
    </main>
  );
}
