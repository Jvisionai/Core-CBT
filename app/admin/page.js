'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSession, signOut } from 'next-auth/react';
import { ADMIN_EXAM_TYPE_OPTIONS, classifySessionId, examTypeLabel } from '@/lib/examType';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const emptyMetrics = {
  kpis: {
    visitors: 0,
    googleUsers: 0,
    visitorsPlusGoogle: 0,
    completedUsers: 0,
    completionRate: 0,
    passRate: 0,
    totalStarts: 0,
    totalFinishes: 0,
  },
  funnel: [],
  dailyTrend: [],
  sessionStats: [],
  subjectAverages: [],
  reportReasons: [],
  recentReports: [],
  gptFeedback: {
    summary: { total: 0, liked: 0, disliked: 0, netLikeRatio: 0 },
    items: [],
  },
  themeUsage: {
    totalThemeEvents: 0,
    users: [],
    currentThemes: [],
    currentCustomColors: [],
  },
};

const LIST_TABS = [
  { key: 'kpi', label: '요약 리스트' },
  { key: 'daily', label: '일자별 리스트' },
  { key: 'session', label: '회차별 리스트' },
  { key: 'subject', label: '과목별 리스트' },
  { key: 'themes', label: '색상 통계' },
  { key: 'ipSearch', label: '사용자 조회' },
  { key: 'gptCache', label: 'GPT 캐시 조회' },
  { key: 'reports', label: '신고 리스트' },
];

const SESSION_LABELS = {
  '1': '2024년 1회차',
  '2': '2024년 2회차',
  '3': '2024년 3회차',
  '4': '2024년 2회차',
  '5': '2024년 3회차',
  '6': '2023년 1회차',
  '7': '2023년 2회차',
  '8': '2023년 3회차',
  '9': '2022년 1회차',
  '10': '2022년 2회차',
  '11': '2022년 3회차',
  'high-wrong': '오답률 높은 문제 풀기',
  'high-unknown': '모르겠어요 많이 누른 문제 풀기',
  'random': '랜덤 모드',
  'random22': '랜덤보기22 (문제 셔플형)',
  };

const SOURCE_KEY_TO_SESSION_ID = {
  '2024-1': '1',
  '2024-2': '2',
  '2024-3': '3',
  '2023-1': '6',
  '2023-2': '7',
  '2023-3': '8',
  '2022-1': '9',
  '2022-2': '10',
  '2022-3': '11',
};

function sessionLabel(sessionId) {
  const key = String(sessionId || '').trim();
  const sqld = key.match(/^sqld-(\d{4})-(\d)$/);
  if (sqld) return `SQLD ${sqld[1]}년 ${sqld[2]}회`;
  if (key === 'sqld-index') return 'SQLD 회차 선택';

  const practical = key.match(/^practical-industrial-(\d{4})-(\d)$/);
  if (practical) return `정보처리산업기사 실기 ${practical[1]}년 ${practical[2]}회`;
  if (key === 'practical-index') return '실기 회차 선택';

  const random22Year = key.match(/^random22-(\d{4})$/);
  if (random22Year) return `랜덤보기22 (${random22Year[1]}년)`;

  const industrial2025 = key.match(/^pdfpack-industrial-2025-(\d)$/);
  if (industrial2025) return `2025년 ${industrial2025[1]}회차`;
  const aiPrompt = key.match(/^aiprompt-(\d+)-(\d+)$/);
  if (aiPrompt) return `AI 프롬프트엔지니어링 ${aiPrompt[1]}급 ${aiPrompt[2]}회`;
  if (key === 'aiprompt-index') return 'AI 프롬프트 회차 선택';

  return SESSION_LABELS[key] || key || '-';
}

function sessionLabelWithCode(sessionId) {
  const raw = String(sessionId || '').trim();
  const label = sessionLabel(raw);
  if (!raw) return '-';
  if (label === raw) return raw;
  return `${label} (${raw})`;
}

function buildProblemPagePath(sessionId, problemNumber) {
  const sid = String(sessionId || '').trim();
  const pno = String(problemNumber || '').trim();
  if (!sid) return '#';
  const basePath = classifySessionId(sid) === 'practical' ? `/practical/${encodeURIComponent(sid)}` : `/test/${encodeURIComponent(sid)}`;
  return pno ? `${basePath}?p=${encodeURIComponent(pno)}` : basePath;
}

