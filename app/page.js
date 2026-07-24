import Link from 'next/link';
import { FileText, LayoutGrid, CheckCircle, BrainCircuit, Star, Trophy, Sparkles } from 'lucide-react';
import StartLoginModalButton from '@/app/_components/StartLoginModalButton';

const features = [
  {
    icon: <FileText className="w-8 h-8 text-sky-500" />,
    title: '회차별 CBT 모의시험',
    description: '2022~2025 기출 회차를 실제 시험처럼 3과목, 총 60문항 구성으로 연습할 수 있습니다.',
  },
  {
    icon: <CheckCircle className="w-8 h-8 text-sky-500" />,
    title: '자동 채점 및 합격 판정',
    description: '총점 36/60, 과목별 8/20 기준으로 자동 채점하고 과락 여부까지 바로 확인할 수 있습니다.',
  },
  {
    icon: <LayoutGrid className="w-8 h-8 text-sky-500" />,
    title: '오답·랜덤·재학습 모드',
    description: '오답만 다시 풀기, 모르겠어요 기반 재학습, 오답률 높은 문제 풀이, 랜덤/보기 셔플형을 지원합니다.',
  },
  {
    icon: <BrainCircuit className="w-8 h-8 text-sky-500" />,
    title: 'AI 보조 해설 + 운영 검수',
    description: 'GPT 기반 보조 해설, 캐시 재사용, 문제 신고/관리자 검수 흐름으로 학습과 운영을 함께 개선합니다.',
  },
];

const testimonials = [
  {
    name: '박OO',
    date: '2024년 1월 15일',
    text: '실전처럼 연습할 수 있어 시간 관리에 큰 도움이 됐습니다.',
    rating: 5,
  },
  {
    name: '김OO',
    date: '2024년 1월 12일',
    text: '틀린 문제 해설이 깔끔해서 복습 효율이 정말 좋았습니다.',
    rating: 5,
  },
  {
    name: '반OO',
    date: '2023년 12월 28일',
    text: '모바일에서도 잘 동작해서 출퇴근 시간에 꾸준히 공부할 수 있었어요.',
    rating: 5,
  },
  {
    name: '이OO',
    date: '2023년 12월 20일',
    text: 'UI가 단순해서 문제 풀이에만 집중하기 좋았습니다.',
    rating: 4,
  },
  {
    name: '최OO',
    date: '2023년 11월 30일',
    text: '반복 학습하기에 좋아서 실전 감각 올리기에 좋습니다.',
    rating: 5,
  },
];

const StarRating = ({ rating }) => (
  <div className="flex items-center">
    {[...Array(5)].map((_, i) => (
      <Star
        key={i}
        className={`w-5 h-5 ${i < rating ? 'text-yellow-400' : 'text-gray-300'}`}
        fill="currentColor"
      />
    ))}
  </div>
);

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-sky-50 via-white to-white">
      <main className="container mx-auto px-4 py-12 md:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mt-1 text-4xl md:text-6xl font-extrabold text-sky-900 tracking-tight leading-tight">
            정보처리산업기사 CBT 모의시험
          </h1>
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm md:text-base">
              {['회차별 모의시험', '랜덤 문제', '오답 재학습'].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-sky-200 bg-white px-3 py-1.5 font-semibold text-sky-800 shadow-sm"
                >
                  {item}
                </span>
              ))}
            </div>
            <p className="mx-auto max-w-3xl text-base md:text-xl text-gray-700 leading-relaxed">
              <span className="font-semibold text-sky-900">AI 보조 해설</span>까지 한 번에 붙여서
              <br className="hidden md:block" /> 실제 시험 감각으로 연습하는 정보처리산업기사 CBT 웹입니다.
            </p>
          </div>
          <div className="mt-8 flex flex-col items-center">
            <StartLoginModalButton />
            <Link
              href="/frequent"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-400"
            >
              🔥 빈출 문제 보기
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Beta</span>
            </Link>
          </div>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-lg transition-shadow duration-300 border border-sky-100"
            >
              <div className="flex items-center justify-center w-14 h-14 bg-sky-100 rounded-xl mb-4">
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold text-sky-900 mb-2 leading-snug">{feature.title}</h3>
              <p className="text-sm md:text-base text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-24">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-sky-900 mb-12">
            수험생 후기
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-white/60 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-gray-200/50 flex flex-col"
              >
                <div className="mb-4">
                  <StarRating rating={testimonial.rating} />
                </div>
                <p className="text-gray-700 flex-grow">&quot;{testimonial.text}&quot;</p>
                <div className="mt-4 text-right">
                  <p className="font-semibold text-sky-800">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">{testimonial.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <div className="fixed right-4 top-20 z-30 hidden w-[320px] md:block">
        <div className="rounded-2xl border border-emerald-200 bg-white/95 p-3 shadow-xl shadow-emerald-100 backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-emerald-100 p-2">
              <Trophy className="h-5 w-5 text-emerald-700" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                <Sparkles className="h-3.5 w-3.5" />
                실사용 합격 인증
              </div>
              <p className="mt-1 text-sm font-semibold leading-snug text-slate-800">
                개발자는 이걸로 공부해서
              </p>
              <p className="mt-0.5 text-lg font-black leading-tight text-emerald-700">
                78.5점으로 합격했습니당ㅋ
              </p>
              <p className="mt-1 text-xs text-slate-500">광고 아님 · 본인 실전 기록</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mb-2 mt-2 block w-full max-w-sm px-4 md:hidden">
        <div className="rounded-2xl border border-emerald-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
            <Trophy className="h-4 w-4" />
            실사용 합격 인증
          </div>
          <p className="mt-1 text-sm font-bold text-slate-800">개발자 78.5점으로 합격했습니당ㅋ</p>
        </div>
      </div>

      <footer className="text-center py-8 text-gray-500">
        <p className="mb-1 text-sm">신고 / 문의 : youqlrqod@gmail.com</p>
        <p>&copy; {new Date().getFullYear()} CBT Practice System. All rights reserved.</p>
      </footer>
    </div>
  );
}