function fmtTime(ts) {
  const raw = String(ts || '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.replace('T', ' ').slice(5, 16);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}월 ${dd}일 ${hh}시 ${mi}분`;
}

const emptyGptCacheAdmin = {
  summary: {
    totalRows: 0,
    totalHits: 0,
    filteredRows: 0,
    filteredHits: 0,
    subjects: [],
  },
  topProblems: [],
  rows: [],
  page: 1,
  pageSize: 20,
  totalPages: 1,
  sortBy: 'created_at',
  sortDir: 'desc',
  filters: { sessionId: '', problemNumber: '' },
};

const emptyIpSearchAdmin = {
  summary: {
    query: '',
    totalEvents: 0,
    totalEventsWithIp: 0,
    matchedRows: 0,
    entity: 'email',
    scope: 'all',
    estimatedExternalUniqueClients: 0,
    estimatedExternalUniqueIps: 0,
    excludeLocal: true,
    excludeIps: [],
  },
  rows: [],
  page: 1,
  pageSize: 20,
  totalPages: 1,
  sortBy: 'lastSeen',
  sortDir: 'desc',
  filters: { q: '', entity: 'email', scope: 'all' },
};

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [adminEmail, setAdminEmail] = useState('');
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('reports');
  const [showCharts, setShowCharts] = useState(false);

  const [selectedReport, setSelectedReport] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [problemDetail, setProblemDetail] = useState(null);
  const [expandedReportGroups, setExpandedReportGroups] = useState({});
  const [selectedReportGroups, setSelectedReportGroups] = useState({});
  const [selectedReportItems, setSelectedReportItems] = useState({});
  const [reportSortBy, setReportSortBy] = useState('count');
  const [reportSortDir, setReportSortDir] = useState('desc');
  const [detailSortState, setDetailSortState] = useState({});
  const [gptCacheData, setGptCacheData] = useState(emptyGptCacheAdmin);
  const [gptCacheLoading, setGptCacheLoading] = useState(false);
  const [gptCacheError, setGptCacheError] = useState('');
  const [gptCacheSortBy, setGptCacheSortBy] = useState('created_at');
  const [gptCacheSortDir, setGptCacheSortDir] = useState('desc');
  const [gptCachePage, setGptCachePage] = useState(1);
  const [gptCachePageSize, setGptCachePageSize] = useState(20);
  const [gptCacheSessionFilter, setGptCacheSessionFilter] = useState('');
  const [gptCacheProblemFilter, setGptCacheProblemFilter] = useState('');
  const [gptCacheFeedbackFilter, setGptCacheFeedbackFilter] = useState('all');
  const [gptTopTypeView, setGptTopTypeView] = useState('all');
  const [gptDetailTypeView, setGptDetailTypeView] = useState('all');
  const [gptSectionView, setGptSectionView] = useState('top');
  const [gptTopSortBy, setGptTopSortBy] = useState('hits');
  const [gptTopSortDir, setGptTopSortDir] = useState('desc');
  const [selectedGptCacheRow, setSelectedGptCacheRow] = useState(null);
  const [ipSearchData, setIpSearchData] = useState(emptyIpSearchAdmin);
  const [ipSearchLoading, setIpSearchLoading] = useState(false);
  const [ipSearchError, setIpSearchError] = useState('');
  const [ipSearchQuery, setIpSearchQuery] = useState('');
  const [ipSearchEntity, setIpSearchEntity] = useState('email');
  const [ipSearchScope, setIpSearchScope] = useState('today');
  const [ipSearchSortBy, setIpSearchSortBy] = useState('lastSeen');
  const [ipSearchSortDir, setIpSearchSortDir] = useState('desc');
  const [ipSearchPage, setIpSearchPage] = useState(1);
  const [ipSearchPageSize, setIpSearchPageSize] = useState(20);
  const [expandedIpRows, setExpandedIpRows] = useState({});
  const [ipExcludeLocal, setIpExcludeLocal] = useState(true);
  const [ipExcludeWhitelistText, setIpExcludeWhitelistText] = useState('');
  const [adminExamTypeFilter, setAdminExamTypeFilter] = useState('all');
  const [sessionTypeView, setSessionTypeView] = useState('all');
  const [subjectTypeView, setSubjectTypeView] = useState('all');

  const toggleReportSort = (column) => {
    if (reportSortBy === column) {
      setReportSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setReportSortBy(column);
    setReportSortDir(column === 'session' ? 'asc' : 'desc');
  };

  const sortMark = (column) => {
    if (reportSortBy !== column) return '↕';
    return reportSortDir === 'asc' ? '▲' : '▼';
  };

  const toggleGptCacheSort = (column) => {
    if (gptCacheSortBy === column) {
      setGptCacheSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setGptCacheSortBy(column);
      setGptCacheSortDir(column === 'session' || column === 'problem' || column === 'subject' ? 'asc' : 'desc');
    }
    setGptCachePage(1);
  };

  const gptCacheSortMark = (column) => {
    if (gptCacheSortBy !== column) return '↕';
    return gptCacheSortDir === 'asc' ? '▲' : '▼';
  };

  const toggleGptTopSort = (column) => {
    if (gptTopSortBy === column) {
      setGptTopSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setGptTopSortBy(column);
    setGptTopSortDir(column === 'session' || column === 'problem' || column === 'subject' ? 'asc' : 'desc');
  };

  const gptTopSortMark = (column) => {
    if (gptTopSortBy !== column) return '↕';
    return gptTopSortDir === 'asc' ? '▲' : '▼';
  };

  const toggleIpSort = (column) => {
    if (ipSearchSortBy === column) {
      setIpSearchSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setIpSearchSortBy(column);
    setIpSearchSortDir(column === 'identifier' ? 'asc' : 'desc');
    setIpSearchPage(1);
  };

  const ipSortMark = (column) => {
    if (ipSearchSortBy !== column) return '↕';
    return ipSearchSortDir === 'asc' ? '▲' : '▼';
  };

  const toggleDetailSort = (groupKey, column) => {
    setDetailSortState((prev) => {
      const current = prev[groupKey] || { by: 'time', dir: 'desc' };
      if (current.by === column) {
        return {
          ...prev,
          [groupKey]: { ...current, dir: current.dir === 'asc' ? 'desc' : 'asc' },
        };
      }
      return {
        ...prev,
        [groupKey]: { by: column, dir: column === 'problem' ? 'asc' : 'desc' },
      };
    });
  };

  const detailSortMark = (groupKey, column) => {
    const current = detailSortState[groupKey] || { by: 'time', dir: 'desc' };
    if (current.by !== column) return '↕';
    return current.dir === 'asc' ? '▲' : '▼';
  };

  const getSortedDetailReports = (group) => {
    const current = detailSortState[group.key] || { by: 'time', dir: 'desc' };
    const dir = current.dir === 'asc' ? 1 : -1;
    const arr = [...(group?.reports || [])];
    arr.sort((a, b) => {
      if (current.by === 'problem') {
        const ap = Number(a?.problemNumber);
        const bp = Number(b?.problemNumber);
        const da = Number.isNaN(ap) ? 0 : ap;
        const db = Number.isNaN(bp) ? 0 : bp;
        const d = (da - db) * dir;
        if (d !== 0) return d;
      }
      const t = String(a?.timestamp || '').localeCompare(String(b?.timestamp || '')) * dir;
      if (t !== 0) return t;
      return String(a?.reason || '').localeCompare(String(b?.reason || ''), 'ko');
    });
    return arr;
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (adminExamTypeFilter !== 'all') qs.set('examType', adminExamTypeFilter);
      const res = await fetch(`/api/admin/metrics${qs.toString() ? `?${qs.toString()}` : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setMetrics({ ...emptyMetrics, ...data });
    } catch {
      setError('데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadGptCache = async () => {
    setGptCacheLoading(true);
    setGptCacheError('');
    try {
      const qs = new URLSearchParams({
        page: String(gptCachePage),
        pageSize: String(gptCachePageSize),
        sortBy: gptCacheSortBy,
        sortDir: gptCacheSortDir,
      });
      if (gptCacheSessionFilter) qs.set('sessionId', gptCacheSessionFilter);
      if (gptCacheProblemFilter) qs.set('problemNumber', gptCacheProblemFilter);
      if (gptCacheFeedbackFilter && gptCacheFeedbackFilter !== 'all') qs.set('feedbackFilter', gptCacheFeedbackFilter);
      if (adminExamTypeFilter !== 'all') qs.set('examType', adminExamTypeFilter);

      const res = await fetch(`/api/admin/gpt-cache?${qs.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || 'failed');
      setGptCacheData({ ...emptyGptCacheAdmin, ...data });
    } catch {
      setGptCacheError('GPT 캐시 조회 데이터를 불러오지 못했습니다.');
    } finally {
      setGptCacheLoading(false);
    }
  };

  const loadIpSearch = async () => {
    setIpSearchLoading(true);
    setIpSearchError('');
    try {
      const qs = new URLSearchParams({
        page: String(ipSearchPage),
        pageSize: String(ipSearchPageSize),
        sortBy: ipSearchSortBy,
        sortDir: ipSearchSortDir,
        entity: ipSearchEntity,
        scope: ipSearchScope,
      });
      if (ipSearchQuery.trim()) qs.set('q', ipSearchQuery.trim());
      qs.set('excludeLocal', ipExcludeLocal ? '1' : '0');
      if (ipExcludeWhitelistText.trim()) qs.set('excludeIps', ipExcludeWhitelistText.trim());
      if (adminExamTypeFilter !== 'all') qs.set('examType', adminExamTypeFilter);

      const res = await fetch(`/api/admin/ip-search?${qs.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || 'failed');
      setIpSearchData({ ...emptyIpSearchAdmin, ...data });
    } catch {
      setIpSearchError('사용자 조회 데이터를 불러오지 못했습니다.');
    } finally {
      setIpSearchLoading(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const session = await getSession();
        const email = String(session?.user?.email || '').trim();
        if (!email) {
          window.location.href = '/';
          return;
        }
        setAdminEmail(email);
        setUnlocked(true);
        load();
      } finally {
        setAuthChecking(false);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    if (!unlocked) {
      setLoading(false);
      return;
    }
    if (tab === 'gptCache' || tab === 'ipSearch') return;
    load();
  }, [unlocked, tab, adminExamTypeFilter]);

  useEffect(() => {
    if (!unlocked) return;
    if (tab !== 'gptCache') return;
    loadGptCache();
  }, [
    unlocked,
    tab,
    gptCachePage,
    gptCachePageSize,
    gptCacheSortBy,
    gptCacheSortDir,
    gptCacheSessionFilter,
    gptCacheProblemFilter,
    gptCacheFeedbackFilter,
    adminExamTypeFilter,
  ]);

  useEffect(() => {
    if (!unlocked) return;
    if (tab !== 'ipSearch') return;
    loadIpSearch();
  }, [
    unlocked,
    tab,
    ipSearchPage,
    ipSearchPageSize,
    ipSearchSortBy,
    ipSearchSortDir,
    ipSearchEntity,
    ipSearchScope,
    ipExcludeLocal,
    adminExamTypeFilter,
  ]);

  const kpis = useMemo(() => metrics.kpis ?? emptyMetrics.kpis, [metrics]);
  const ipEntityLabel =
    ipSearchEntity === 'email' ? '이메일' : ipSearchEntity === 'client' ? 'clientId (사람 추정)' : 'IP';
  const ipCounterpartLabel =
    ipSearchEntity === 'email' ? '고유 clientId' : ipSearchEntity === 'client' ? '고유 IP' : '고유 clientId';
  const ipTodayCounterpartLabel =
    ipSearchEntity === 'email'
      ? '오늘 고유 clientId'
      : ipSearchEntity === 'client'
        ? '오늘 고유 IP'
        : '오늘 고유 clientId';
  const ipRowsLabel = ipSearchEntity === 'ip' ? '개 IP' : '명';
  const ipFilterExcludedIps = Array.isArray(ipSearchData?.summary?.excludeIps) ? ipSearchData.summary.excludeIps : [];
  const sortedGptTopProblems = useMemo(() => {
    const rows = [...(gptCacheData?.topProblems || [])];
    const dir = gptTopSortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (gptTopSortBy === 'subject') {
        const d = ((Number(a?.subject) || 0) - (Number(b?.subject) || 0)) * dir;
        if (d !== 0) return d;
      }
      if (gptTopSortBy === 'session') {
        const d = String(sessionLabel(a?.sourceSessionId)).localeCompare(String(sessionLabel(b?.sourceSessionId)), 'ko') * dir;
        if (d !== 0) return d;
      }
      if (gptTopSortBy === 'problem') {
        const d = ((Number(a?.sourceProblemNumber) || 0) - (Number(b?.sourceProblemNumber) || 0)) * dir;
        if (d !== 0) return d;
      }
      if (gptTopSortBy === 'likes') {
        const d = ((Number(a?.totalLike) || 0) - (Number(b?.totalLike) || 0)) * dir;
        if (d !== 0) return d;
      }
      if (gptTopSortBy === 'dislikes') {
        const d = ((Number(a?.totalDislike) || 0) - (Number(b?.totalDislike) || 0)) * dir;
        if (d !== 0) return d;
      }
      if (gptTopSortBy === 'cacheRows') {
        const d = ((Number(a?.cacheRows) || 0) - (Number(b?.cacheRows) || 0)) * dir;
        if (d !== 0) return d;
      }
      if (gptTopSortBy === 'latest') {
        const d = String(a?.latestCreatedAt || '').localeCompare(String(b?.latestCreatedAt || '')) * dir;
        if (d !== 0) return d;
      }
      const d = ((Number(a?.totalHits) || 0) - (Number(b?.totalHits) || 0)) * dir;
      if (d !== 0) return d;
      return String(b?.latestCreatedAt || '').localeCompare(String(a?.latestCreatedAt || ''));
    });
    return rows;
  }, [gptCacheData?.topProblems, gptTopSortBy, gptTopSortDir]);
  const filteredGptTopProblems = useMemo(
    () =>
      sortedGptTopProblems.filter(
        (r) => gptTopTypeView === 'all' || classifySessionId(r.sourceSessionId) === gptTopTypeView
      ),
    [sortedGptTopProblems, gptTopTypeView]
  );
  const filteredGptCacheRows = useMemo(
    () =>
      (gptCacheData?.rows || []).filter(
        (r) => gptDetailTypeView === 'all' || classifySessionId(r.sourceSessionId) === gptDetailTypeView
      ),
    [gptCacheData?.rows, gptDetailTypeView]
  );

  const groupedReports = useMemo(() => {
    const rows = Array.isArray(metrics.recentReports) ? metrics.recentReports : [];
    const map = new Map();

    rows.forEach((r, idx) => {
      const sourceSessionId = String(r.originSessionId || r.sessionId || '-').trim();
      const sourceProblemNumber = String(r.originProblemNumber || r.problemNumber || '-').trim();
      const key = `${sourceSessionId}:${sourceProblemNumber}`;
      const ts = String(r.timestamp || '');

      if (!map.has(key)) {
        map.set(key, {
          key,
          sourceSessionId,
          sourceProblemNumber,
          count: 0,
          latestTimestamp: ts,
          questionText: r.questionText || '',
          reports: [],
        });
      }

      const g = map.get(key);
      g.count += 1;
      if (ts > g.latestTimestamp) g.latestTimestamp = ts;
      if (!g.questionText && r.questionText) g.questionText = r.questionText;
      g.reports.push({ ...r, _idx: idx });
    });

    return Array.from(map.values()).map((g) => ({
      ...g,
      reports: g.reports.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''))),
    }));
  }, [metrics.recentReports]);

  const sortedGroupedReports = useMemo(() => {
    const dir = reportSortDir === 'asc' ? 1 : -1;
    const arr = [...groupedReports];
    arr.sort((a, b) => {
      if (reportSortBy === 'count') {
        const d = (a.count - b.count) * dir;
        if (d !== 0) return d;
      }
      if (reportSortBy === 'latest') {
        const d = String(a.latestTimestamp || '').localeCompare(String(b.latestTimestamp || '')) * dir;
        if (d !== 0) return d;
      }
      if (reportSortBy === 'session') {
        const d = String(sessionLabel(a.sourceSessionId)).localeCompare(String(sessionLabel(b.sourceSessionId)), 'ko') * dir;
        if (d !== 0) return d;
      }
      if (b.count !== a.count) return (b.count - a.count);
      return String(b.latestTimestamp || '').localeCompare(String(a.latestTimestamp || ''));
    });
    return arr;
  }, [groupedReports, reportSortBy, reportSortDir]);

  const allGroupKeys = useMemo(() => sortedGroupedReports.map((g) => g.key), [sortedGroupedReports]);
  const selectedGroupKeys = useMemo(
    () => allGroupKeys.filter((k) => selectedReportGroups[k]),
    [allGroupKeys, selectedReportGroups]
  );
  const selectedReportIds = useMemo(() => {
    const ids = [];
    sortedGroupedReports.forEach((g) => {
      if (!selectedReportGroups[g.key]) return;
      g.reports.forEach((r) => {
        if (r?.id) ids.push(String(r.id));
      });
    });
    return [...new Set(ids)];
  }, [sortedGroupedReports, selectedReportGroups]);
  const isAllSelected = allGroupKeys.length > 0 && selectedGroupKeys.length === allGroupKeys.length;

  const closeDetail = () => {
    setSelectedReport(null);
    setProblemDetail(null);
    setDetailError('');
  };

  const openGptCacheDetail = (row) => {
    setSelectedGptCacheRow(row || null);
  };

  const closeGptCacheDetail = () => {
    setSelectedGptCacheRow(null);
  };

  const toggleIpRow = (ipAddress) => {
    setExpandedIpRows((prev) => {
      const key = String(ipAddress || '');
      const isOpen = Boolean(prev[key]);
      if (isOpen) return {};
      return { [key]: true };
    });
  };

  const toggleReportGroup = (key) => {
    setExpandedReportGroups((prev) => {
      const isOpen = Boolean(prev[key]);
      if (isOpen) return {};
      return { [key]: true };
    });
  };

  const toggleSelectReportGroup = (key) => {
    setSelectedReportGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSelectAllReportGroups = () => {
    if (isAllSelected) {
      setSelectedReportGroups({});
      return;
    }
    const next = {};
    allGroupKeys.forEach((k) => {
      next[k] = true;
    });
    setSelectedReportGroups(next);
  };

  const handleDeleteSelectedReports = async () => {
    if (selectedReportIds.length === 0) return;
    await handleDeleteByIds(selectedReportIds, `선택한 신고 ${selectedReportIds.length}건을 삭제할까요?`);
  };

  const openDetail = async (report) => {
    setSelectedReport(report);
    setProblemDetail(null);
    setDetailError('');
    setDetailLoading(true);

    const rawSid = String(report?.originSessionId || report?.sessionId || '').trim();
    const sourceKey = String(report?.originSourceKey || '').trim();
    const sid = rawSid && rawSid !== 'random' ? rawSid : SOURCE_KEY_TO_SESSION_ID[sourceKey] || rawSid;
    const pno = Number(report?.originProblemNumber || report?.problemNumber);
    if (!sid || sid === '-' || Number.isNaN(pno)) {
      setDetailLoading(false);
      setDetailError('이 신고는 회차/문항 정보가 부족해서 상세 조회가 어렵습니다.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/problem?sessionId=${encodeURIComponent(sid)}&problemNumber=${pno}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.message || 'failed');
      }
      const data = await res.json();
      setProblemDetail(data);
    } catch (e) {
      setDetailError(`상세 조회 실패: ${String(e?.message || 'unknown error')}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleSelectReportItem = (id) => {
    const key = String(id || '').trim();
    if (!key) return;
    setSelectedReportItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isAllItemsSelectedByGroup = (group) => {
    const reports = group?.reports || [];
    const validIds = reports
      .map((r) => String(r?.id || '').trim())
      .filter(Boolean);
    if (validIds.length === 0) return false;
    return validIds.every((id) => Boolean(selectedReportItems[id]));
  };

  const toggleSelectAllItemsByGroup = (group) => {
    const reports = group?.reports || [];
    const validIds = reports
      .map((r) => String(r?.id || '').trim())
      .filter(Boolean);
    if (validIds.length === 0) return;

    const shouldSelectAll = !isAllItemsSelectedByGroup(group);
    setSelectedReportItems((prev) => {
      const next = { ...prev };
      validIds.forEach((id) => {
        next[id] = shouldSelectAll;
      });
      return next;
    });
  };

  const handleDeleteByIds = async (ids, confirmMessage = '선택한 신고를 삭제할까요?') => {
    const uniqueIds = [...new Set((ids || []).map((x) => String(x).trim()).filter(Boolean))];
    if (uniqueIds.length === 0) return;
    const ok = window.confirm(confirmMessage);
    if (!ok) return;

    try {
      const res = await fetch('/api/admin/reports', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: uniqueIds }),
      });
      if (!res.ok) throw new Error('failed');
      await load();
      setSelectedReportGroups({});
      setSelectedReportItems({});
      setExpandedReportGroups({});
      closeDetail();
      alert('선택한 신고가 삭제되었습니다.');
    } catch {
      alert('신고 삭제에 실패했습니다.');
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="text-slate-600 dark:text-slate-300">어드민 권한 확인 중...</div>
      </div>
    );
  }

  if (!unlocked) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-50">어드민 대시보드</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 px-3 py-2 text-xs font-semibold text-slate-600">
              {adminEmail}
            </span>
            <Link
              href="/admin/practical-hints"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              실기 힌트
            </Link>
            <Link
              href="/admin/ai-lab"
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-950/70"
            >
              AI 검증 실험실
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="px-4 py-2 rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 text-rose-700 font-semibold hover:bg-rose-100 dark:hover:bg-rose-950/60"
            >
              로그아웃
            </button>
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm">
              <span className="text-slate-600 dark:text-slate-300">구분 필터</span>
              <select
                value={adminExamTypeFilter}
                onChange={(e) => {
                  setAdminExamTypeFilter(e.target.value);
                  setGptCachePage(1);
                  setIpSearchPage(1);
                  setExpandedIpRows({});
                }}
                className="rounded border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 px-2 py-1"
              >
                {ADMIN_EXAM_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setShowCharts((v) => !v)}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white font-semibold hover:bg-slate-800"
            >
              {showCharts ? '차트 숨기기' : '차트 보기'}
            </button>
            <button
              onClick={load}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700"
            >
              새로고침
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 p-3 text-red-700">{error}</div>}

        <div className="rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-3 shadow-sm dark:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {LIST_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                    tab === t.key
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              현재 필터: {ADMIN_EXAM_TYPE_OPTIONS.find((o) => o.value === adminExamTypeFilter)?.label || '전체'}
            </div>
          </div>
        </div>

        {tab === 'themes' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm dark:shadow-none">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold text-slate-900 dark:text-slate-50">색상 통계</h2>
                <button onClick={load} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold">
                  새로고침
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <Info label="누적 색 변경 이벤트" value={metrics?.themeUsage?.totalThemeEvents ?? 0} />
                <Info label="현재 집계 사용자 수" value={(metrics?.themeUsage?.users || []).length} />
                <Info label="현재 사용 테마 수" value={(metrics?.themeUsage?.currentThemes || []).length} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm dark:shadow-none">
                <h3 className="mb-3 font-bold text-slate-900 dark:text-slate-50">현재 사용 테마 순위</h3>
                {(metrics?.themeUsage?.currentThemes || []).length === 0 ? (
                  <div className="text-slate-500 dark:text-slate-400">아직 색상 데이터가 없습니다.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-600 dark:text-slate-300">
                          <th className="py-2 pr-3">테마</th>
                          <th className="py-2 pr-3">사용자 수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(metrics?.themeUsage?.currentThemes || []).map((row) => (
                          <tr key={row.themeId} className="border-b border-slate-100 dark:border-slate-800">
                            <td className="py-2 pr-3">{row.themeId}</td>
                            <td className="py-2 pr-3 font-semibold">{row.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm dark:shadow-none">
                <h3 className="mb-3 font-bold text-slate-900 dark:text-slate-50">현재 custom 색상</h3>
                {(metrics?.themeUsage?.currentCustomColors || []).length === 0 ? (
                  <div className="text-slate-500 dark:text-slate-400">custom 색상 사용자가 없습니다.</div>
                ) : (
                  <div className="space-y-2">
                    {(metrics?.themeUsage?.currentCustomColors || []).map((row) => (
                      <div key={row.color} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className="h-5 w-5 rounded-full border border-slate-300 dark:border-slate-600" style={{ backgroundColor: row.color }} />
                          <span className="font-mono text-sm">{row.color}</span>
                        </div>
                        <span className="text-sm font-semibold">{row.count}명</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm dark:shadow-none">
              <h3 className="mb-3 font-bold text-slate-900 dark:text-slate-50">사용자별 현재 색상</h3>
              {(metrics?.themeUsage?.users || []).length === 0 ? (
                <div className="text-slate-500 dark:text-slate-400">아직 색상 변경 이력이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-600 dark:text-slate-300">
                        <th className="py-2 pr-3">사용자</th>
                        <th className="py-2 pr-3">clientId</th>
                        <th className="py-2 pr-3">테마</th>
                        <th className="py-2 pr-3">custom 색</th>
                        <th className="py-2 pr-3">경로</th>
                        <th className="py-2 pr-3">최근 변경</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(metrics?.themeUsage?.users || []).map((row) => (
                        <tr key={row.userKey} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-2 pr-3">{row.email || row.userKey}</td>
                          <td className="py-2 pr-3 font-mono text-xs">{row.clientId || '-'}</td>
                          <td className="py-2 pr-3 font-semibold">{row.themeId}</td>
                          <td className="py-2 pr-3">
                            {row.themeId === 'custom' && row.customColor ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="h-4 w-4 rounded-full border border-slate-300 dark:border-slate-600" style={{ backgroundColor: row.customColor }} />
                                <span className="font-mono text-xs">{row.customColor}</span>
                              </span>
                            ) : '-'}
                          </td>
                          <td className="py-2 pr-3 text-xs">{row.path || '-'}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(row.timestamp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'kpi' && (
          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
            <h2 className="font-bold text-slate-900 mb-3">요약 리스트</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2 pr-3">항목</th>
                    <th className="py-2 pr-3">값</th>
                  </tr>
                </thead>
                <tbody>
                  <Row
                    k="방문자 수"
                    v={Number(kpis.visitors || 0) + Number(kpis.googleUsers || 0)}
                  />
                  <Row k="완주 사용자" v={kpis.completedUsers} />
                  <Row k="완주율" v={`${kpis.completionRate}%`} />
                  <Row k="전체 합격률" v={`${kpis.passRate}%`} />
                  <Row k="시험 시작 건수" v={kpis.totalStarts} />
                  <Row k="시험 완료 건수" v={kpis.totalFinishes} />
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'daily' && (
          <ListTable
            title="일자별 리스트"
            loading={loading}
            emptyText="데이터가 없습니다."
            headers={['일자', '방문', '완료', '합격률']}
            rows={metrics.dailyTrend.map((r) => [r.date, r.방문, r.완료, `${r.합격률}%`])}
          />
        )}

        {tab === 'session' && (
          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900">회차별 리스트</h2>
              <div className="flex flex-wrap gap-2">
                {ADMIN_EXAM_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={`session-type-${opt.value}`}
                    onClick={() => setSessionTypeView(opt.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${
                      sessionTypeView === opt.value
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="text-slate-500">로딩 중...</div>
            ) : (metrics.sessionStats || []).length === 0 ? (
              <div className="text-slate-500">데이터가 없습니다.</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="px-3 py-2">구분</th>
                      <th className="px-3 py-2">회차</th>
                      <th className="px-3 py-2">시작</th>
                      <th className="px-3 py-2">완료</th>
                      <th className="px-3 py-2">합격률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics.sessionStats || [])
                      .filter((r) => sessionTypeView === 'all' || String(r.examType || '') === sessionTypeView)
                      .map((r, idx) => (
                        <tr key={`session-row:${r.session}:${idx}`} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-3 py-2">{examTypeLabel(r.examType)}</td>
                          <td className="px-3 py-2">{sessionLabelWithCode(r.session)}</td>
                          <td className="px-3 py-2">{r.시작}</td>
                          <td className="px-3 py-2">{r.완료}</td>
                          <td className="px-3 py-2 font-semibold text-sky-700">{r.합격률}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'subject' && (
          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900">과목별 리스트</h2>
              <div className="flex flex-wrap gap-2">
                {ADMIN_EXAM_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={`subject-type-${opt.value}`}
                    onClick={() => setSubjectTypeView(opt.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${
                      subjectTypeView === opt.value
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="text-slate-500">로딩 중...</div>
            ) : (metrics.subjectAverages || []).length === 0 ? (
              <div className="text-slate-500">데이터가 없습니다.</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="px-3 py-2">구분</th>
                      <th className="px-3 py-2">과목</th>
                      <th className="px-3 py-2">평균 정답률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics.subjectAverages || [])
                      .filter((r) => subjectTypeView === 'all' || String(r.examType || '') === subjectTypeView)
                      .sort((a, b) => {
                        const typeCmp = String(a.examType || '').localeCompare(String(b.examType || ''), 'ko');
                        if (typeCmp !== 0) return typeCmp;
                        return String(a.subject || '').localeCompare(String(b.subject || ''), 'ko');
                      })
                      .map((r, idx) => (
                        <tr key={`subject-row:${r.examType}:${r.subject}:${idx}`} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-3 py-2">{examTypeLabel(r.examType)}</td>
                          <td className="px-3 py-2">{r.subject}</td>
                          <td className="px-3 py-2 font-semibold text-sky-700">{r.정답률}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'ipSearch' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="font-bold text-slate-900">사용자 조회</h2>
                <button
                  onClick={loadIpSearch}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm font-semibold"
                >
                  새로고침
                </button>
              </div>

              <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                로그인한 사용자는 이벤트에 이메일이 기록됩니다. 과거 데이터는 이메일이 비어 있어 검색 결과에 나타나지 않을 수 있습니다.
              </div>

              <div className="flex flex-wrap items-end gap-2 mb-3">
                <label className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">기준</span>
                  <select
                    value={ipSearchEntity}
                    onChange={(e) => {
                      setIpSearchEntity(e.target.value);
                      setIpSearchPage(1);
                      setExpandedIpRows({});
                    }}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="email">이메일</option>
                    <option value="client">사람(clientId)</option>
                    <option value="ip">IP</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">기간</span>
                  <select
                    value={ipSearchScope}
                    onChange={(e) => {
                      setIpSearchScope(e.target.value);
                      setIpSearchPage(1);
                      setExpandedIpRows({});
                    }}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="today">오늘 들어온 사람 보기</option>
                    <option value="all">지금까지 들어온 사람들 보기</option>
                    <option value="todayVisit">오늘 visit_test 있는 사람</option>
                    <option value="7d">최근 7일</option>
                    <option value="30d">최근 30일</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">
                    {ipSearchEntity === 'email' ? '이메일 검색' : ipSearchEntity === 'client' ? 'clientId 검색' : 'IP 검색'}
                  </span>
                  <input
                    value={ipSearchQuery}
                    onChange={(e) => setIpSearchQuery(e.target.value)}
                    placeholder={
                      ipSearchEntity === 'email'
                        ? '예: example@gmail.com'
                        : ipSearchEntity === 'client'
                          ? '예: anon_ 또는 clientId 일부'
                          : '예: 123.45 또는 192.168'
                    }
                    className="w-56 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={ipExcludeLocal}
                    onChange={(e) => {
                      setIpExcludeLocal(e.target.checked);
                      setIpSearchPage(1);
                      setExpandedIpRows({});
                    }}
                  />
                  <span className="text-sm text-slate-700">로컬 IP 자동 제외 (::1, 127.0.0.1)</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">제외 IP(화이트리스트)</span>
                  <input
                    value={ipExcludeWhitelistText}
                    onChange={(e) => setIpExcludeWhitelistText(e.target.value)}
                    placeholder="예: 14.55.124.241, 14.55.142.91"
                    className="w-72 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <button
                  onClick={() => {
                    setIpSearchPage(1);
                    loadIpSearch();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700"
                >
                  검색
                </button>
                <button
                  onClick={() => {
                    setIpSearchQuery('');
                    setIpExcludeLocal(true);
                    setIpExcludeWhitelistText('');
                    setIpSearchPage(1);
                    setExpandedIpRows({});
                    setTimeout(loadIpSearch, 0);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-semibold hover:bg-slate-50"
                >
                  초기화
                </button>
                <label className="ml-auto flex items-center gap-1 text-sm">
                  <span className="text-slate-600">페이지 크기</span>
                  <select
                    value={ipSearchPageSize}
                    onChange={(e) => {
                      setIpSearchPageSize(Number(e.target.value));
                      setIpSearchPage(1);
                    }}
                    className="rounded border border-slate-300 px-2 py-1"
                  >
                    {[10, 20, 50, 100].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
                <Info label="전체 이벤트" value={ipSearchData?.summary?.totalEvents ?? 0} />
                <Info label="IP 포함 이벤트" value={ipSearchData?.summary?.totalEventsWithIp ?? 0} />
                <Info
                  label={`검색된 ${
                    ipSearchEntity === 'email' ? '이메일 사용자' : ipSearchEntity === 'client' ? '사람(clientId)' : 'IP'
                  } 수`}
                  value={ipSearchData?.summary?.matchedRows ?? ipSearchData?.summary?.matchedIps ?? 0}
                />
                <Info label="외부 추정 사용자 수" value={ipSearchData?.summary?.estimatedExternalUniqueClients ?? 0} />
                <Info label="검색어" value={ipSearchData?.summary?.query || '전체'} />
              </div>
              <div className="mt-2 text-xs text-slate-600">
                적용 필터: 로컬 IP 자동 제외 {ipSearchData?.summary?.excludeLocal ? 'ON' : 'OFF'}
                {ipFilterExcludedIps.length > 0 ? ` · 화이트리스트 제외 ${ipFilterExcludedIps.length}개` : ''}
              </div>

              {ipSearchError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
                  {ipSearchError}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
              {ipSearchLoading ? (
                <div className="text-slate-500">로딩 중...</div>
              ) : (ipSearchData?.rows || []).length === 0 ? (
                <div className="text-slate-500">사용자 데이터가 없습니다.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-600">
                          <th className="py-2 pr-3">상세</th>
                          <th className="py-2 pr-3">
                            <button onClick={() => toggleIpSort('identifier')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                              <span>{ipEntityLabel}</span><span>{ipSortMark('identifier')}</span>
                            </button>
                          </th>
                          <th className="py-2 pr-3">주요 구분</th>
                          <th className="py-2 pr-3">
                            <button onClick={() => toggleIpSort('totalEvents')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                              <span>총 이벤트</span><span>{ipSortMark('totalEvents')}</span>
                            </button>
                          </th>
                          <th className="py-2 pr-3">
                            <button onClick={() => toggleIpSort('todayEvents')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                              <span>오늘 이벤트</span><span>{ipSortMark('todayEvents')}</span>
                            </button>
                          </th>
                          <th className="py-2 pr-3">
                            <button onClick={() => toggleIpSort('todayVisits')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                              <span>오늘 visit_test</span><span>{ipSortMark('todayVisits')}</span>
                            </button>
                          </th>
                          <th className="py-2 pr-3">
                            <button onClick={() => toggleIpSort('uniqueClients')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                              <span>{ipCounterpartLabel}</span><span>{ipSortMark('uniqueClients')}</span>
                            </button>
                          </th>
                          <th className="py-2 pr-3">{ipTodayCounterpartLabel}</th>
                          <th className="py-2 pr-3">회차 수</th>
                          <th className="py-2 pr-3">
                            <button onClick={() => toggleIpSort('lastSeen')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                              <span>최근 접속</span><span>{ipSortMark('lastSeen')}</span>
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(ipSearchData.rows || []).map((r) => {
                          const rowKey = r.identifier || r.ipAddress || r.clientIdKey;
                          const isOpen = Boolean(expandedIpRows[rowKey]);
                          return (
                            <Fragment key={rowKey}>
                              <tr className="border-b border-slate-100">
                                <td className="py-2 pr-3">
                                  <button
                                    onClick={() => toggleIpRow(rowKey)}
                                    className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                                  >
                                    {isOpen ? '▲' : '▼'}
                                  </button>
                                </td>
                                <td className="py-2 pr-3 font-mono text-xs md:text-sm">{r.identifier || '-'}</td>
                                <td className="py-2 pr-3">{examTypeLabel(r.majorExamType)}</td>
                                <td className="py-2 pr-3 font-semibold">{r.totalEvents}</td>
                                <td className="py-2 pr-3">{r.todayEventCount}</td>
                                <td className="py-2 pr-3">{r.todayVisitCount}</td>
                                <td className="py-2 pr-3">
                                  {ipSearchEntity === 'client' ? r.uniqueIpCount : r.uniqueClientCount}
                                </td>
                                <td className="py-2 pr-3">
                                  {ipSearchEntity === 'client' ? r.todayUniqueIpCount : r.todayUniqueClientCount}
                                </td>
                                <td className="py-2 pr-3">{r.uniqueSessionCount}</td>
                                <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(r.lastSeen)}</td>
                              </tr>
                              {isOpen && (
                                <tr className="bg-slate-50">
                                  <td colSpan={10} className="px-3 pb-3">
                                    <div className="rounded-lg border border-slate-200 bg-white p-3 mt-2">
                                      <div className="mb-3 flex flex-wrap gap-2 text-xs">
                                        {['written', 'practical', 'sqld', 'aiprompt'].map((type) => (
                                          <span key={type} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                                            {examTypeLabel(type)} {(r.typeCounts?.[type] || 0)}
                                          </span>
                                        ))}
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                        <div className="rounded border border-slate-200 p-2">
                                          <p className="text-xs text-slate-500">첫 접속</p>
                                          <p className="text-sm font-semibold">{fmtTime(r.firstSeen)}</p>
                                        </div>
                                        <div className="rounded border border-slate-200 p-2">
                                          <p className="text-xs text-slate-500">최근 접속</p>
                                          <p className="text-sm font-semibold">{fmtTime(r.lastSeen)}</p>
                                        </div>
                                      </div>
                                      <div className="mb-3">
                                        <p className="text-xs font-semibold text-slate-600 mb-1">
                                          {ipSearchEntity === 'email'
                                            ? 'clientId 미리보기 (최대 5개)'
                                            : ipSearchEntity === 'client'
                                              ? 'IP 미리보기 (최대 5개)'
                                              : 'clientId 미리보기 (최대 5개)'}
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                          {(ipSearchEntity === 'client' ? r.ipAddressesPreview : r.clientIdsPreview || []).length > 0 ? (
                                            (ipSearchEntity === 'client' ? r.ipAddressesPreview : r.clientIdsPreview).map((cid) => (
                                              <span key={cid} className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-mono">
                                                {cid}
                                              </span>
                                            ))
                                          ) : (
                                            <span className="text-xs text-slate-500">없음</span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="overflow-x-auto max-h-64 overflow-y-auto rounded border border-slate-200">
                                        <table className="min-w-full text-xs">
                                          <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                                              <th className="px-2 py-1">시간</th>
                                              <th className="px-2 py-1">타입</th>
                                              <th className="px-2 py-1">세션</th>
                                              <th className="px-2 py-1">
                                                {ipSearchEntity === 'email'
                                                  ? '이메일'
                                                  : ipSearchEntity === 'client'
                                                    ? 'IP'
                                                    : 'clientId'}
                                              </th>
                                              <th className="px-2 py-1">path</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(r.recentEvents || []).map((ev) => (
                                              <tr key={ev.id} className="border-b border-slate-100">
                                                <td className="px-2 py-1 whitespace-nowrap">{fmtTime(ev.timestamp)}</td>
                                                <td className="px-2 py-1">{ev.type || '-'}</td>
                                                <td className="px-2 py-1">{sessionLabel(ev.sessionId)}</td>
                                                <td className="px-2 py-1 font-mono">
                                                  {ipSearchEntity === 'email'
                                                    ? (ev.email || '-')
                                                    : ipSearchEntity === 'client'
                                                      ? (ev.ipAddress || '-')
                                                      : (ev.clientId || '-')}
                                                </td>
                                                <td className="px-2 py-1">{ev.path || '-'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="text-slate-600">
                      페이지 {ipSearchData.page} / {ipSearchData.totalPages} · 현재 {ipSearchData.rows.length}{ipRowsLabel} 표시
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIpSearchPage((p) => Math.max(1, p - 1))}
                        disabled={ipSearchData.page <= 1}
                        className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        이전
                      </button>
                      <button
                        onClick={() => setIpSearchPage((p) => Math.min(ipSearchData.totalPages || 1, p + 1))}
                        disabled={ipSearchData.page >= (ipSearchData.totalPages || 1)}
                        className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        다음
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'gptCache' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="font-bold text-slate-900">GPT 이의신청 캐시 조회</h2>
                <button
                  onClick={loadGptCache}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm font-semibold"
                >
                  캐시 새로고침
                </button>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setGptSectionView('top')}
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    gptSectionView === 'top'
                      ? 'border-sky-600 bg-sky-600 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  가장 많이 조회된 문제
                </button>
                <button
                  onClick={() => setGptSectionView('detail')}
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    gptSectionView === 'detail'
                      ? 'border-sky-600 bg-sky-600 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  캐시 상세 목록
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
                <Info label="전체 캐시 행" value={gptCacheData?.summary?.totalRows ?? 0} />
                <Info label="전체 캐시 조회수" value={gptCacheData?.summary?.totalHits ?? 0} />
                <Info label="필터 결과 행" value={gptCacheData?.summary?.filteredRows ?? 0} />
                <Info label="필터 결과 조회수" value={gptCacheData?.summary?.filteredHits ?? 0} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {(gptCacheData?.summary?.subjects || []).map((s) => (
                  <div key={s.subject} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm font-bold text-slate-900">{s.subject}</div>
                    <div className="mt-1 text-xs text-slate-600">캐시 행 {s.rows} / 조회수 {s.hits}</div>
                  </div>
                ))}
              </div>

              {gptCacheError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
                  {gptCacheError}
                </div>
              )}
            </div>

            {gptSectionView === 'top' && (
              <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-slate-900">가장 많이 조회된 문제 (캐시 기준)</h3>
                <div className="flex flex-wrap gap-2">
                  {ADMIN_EXAM_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={`gpt-top-type-${opt.value}`}
                      onClick={() => setGptTopTypeView(opt.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        gptTopTypeView === opt.value
                          ? 'border-sky-600 bg-sky-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {gptCacheLoading ? (
                <div className="text-slate-500">로딩 중...</div>
              ) : filteredGptTopProblems.length === 0 ? (
                <div className="text-slate-500">캐시 데이터가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-600">
                        <th className="py-2 pr-3">
                          <button onClick={() => toggleGptTopSort('subject')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                            <span>과목</span><span>{gptTopSortMark('subject')}</span>
                          </button>
                        </th>
                        <th className="py-2 pr-3">
                          <button onClick={() => toggleGptTopSort('session')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                            <span>원본 회차</span><span>{gptTopSortMark('session')}</span>
                          </button>
                        </th>
                        <th className="py-2 pr-3">
                          <button onClick={() => toggleGptTopSort('problem')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                            <span>원본 문항</span><span>{gptTopSortMark('problem')}</span>
                          </button>
                        </th>
                        <th className="py-2 pr-3">
                          <button onClick={() => toggleGptTopSort('hits')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                            <span>캐시 조회수</span><span>{gptTopSortMark('hits')}</span>
                          </button>
                        </th>
                        <th className="py-2 pr-3">
                          <button onClick={() => toggleGptTopSort('cacheRows')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                            <span>캐시 행 수</span><span>{gptTopSortMark('cacheRows')}</span>
                          </button>
                        </th>
                        <th className="py-2 pr-3">
                          <button onClick={() => toggleGptTopSort('likes')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                            <span>좋아요</span><span>{gptTopSortMark('likes')}</span>
                          </button>
                        </th>
                        <th className="py-2 pr-3">
                          <button onClick={() => toggleGptTopSort('dislikes')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                            <span>싫어요</span><span>{gptTopSortMark('dislikes')}</span>
                          </button>
                        </th>
                        <th className="py-2 pr-3">
                          <button onClick={() => toggleGptTopSort('latest')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                            <span>최근 생성</span><span>{gptTopSortMark('latest')}</span>
                          </button>
                        </th>
                        <th className="py-2">문제 요약</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGptTopProblems.slice(0, 30).map((r) => (
                        <tr key={r.key} className="border-b border-slate-100">
                          <td className="py-2 pr-3">{r.subject ? `${r.subject}과목` : '-'}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{sessionLabel(r.sourceSessionId)}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{r.sourceProblemNumber}</td>
                          <td className="py-2 pr-3 font-semibold text-slate-900">{r.totalHits}</td>
                          <td className="py-2 pr-3">{r.cacheRows}</td>
                          <td className="py-2 pr-3 text-emerald-700">{r.totalLike ?? 0}</td>
                          <td className="py-2 pr-3 text-rose-700">{r.totalDislike ?? 0}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(r.latestCreatedAt)}</td>
                          <td className="py-2">{r.sampleQuestionText || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </div>
            )}

            {gptSectionView === 'detail' && (
              <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="font-bold text-slate-900">캐시 상세 목록 (페이지네이션)</h3>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="flex items-center gap-1">
                    <span className="text-slate-600">구분</span>
                    <div className="flex flex-wrap gap-1">
                      {ADMIN_EXAM_TYPE_OPTIONS.map((opt) => (
                        <button
                          key={`gpt-detail-type-${opt.value}`}
                          onClick={() => setGptDetailTypeView(opt.value)}
                          className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
                            gptDetailTypeView === opt.value
                              ? 'border-sky-600 bg-sky-600 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-slate-600">회차</span>
                    <select
                      value={gptCacheSessionFilter}
                      onChange={(e) => {
                        setGptCacheSessionFilter(e.target.value);
                        setGptCachePage(1);
                      }}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      <option value="">전체</option>
                      {Object.entries(SESSION_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-center gap-1">
                    <span className="text-slate-600">문항</span>
                    <input
                      value={gptCacheProblemFilter}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, '');
                        setGptCacheProblemFilter(v);
                        setGptCachePage(1);
                      }}
                      placeholder="예: 12"
                      className="w-20 rounded border border-slate-300 px-2 py-1"
                    />
                  </label>

                  <label className="flex items-center gap-1">
                    <span className="text-slate-600">피드백</span>
                    <select
                      value={gptCacheFeedbackFilter}
                      onChange={(e) => {
                        setGptCacheFeedbackFilter(e.target.value);
                        setGptCachePage(1);
                      }}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      <option value="all">전체</option>
                      <option value="hasFeedback">평가 있음</option>
                      <option value="liked">좋아요 우세</option>
                      <option value="disliked">싫어요 우세</option>
                      <option value="likeOnly">좋아요 있음</option>
                      <option value="dislikeOnly">싫어요 있음</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-1">
                    <span className="text-slate-600">페이지 크기</span>
                    <select
                      value={gptCachePageSize}
                      onChange={(e) => {
                        setGptCachePageSize(Number(e.target.value));
                        setGptCachePage(1);
                      }}
                      className="rounded border border-slate-300 px-2 py-1"
                    >
                      {[10, 20, 50, 100].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {gptCacheLoading ? (
                <div className="text-slate-500">로딩 중...</div>
              ) : filteredGptCacheRows.length === 0 ? (
                <div className="text-slate-500">캐시 데이터가 없습니다.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-600">
                          <th className="py-2 pr-3">
                            <button onClick={() => toggleGptCacheSort('subject')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                              <span>과목</span><span>{gptCacheSortMark('subject')}</span>
                            </button>
                          </th>
                          <th className="py-2 pr-3">
                            <button onClick={() => toggleGptCacheSort('session')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                              <span>원본 회차</span><span>{gptCacheSortMark('session')}</span>
                            </button>
                          </th>
                          <th className="py-2 pr-3">
                            <button onClick={() => toggleGptCacheSort('problem')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                              <span>원본 문항</span><span>{gptCacheSortMark('problem')}</span>
                            </button>
                          </th>
                          <th className="py-2 pr-3">
                            <button onClick={() => toggleGptCacheSort('hits')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                              <span>조회수</span><span>{gptCacheSortMark('hits')}</span>
                            </button>
                          </th>
                          <th className="py-2 pr-3">좋아요</th>
                          <th className="py-2 pr-3">싫어요</th>
                          <th className="py-2 pr-3">
                            <button onClick={() => toggleGptCacheSort('created_at')} className="flex w-full items-center justify-between font-semibold hover:text-slate-900">
                              <span>생성시각</span><span>{gptCacheSortMark('created_at')}</span>
                            </button>
                          </th>
                          <th className="py-2">질문 요약</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredGptCacheRows.map((r) => (
                          <tr
                            key={r.cacheKey}
                            className="border-b border-slate-100 cursor-pointer hover:bg-slate-50"
                            onClick={() => openGptCacheDetail(r)}
                          >
                            <td className="py-2 pr-3 whitespace-nowrap">{r.subject ? `${r.subject}과목` : '-'}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{sessionLabel(r.sourceSessionId)}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{r.sourceProblemNumber}</td>
                            <td className="py-2 pr-3 font-semibold text-slate-900">{r.hitCount}</td>
                            <td className="py-2 pr-3 text-emerald-700">{r.likeCount}</td>
                            <td className="py-2 pr-3 text-rose-700">{r.dislikeCount}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(r.createdAt)}</td>
                            <td className="py-2">
                              <div className="max-w-[520px] truncate" title={r.questionText || r.userQuestion || ''}>
                                {r.questionText || r.userQuestion || '-'}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="text-slate-600">
                      페이지 {gptCacheData.page} / {gptCacheData.totalPages} · 현재 {filteredGptCacheRows.length}건 표시
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setGptCachePage((p) => Math.max(1, p - 1))}
                        disabled={gptCacheData.page <= 1}
                        className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        이전
                      </button>
                      <button
                        onClick={() => setGptCachePage((p) => Math.min(gptCacheData.totalPages || 1, p + 1))}
                        disabled={gptCacheData.page >= (gptCacheData.totalPages || 1)}
                        className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        다음
                      </button>
                    </div>
                  </div>
                </>
              )}
              </div>
            )}
          </div>
        )}

        {tab === 'reports' && (
          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-slate-900">신고 리스트 (클릭하면 상세 확인)</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeleteSelectedReports}
                  disabled={selectedReportIds.length === 0}
                  className="px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  선택 삭제
                </button>
              </div>
            </div>
            <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
              <p className="mb-2 text-sm font-bold text-violet-900">GPT 답변 좋아요/싫어요 집계</p>
              <div className="mb-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <div className="rounded border border-violet-200 bg-white px-2 py-1">
                  총 평가: <span className="font-extrabold">{metrics?.gptFeedback?.summary?.total ?? 0}</span>
                </div>
                <div className="rounded border border-emerald-200 bg-white px-2 py-1 text-emerald-700">
                  좋아요: <span className="font-extrabold">{metrics?.gptFeedback?.summary?.liked ?? 0}</span>
                </div>
                <div className="rounded border border-rose-200 bg-white px-2 py-1 text-rose-700">
                  싫어요: <span className="font-extrabold">{metrics?.gptFeedback?.summary?.disliked ?? 0}</span>
                </div>
                <div className="rounded border border-violet-200 bg-white px-2 py-1">
                  호감도: <span className="font-extrabold">{metrics?.gptFeedback?.summary?.netLikeRatio ?? 0}%</span>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto rounded border border-violet-200 bg-white">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-violet-100 bg-violet-50 text-left text-violet-900">
                      <th className="px-2 py-1">원본</th>
                      <th className="px-2 py-1">좋아요</th>
                      <th className="px-2 py-1">싫어요</th>
                      <th className="px-2 py-1">캐시사용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics?.gptFeedback?.items || []).slice(0, 30).map((r, i) => (
                      <tr key={`${r.cacheKey || i}`} className="border-b border-violet-50">
                        <td className="px-2 py-1">{sessionLabel(r.sourceSessionId)}-{r.sourceProblemNumber}</td>
                        <td className="px-2 py-1 font-semibold text-emerald-700">{r.like}</td>
                        <td className="px-2 py-1 font-semibold text-rose-700">{r.dislike}</td>
                        <td className="px-2 py-1">{r.hitCount}</td>
                      </tr>
                    ))}
                    {(!metrics?.gptFeedback?.items || metrics.gptFeedback.items.length === 0) && (
                      <tr>
                        <td colSpan={4} className="px-2 py-2 text-slate-500">아직 GPT 평가 데이터가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {loading ? (
              <div className="text-slate-500">로딩 중...</div>
            ) : sortedGroupedReports.length === 0 ? (
              <div className="text-slate-500">신고 내역이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-300 text-left text-slate-700 bg-slate-50">
                      <th className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAllReportGroups}
                          aria-label="전체 선택"
                        />
                      </th>
                      <th className="py-2 pr-3">
                        <button
                          onClick={() => toggleReportSort('session')}
                          className="flex w-full items-center justify-between font-semibold hover:text-slate-900"
                        >
                          <span>원본 회차</span>
                          <span>{sortMark('session')}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-3">원본 문항</th>
                      <th className="py-2 pr-3">
                        <button
                          onClick={() => toggleReportSort('count')}
                          className="flex w-full items-center justify-between font-semibold hover:text-slate-900"
                        >
                          <span>신고 수</span>
                          <span>{sortMark('count')}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-3">
                        <button
                          onClick={() => toggleReportSort('latest')}
                          className="flex w-full items-center justify-between font-semibold hover:text-slate-900"
                        >
                          <span>최근 신고</span>
                          <span>{sortMark('latest')}</span>
                        </button>
                      </th>
                      <th className="py-2 pr-3">회차</th>
                      <th className="py-2">문제 요약</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedGroupedReports.map((g, gi) => {
                      const isOpen = Boolean(expandedReportGroups[g.key]);
                      const firstReport = g.reports[0];
                      return (
                        <Fragment key={g.key}>
                          <tr key={g.key} className="align-top cursor-pointer" onClick={() => toggleReportGroup(g.key)}>
                            <td
                              className={`py-2 pr-2 whitespace-nowrap border-l border-slate-200 ${
                                isOpen
                                  ? 'bg-sky-50 border-t rounded-tl-lg'
                                  : 'bg-white border-y rounded-l-lg'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(selectedReportGroups[g.key])}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleSelectReportGroup(g.key)}
                                aria-label={`선택 ${g.sourceSessionId}-${g.sourceProblemNumber}`}
                              />
                            </td>
                            <td
                              className={`py-2 pr-3 whitespace-nowrap border-slate-200 ${
                                isOpen ? 'bg-sky-50 border-t' : 'bg-white border-y'
                              }`}
                            >
                              {sessionLabel(g.sourceSessionId)}
                            </td>
                            <td
                              className={`py-2 pr-3 whitespace-nowrap border-slate-200 ${
                                isOpen ? 'bg-sky-50 border-t' : 'bg-white border-y'
                              }`}
                            >
                              {g.sourceProblemNumber}
                            </td>
                            <td
                              className={`py-2 pr-3 whitespace-nowrap font-semibold text-slate-900 border-slate-200 ${
                                isOpen ? 'bg-sky-50 border-t' : 'bg-white border-y'
                              }`}
                            >
                              {g.count}
                            </td>
                            <td
                              className={`py-2 pr-3 whitespace-nowrap border-slate-200 ${
                                isOpen ? 'bg-sky-50 border-t' : 'bg-white border-y'
                              }`}
                            >
                              {fmtTime(g.latestTimestamp)}
                            </td>
                            <td
                              className={`py-2 pr-3 whitespace-nowrap border-slate-200 ${
                                isOpen ? 'bg-sky-50 border-t' : 'bg-white border-y'
                              }`}
                            >
                              {sessionLabel(firstReport?.sessionId || '-')}
                            </td>
                            <td
                              className={`py-2 pr-3 border-r border-slate-200 ${
                                isOpen
                                  ? 'bg-sky-50 border-t rounded-tr-lg'
                                  : 'bg-white border-y rounded-r-lg'
                              }`}
                            >
                              {g.questionText || '-'}
                            </td>
                            
                          </tr>
                          {isOpen && (
                            <tr className="bg-sky-50/40">
                              <td colSpan={7} className="pb-3 pl-6 pr-3 border-x border-b border-slate-200 rounded-b-lg">
                                <div className="rounded-lg bg-white p-3">
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold text-slate-600">개별 신고 이력</p>
                                    <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200">
                                      {g.reports.length}건
                                    </span>
                                  </div>
                                  <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-md">
                                    <table className="min-w-full text-xs">
                                      <thead>
                                        <tr className="border-b border-slate-200 text-left text-slate-600 bg-white">
                                          <th className="py-1 pr-2">
                                            <label className="inline-flex items-center gap-1">
                                              <input
                                                type="checkbox"
                                                checked={isAllItemsSelectedByGroup(g)}
                                                onChange={() => toggleSelectAllItemsByGroup(g)}
                                                aria-label="상세 전체 선택"
                                              />
                                              <span>전체</span>
                                            </label>
                                          </th>
                                          <th className="py-1 pr-2">
                                            <button
                                              onClick={() => toggleDetailSort(g.key, 'time')}
                                              className="flex w-full items-center justify-between font-semibold hover:text-slate-900"
                                            >
                                              <span>시간</span>
                                              <span>{detailSortMark(g.key, 'time')}</span>
                                            </button>
                                          </th>
                                          <th className="py-1 pr-2">회차</th>
                                          <th className="py-1 pr-2">
                                            <button
                                              onClick={() => toggleDetailSort(g.key, 'problem')}
                                              className="flex w-full items-center justify-between font-semibold hover:text-slate-900"
                                            >
                                              <span>문항</span>
                                              <span>{detailSortMark(g.key, 'problem')}</span>
                                            </button>
                                          </th>
                                          <th className="py-1 pr-2">사유</th>
                                          <th className="py-1">상세</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {getSortedDetailReports(g).map((r, i) => (
                                          <tr key={`${g.key}:${r.timestamp}:${i}`} className="cursor-pointer bg-white hover:bg-slate-50" onClick={() => openDetail(r)}>
                                            <td className="py-1 pr-2 whitespace-nowrap">
                                              <input
                                                type="checkbox"
                                                checked={Boolean(r?.id && selectedReportItems[String(r.id)])}
                                                disabled={!r?.id}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={() => toggleSelectReportItem(r?.id)}
                                                aria-label={`선택 ${r?.id || i}`}
                                              />
                                            </td>
                                            <td className="py-1 pr-2 whitespace-nowrap">{fmtTime(r.timestamp)}</td>
                                            <td className="py-1 pr-2 whitespace-nowrap">{sessionLabel(r.sessionId)}</td>
                                            <td className="py-1 pr-2 whitespace-nowrap">{r.problemNumber}</td>
                                            <td className="py-1 pr-2">{r.reason}</td>
                                            <td className="py-1">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openDetail(r);
                                                }}
                                                className="px-2 py-1 rounded border border-sky-300 text-sky-700 hover:bg-sky-50 font-semibold"
                                              >
                                                상세
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          <tr aria-hidden className="h-3 bg-white">
                            <td colSpan={7} />
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {showCharts && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="최근 14일 방문/완료/합격률 추이" loading={loading}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={metrics.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                  <Tooltip />
                  <Line yAxisId="left" type="monotone" dataKey="방문" stroke="#0284c7" strokeWidth={2} />
                  <Line yAxisId="left" type="monotone" dataKey="완료" stroke="#0f766e" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="합격률" stroke="#ea580c" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="문제 신고 사유별 건수" loading={loading}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={metrics.reportReasons}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="reason" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f43f5e" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}
      </div>

      {selectedGptCacheRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={closeGptCacheDetail}>
          <div
            className="w-full max-w-4xl rounded-xl bg-white border border-slate-200 p-5 shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-extrabold text-slate-900">GPT 캐시 상세</h3>
              <button onClick={closeGptCacheDetail} className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">닫기</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-4">
              <Info label="과목" value={selectedGptCacheRow.subject ? `${selectedGptCacheRow.subject}과목` : '-'} />
              <Info label="원본 회차" value={sessionLabel(selectedGptCacheRow.sourceSessionId)} />
              <Info label="원본 문항" value={selectedGptCacheRow.sourceProblemNumber} />
              <Info label="생성시각" value={fmtTime(selectedGptCacheRow.createdAt)} />
              <Info label="조회수" value={selectedGptCacheRow.hitCount} />
              <Info label="좋아요" value={selectedGptCacheRow.likeCount} />
              <Info label="싫어요" value={selectedGptCacheRow.dislikeCount} />
              <Info label="캐시 키" value={selectedGptCacheRow.cacheKey || '-'} />
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-700 mb-1">문제 텍스트</p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{selectedGptCacheRow.questionText || '-'}</p>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-700 mb-1">사용자 질문</p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{selectedGptCacheRow.userQuestion || '-'}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-700 mb-1">사용자 선택 정답</p>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{selectedGptCacheRow.selectedAnswer || '-'}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-sm font-semibold text-green-800 mb-1">문제 정답</p>
                  <p className="text-sm text-green-900 whitespace-pre-wrap">{selectedGptCacheRow.correctAnswer || '-'}</p>
                </div>
              </div>

              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-sm font-semibold text-indigo-800 mb-1">GPT 답변(캐시)</p>
                <p className="text-sm text-indigo-950 whitespace-pre-wrap">{selectedGptCacheRow.answer || '답변 없음'}</p>
              </div>

              <div className="flex justify-end">
                <a
                  href={buildProblemPagePath(selectedGptCacheRow.sourceSessionId, selectedGptCacheRow.sourceProblemNumber)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700"
                >
                  문제 페이지로 이동
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white border border-slate-200 p-5 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-extrabold text-slate-900">신고 상세</h3>
              <button onClick={closeDetail} className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">닫기</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-4">
              <Info label="시간" value={fmtTime(selectedReport.timestamp)} />
              <Info label="회차" value={selectedReport.sessionId} />
              <Info label="문항" value={selectedReport.problemNumber} />
              <Info
                label="원본"
                value={
                  selectedReport.originSessionId && selectedReport.originProblemNumber
                    ? `${sessionLabel(selectedReport.originSessionId)}-${selectedReport.originProblemNumber}`
                    : '-'
                }
              />
              <Info label="사유" value={selectedReport.reason} />
            </div>

            {detailLoading && <div className="text-slate-500">문제 상세 로딩 중...</div>}
            {detailError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{detailError}</div>}

            {!detailLoading && !detailError && problemDetail && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-indigo-700">{problemDetail.sectionTitle}</p>
                  <p className="mt-1 text-base font-bold text-slate-900">{problemDetail.problemNumber}. {problemDetail.questionText}</p>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-700 mb-2">선택지</p>
                  <ul className="space-y-1 text-sm text-slate-800">
                    {(problemDetail.options || []).map((opt, idx) => (
                      <li key={idx}>{idx + 1}. {opt}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-sm font-semibold text-green-800">정답: {problemDetail.answerText || '-'}</p>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-700 mb-1">해설</p>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{problemDetail.commentText || '해설 없음'}</p>
                </div>

                <div className="flex justify-end">
                  <a
                    href={problemDetail.gotoPath}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700"
                  >
                    문제 페이지로 이동
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="py-2 pr-3">{k}</td>
      <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">{v}</td>
    </tr>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{value || '-'}</p>
    </div>
  );
}

function ListTable({ title, loading, emptyText, headers, rows }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm dark:shadow-none">
      <h2 className="font-bold text-slate-900 dark:text-slate-50 mb-3">{title}</h2>
      {loading ? (
        <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
      ) : !rows || rows.length === 0 ? (
        <div className="text-slate-500 dark:text-slate-400">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-600 dark:text-slate-300">
                {headers.map((h) => (
                  <th key={h} className="py-2 pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                  {r.map((cell, j) => (
                    <td key={j} className="py-2 pr-3">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, loading, children }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm dark:shadow-none">
      <h2 className="font-bold text-slate-900 dark:text-slate-50 mb-3">{title}</h2>
      {loading ? <div className="h-[300px] flex items-center justify-center text-slate-500 dark:text-slate-400">로딩 중...</div> : children}
    </div>
  );
}
