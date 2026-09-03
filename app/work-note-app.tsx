'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Clipboard, Cloud, CloudOff, Copy, LogOut, MoreHorizontal, Plus, RefreshCw, Sparkles } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

type Project = { id: string; name: string; createdAt: string };
type Memo = { id: string; projectId: string; content: string; createdAt: string; updatedAt: string };
type TodoItem = { id: string; text: string; completed: boolean };
type DailySummary = { id: string; projectId: string; date: string; rawText: string; currentStatus: string; decisions: string[]; progress: TodoItem[]; nextActions: TodoItem[]; note: string; createdAt: string; updatedAt: string };
type AppData = { projects: Project[]; memos: Memo[]; summaries: DailySummary[] };

const STORAGE_KEY = 'quick-work-notes:v1';
const SYNC_META_KEY = 'quick-work-notes:sync:v1';
type SyncStatus = 'local' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';
type SyncMeta = { userId?: string; dirty: boolean; lastSyncedAt?: string };
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const iso = (date: string, time: string) => `${date}T${time}:00+09:00`;
const sampleSummary = `[현재 상황]
Azure 이관 이후 GNB 개발 진행을 권장받았으며,
디자인 결과 확인 후 개발 일정을 산정하기로 함.

[결정 사항]
- Azure 이관 완료 후 GNB 작업 진행

[진행 사항]
- [x] 개발팀 작업 방향 확인
- [x] 디자인팀에 현재 시안 전달

[다음 할 일]
- [ ] 디자인 결과물 확인
- [ ] 개발 일정 재확인
- [ ] 대표님 추가 의견 확인

[메모]
디자인 결과 도착 시 범위 확정 후 개발자에게 일정 다시 요청`;

function parseSummary(rawText: string, previous?: DailySummary) {
  const aliases: Record<string, string> = { '현재 상황': 'currentStatus', 현재상황: 'currentStatus', '결정 사항': 'decisions', 결정사항: 'decisions', '진행 사항': 'progress', 진행사항: 'progress', '다음 할 일': 'nextActions', 다음할일: 'nextActions', 메모: 'note' };
  const sections: Record<string, string[]> = { currentStatus: [], decisions: [], progress: [], nextActions: [], note: [] };
  let current: string | null = null;
  rawText.replace(/\r\n/g, '\n').split('\n').forEach((line) => {
    const match = line.trim().match(/^\[\s*([^\]]+?)\s*\]\s*$/);
    if (match) current = aliases[match[1].replace(/\s+/g, ' ').trim()] ?? null;
    else if (current) sections[current].push(line);
  });
  const text = (lines: string[]) => lines.join('\n').trim();
  const list = (lines: string[]) => lines.map((line) => line.trim().replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
  const oldTodos = [...(previous?.progress ?? []), ...(previous?.nextActions ?? [])];
  const todos = (lines: string[], defaultCompleted: boolean) => list(lines).map((line) => {
    const checked = line.match(/^\[([xX ])\]\s*(.*)$/);
    const itemText = checked ? checked[2].trim() : line;
    const old = oldTodos.find((item) => item.text === itemText);
    return { id: old?.id ?? uid(), text: itemText, completed: old?.completed ?? (checked ? checked[1].toLowerCase() === 'x' : defaultCompleted) };
  });
  return { currentStatus: text(sections.currentStatus), decisions: list(sections.decisions), progress: todos(sections.progress, true), nextActions: todos(sections.nextActions, false), note: text(sections.note) };
}

const initialData = (): AppData => {
  const projects = ['GNB 리뉴얼', 'AI 검색', '앱 메인 리뉴얼', '강의쉐어', '알림장', '기타 업무'].map((name, index) => ({ id: `project-${index + 1}`, name, createdAt: iso('2026-08-28', `09:0${index}`) }));
  const rows = [
    ['memo-1', '2026-09-03', '14:27', '개발팀 확인. Azure 이관 후 진행 추천받음.\n이관 완료 후 GNB 작업 진행하는 방향이 좋다고 함.'],
    ['memo-2', '2026-09-03', '14:18', '디자인팀에 현재 버전 시안 전달 요청함.\n결과물 확인 후 개발 일정 다시 받기로 함.'],
    ['memo-3', '2026-09-03', '14:02', '결과물 받으면 프로그램/월간유아/쇼핑몰 위치 변경 포함\n전체 GNB 수정 범위 다시 확인할 예정.'],
    ['memo-4', '2026-09-03', '13:40', '2026-09-03 13:17 [김나영] 지예프로님이 채림프로님한테 전달(?) 하신대요\n2026-09-03 13:17 [김정은] 네엡 감사합니다!\n2026-09-03 13:17 [김나영] 뭘 전달하신다는 건지는 모르겠지만...\n2026-09-03 13:18 [김정은] 아하 넵넵\n2026-09-03 13:22 [김정은] 파트장님 근데 캐릭터 버전 확인 가능할까요?'],
    ['memo-5', '2026-09-02', '16:12', '대표님 GNB 추가 의견 확인 필요'],
    ['memo-6', '2026-09-02', '11:05', '기획안에서 메뉴 순서가 바뀐 부분 표시해두기'],
    ['memo-7', '2026-09-01', '17:40', '개발은 Azure 이관 후 진행하는 방향으로 다시 확인'],
  ];
  const memos = rows.map(([id, date, time, content]) => ({ id, projectId: projects[0].id, content, createdAt: iso(date, time), updatedAt: iso(date, time) }));
  const parsed = parseSummary(sampleSummary);
  return { projects, memos, summaries: [{ id: 'summary-1', projectId: projects[0].id, date: '2026-09-03', rawText: sampleSummary, ...parsed, createdAt: iso('2026-09-03', '15:00'), updatedAt: iso('2026-09-03', '15:00') }] };
};

const dateKey = (value: string) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const formatTime = (value: string) => new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
const formatDateTitle = (date: string) => { const value = new Date(`${date}T12:00:00`); return `${value.getMonth() + 1}월 ${value.getDate()}일 (${new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(value).replace('요일', '')})`; };
const shortDate = (date: string) => { const [, month, day] = date.split('-'); return `${Number(month)}/${Number(day)}`; };

const readSyncMeta = (): SyncMeta => {
  try { return JSON.parse(localStorage.getItem(SYNC_META_KEY) ?? '{"dirty":false}') as SyncMeta; }
  catch { return { dirty: false }; }
};
const writeSyncMeta = (meta: SyncMeta) => localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
const validAppData = (value: unknown): value is AppData => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppData>;
  return Array.isArray(candidate.projects) && Array.isArray(candidate.memos) && Array.isArray(candidate.summaries);
};
const mergeById = <T extends { id: string }>(local: T[], remote: T[], updatedAt?: (item: T) => string) => {
  const merged = new Map(local.map((item) => [item.id, item]));
  remote.forEach((item) => {
    const current = merged.get(item.id);
    if (!current || !updatedAt || updatedAt(item) >= updatedAt(current)) merged.set(item.id, item);
  });
  return [...merged.values()];
};
const mergeAppData = (local: AppData, remote: AppData): AppData => ({
  projects: mergeById(local.projects, remote.projects),
  memos: mergeById(local.memos, remote.memos, (item) => item.updatedAt),
  summaries: mergeById(local.summaries, remote.summaries, (item) => item.updatedAt),
});

export default function Home() {
  const [data, setData] = useState<AppData | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('project-1');
  const [draft, setDraft] = useState('');
  const [openDates, setOpenDates] = useState<Set<string>>(new Set(['2026-09-03']));
  const [openSummaries, setOpenSummaries] = useState<Set<string>>(new Set(['2026-09-03']));
  const [expandedMemos, setExpandedMemos] = useState<Set<string>>(new Set());
  const [showTodos, setShowTodos] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [dialog, setDialog] = useState<'project' | 'memo' | 'summary' | null>(null);
  const [projectName, setProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [memoText, setMemoText] = useState('');
  const [summaryDate, setSummaryDate] = useState('');
  const [summaryText, setSummaryText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'project' | 'memo' | 'summary'; id: string; label: string } | null>(null);
  const [toast, setToast] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isSupabaseConfigured ? 'connecting' : 'local');
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const selectedProjectRef = useRef(selectedProjectId);
  const dataRef = useRef<AppData | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const hydratedRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const initialSyncUserRef = useRef<string | null>(null);
  const syncingUserRef = useRef<string | null>(null);
  const uploadTimerRef = useRef<number | null>(null);

  const pushState = useCallback(async (payload: AppData, userId: string) => {
    const client = getSupabaseClient();
    if (!client || !navigator.onLine) { setSyncStatus('offline'); return; }
    const snapshot = JSON.stringify(payload);
    setSyncStatus('syncing');
    const { data: saved, error } = await client
      .from('app_states')
      .upsert({ user_id: userId, payload }, { onConflict: 'user_id' })
      .select('updated_at')
      .single();
    if (error) { setSyncStatus('error'); throw error; }
    if (snapshot === JSON.stringify(dataRef.current)) {
      writeSyncMeta({ userId, dirty: false, lastSyncedAt: saved.updated_at });
      setSyncStatus('synced');
    }
  }, []);

  const queueUpload = useCallback((payload: AppData, userId: string, delay = 800) => {
    if (uploadTimerRef.current !== null) window.clearTimeout(uploadTimerRef.current);
    if (!navigator.onLine) { setSyncStatus('offline'); return; }
    setSyncStatus('syncing');
    uploadTimerRef.current = window.setTimeout(() => {
      uploadTimerRef.current = null;
      void pushState(payload, userId).catch(() => undefined);
    }, delay);
  }, [pushState]);

  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); const loaded = saved ? JSON.parse(saved) as AppData : initialData(); setData(loaded); setSelectedProjectId(loaded.projects[0]?.id ?? ''); }
    catch { setData(initialData()); }
  }, []);
  useEffect(() => {
    if (!data) return;
    dataRef.current = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (!hydratedRef.current) { hydratedRef.current = true; return; }
    if (applyingRemoteRef.current) { applyingRemoteRef.current = false; return; }
    const activeSession = sessionRef.current;
    const previous = readSyncMeta();
    writeSyncMeta({ ...previous, userId: activeSession?.user.id ?? previous.userId, dirty: true });
    if (activeSession && initialSyncUserRef.current === activeSession.user.id) queueUpload(data, activeSession.user.id);
  }, [data, queueUpload]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 1800); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { selectedProjectRef.current = selectedProjectId; }, [selectedProjectId]);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) { setSyncStatus('local'); return; }
    let active = true;
    void client.auth.getSession().then(({ data: result }) => {
      if (!active) return;
      sessionRef.current = result.session;
      setSession(result.session);
      setSyncStatus(result.session ? 'syncing' : 'local');
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => {
        if (!active) return;
        sessionRef.current = nextSession;
        setSession(nextSession);
        if (!nextSession) {
          initialSyncUserRef.current = null;
          syncingUserRef.current = null;
          setSyncStatus('local');
        }
      }, 0);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session || !data || initialSyncUserRef.current === session.user.id || syncingUserRef.current === session.user.id) return;
    const client = getSupabaseClient();
    if (!client) return;
    syncingUserRef.current = session.user.id;
    setSyncStatus('syncing');
    void (async () => {
      const local = dataRef.current ?? data;
      const meta = readSyncMeta();
      const { data: remoteRow, error } = await client
        .from('app_states')
        .select('payload, updated_at')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (error) throw error;

      let next = local;
      let shouldUpload = !remoteRow;
      if (remoteRow && validAppData(remoteRow.payload)) {
        if (meta.userId === session.user.id) {
          if (meta.dirty) shouldUpload = true;
          else next = remoteRow.payload;
        } else if (JSON.stringify(local) === JSON.stringify(initialData())) next = remoteRow.payload;
        else {
          next = mergeAppData(local, remoteRow.payload);
          shouldUpload = JSON.stringify(next) !== JSON.stringify(remoteRow.payload);
        }
      }

      initialSyncUserRef.current = session.user.id;
      if (JSON.stringify(next) !== JSON.stringify(dataRef.current)) {
        dataRef.current = next;
        applyingRemoteRef.current = true;
        setData(next);
        if (!next.projects.some((item) => item.id === selectedProjectRef.current)) setSelectedProjectId(next.projects[0]?.id ?? '');
      }
      if (shouldUpload) await pushState(next, session.user.id);
      else {
        writeSyncMeta({ userId: session.user.id, dirty: false, lastSyncedAt: remoteRow?.updated_at });
        setSyncStatus('synced');
      }
    })().catch(() => setSyncStatus('error')).finally(() => { syncingUserRef.current = null; });
  }, [data, pushState, session]);

  useEffect(() => {
    if (!session) return;
    const client = getSupabaseClient();
    if (!client) return;
    const channel = client
      .channel(`app-state:${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_states', filter: `user_id=eq.${session.user.id}` }, (event) => {
        const row = event.new as { payload?: unknown; updated_at?: string };
        if (!validAppData(row.payload)) return;
        const meta = readSyncMeta();
        if (meta.dirty || JSON.stringify(row.payload) === JSON.stringify(dataRef.current)) return;
        dataRef.current = row.payload;
        applyingRemoteRef.current = true;
        setData(row.payload);
        if (!row.payload.projects.some((item) => item.id === selectedProjectRef.current)) setSelectedProjectId(row.payload.projects[0]?.id ?? '');
        writeSyncMeta({ userId: session.user.id, dirty: false, lastSyncedAt: row.updated_at });
        setSyncStatus('synced');
      })
      .subscribe((status) => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSyncStatus('error'); });
    return () => { void client.removeChannel(channel); };
  }, [session]);

  useEffect(() => {
    const online = () => {
      const activeSession = sessionRef.current;
      const current = dataRef.current;
      if (activeSession && current) queueUpload(current, activeSession.user.id, 0);
      else setSyncStatus('local');
    };
    const offline = () => setSyncStatus('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      if (uploadTimerRef.current !== null) window.clearTimeout(uploadTimerRef.current);
    };
  }, [queueUpload]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = context.registerTool({
      name: 'create_work_memo',
      title: '업무 기록 추가',
      description: '현재 선택된 프로젝트에 원문 그대로 새 업무 기록을 추가합니다.',
      inputSchema: { type: 'object', properties: { content: { type: 'string', minLength: 1 } }, required: ['content'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input: unknown) {
        const content = typeof input === 'object' && input !== null && 'content' in input ? (input as { content?: unknown }).content : undefined;
        if (typeof content !== 'string' || !content.trim()) throw new Error('content는 비어 있지 않은 문자열이어야 합니다.');
        const projectId = selectedProjectRef.current;
        if (!projectId) throw new Error('선택된 프로젝트가 없습니다.');
        const now = new Date().toISOString();
        setData((current) => current ? { ...current, memos: [...current.memos, { id: uid(), projectId, content, createdAt: now, updatedAt: now }] } : current);
        setOpenDates((current) => new Set(current).add(dateKey(now)));
        return { status: 'created', projectId, date: dateKey(now) };
      },
    }, { signal: lifecycle.signal });
    void Promise.resolve(register).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const project = data?.projects.find((item) => item.id === selectedProjectId);
  const projectMemos = useMemo(() => (data?.memos ?? []).filter((memo) => memo.projectId === selectedProjectId), [data, selectedProjectId]);
  const grouped = useMemo(() => { const map = new Map<string, Memo[]>(); projectMemos.forEach((memo) => { const key = dateKey(memo.createdAt); map.set(key, [...(map.get(key) ?? []), memo]); }); return [...map.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, memos]) => ({ date, memos: memos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) })); }, [projectMemos]);
  const unresolved = useMemo(() => (data?.summaries ?? []).filter((summary) => summary.projectId === selectedProjectId).flatMap((summary) => summary.nextActions.filter((item) => !item.completed).map((item) => ({ ...item, date: summary.date }))).sort((a, b) => b.date.localeCompare(a.date)), [data, selectedProjectId]);
  if (!data) return <main className="loading">업무 노트를 여는 중…</main>;

  const updateData = (updater: (current: AppData) => AppData) => setData((current) => current ? updater(current) : current);
  const flash = (message: string) => setToast(message);
  const saveMemo = () => { const content = draft; if (!content.trim() || !selectedProjectId) return; const now = new Date().toISOString(); updateData((current) => ({ ...current, memos: [...current.memos, { id: uid(), projectId: selectedProjectId, content, createdAt: now, updatedAt: now }] })); setDraft(''); setOpenDates((current) => new Set(current).add(dateKey(now))); requestAnimationFrame(() => inputRef.current?.focus()); flash('기록했어요'); };
  const openProjectDialog = (item?: Project) => { setEditingProjectId(item?.id ?? null); setProjectName(item?.name ?? ''); setDialog('project'); };
  const saveProject = () => { const name = projectName.trim(); if (!name) return; if (editingProjectId) updateData((current) => ({ ...current, projects: current.projects.map((item) => item.id === editingProjectId ? { ...item, name } : item) })); else { const id = uid(); updateData((current) => ({ ...current, projects: [...current.projects, { id, name, createdAt: new Date().toISOString() }] })); setSelectedProjectId(id); } setDialog(null); };
  const openMemoDialog = (memo: Memo) => { setEditingMemoId(memo.id); setMemoText(memo.content); setDialog('memo'); };
  const saveEditedMemo = () => { if (!editingMemoId || !memoText.trim()) return; updateData((current) => ({ ...current, memos: current.memos.map((memo) => memo.id === editingMemoId ? { ...memo, content: memoText, updatedAt: new Date().toISOString() } : memo) })); setDialog(null); flash('수정했어요'); };
  const openSummaryDialog = (date: string) => { const summary = data.summaries.find((item) => item.projectId === selectedProjectId && item.date === date); setSummaryDate(date); setSummaryText(summary?.rawText ?? ''); setDialog('summary'); };
  const saveSummary = () => { const rawText = summaryText.trim(); if (!rawText) return; const previous = data.summaries.find((item) => item.projectId === selectedProjectId && item.date === summaryDate); const now = new Date().toISOString(); const next: DailySummary = { id: previous?.id ?? uid(), projectId: selectedProjectId, date: summaryDate, rawText, ...parseSummary(rawText, previous), createdAt: previous?.createdAt ?? now, updatedAt: now }; updateData((current) => ({ ...current, summaries: [...current.summaries.filter((item) => item.id !== previous?.id), next] })); setOpenSummaries((current) => new Set(current).add(summaryDate)); setDialog(null); flash('AI 정리를 저장했어요'); };
  const toggleTodo = (summaryId: string, todoId: string) => updateData((current) => ({ ...current, summaries: current.summaries.map((summary) => summary.id !== summaryId ? summary : { ...summary, nextActions: summary.nextActions.map((item) => item.id === todoId ? { ...item, completed: !item.completed } : item), updatedAt: new Date().toISOString() }) }));
  const confirmDelete = () => { if (!deleteTarget) return; if (deleteTarget.type === 'memo') updateData((current) => ({ ...current, memos: current.memos.filter((item) => item.id !== deleteTarget.id) })); else if (deleteTarget.type === 'summary') updateData((current) => ({ ...current, summaries: current.summaries.filter((item) => item.id !== deleteTarget.id) })); else { const remaining = data.projects.filter((item) => item.id !== deleteTarget.id); updateData((current) => ({ projects: remaining, memos: current.memos.filter((item) => item.projectId !== deleteTarget.id), summaries: current.summaries.filter((item) => item.projectId !== deleteTarget.id) })); if (selectedProjectId === deleteTarget.id) setSelectedProjectId(remaining[0]?.id ?? ''); } setDeleteTarget(null); flash('삭제했어요'); };
  const copyText = async (text: string, message: string) => { try { await navigator.clipboard.writeText(text); flash(message); } catch { flash('복사하지 못했어요'); } };
  const rawCopy = (date: string, memos: Memo[]) => { const ordered = [...memos].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); return `[${project?.name ?? ''}]\n${date} 업무 기록\n\n${ordered.map((memo) => `${formatTime(memo.createdAt)}\n${memo.content}`).join('\n\n')}`; };
  const gptCopy = (date: string, memos: Memo[]) => `아래는 ${project?.name ?? ''} 프로젝트의 ${date} 업무 기록입니다.

업무 내용을 사실 중심으로 정리해주세요.

반드시 아래 형식을 사용해주세요.

[현재 상황]
전체 진행 상황을 1~3문장으로 요약

[결정 사항]
- 결정된 내용

[진행 사항]
- [x] 완료된 내용

[다음 할 일]
- [ ] 앞으로 해야 할 내용

[메모]
필요한 참고사항

원문에 없는 내용을 추측해서 추가하지 마세요.

--- 업무 기록 ---
${rawCopy(date, memos)}`;
  const syncLabel = !isSupabaseConfigured ? '동기화 설정 필요' : !session ? '동기화 연결' : syncStatus === 'synced' ? '동기화됨' : syncStatus === 'syncing' || syncStatus === 'connecting' ? '동기화 중' : syncStatus === 'offline' ? '오프라인 저장 중' : syncStatus === 'error' ? '동기화 확인 필요' : '이 기기에 저장됨';
  const sendMagicLink = async () => {
    const address = email.trim();
    const client = getSupabaseClient();
    if (!address || !client) return;
    setAuthBusy(true);
    setAuthMessage('');
    const redirectTo = window.location.href.split(/[?#]/)[0];
    const { error } = await client.auth.signInWithOtp({ email: address, options: { emailRedirectTo: redirectTo } });
    setAuthBusy(false);
    setAuthMessage(error ? `로그인 링크를 보내지 못했어요: ${error.message}` : '메일을 보냈어요. 같은 기기에서 로그인 링크를 눌러주세요.');
  };
  const signOut = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
    setSyncDialogOpen(false);
    flash('로그아웃했어요. 기록은 이 기기에 남아 있어요.');
  };
  const syncNow = () => {
    if (!session || !data) return;
    queueUpload(data, session.user.id, 0);
    flash('동기화를 시작했어요');
  };

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-row"><span className="brand-mark" /><strong>업무 노트</strong></div>
      <button className="new-project" onClick={() => openProjectDialog()}><Plus size={16} /> 새 프로젝트</button>
      <nav className="project-list" aria-label="프로젝트 목록">{data.projects.map((item) => { const count = data.memos.filter((memo) => memo.projectId === item.id).length; return <div key={item.id} className={`project-row ${item.id === selectedProjectId ? 'selected' : ''}`}>
        <button className="project-select" onClick={() => setSelectedProjectId(item.id)}><span>{item.name}</span><small>{count || ''}</small></button>
        <DropdownMenu><DropdownMenuTrigger className="icon-button project-more" aria-label={`${item.name} 메뉴`}><MoreHorizontal size={16} /></DropdownMenuTrigger><DropdownMenuContent align="end" className="menu-content"><DropdownMenuItem onClick={() => openProjectDialog(item)}>이름 수정</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget({ type: 'project', id: item.id, label: item.name })}>프로젝트 삭제</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>; })}</nav>
      <button className={`sync-button ${session ? syncStatus : 'local'}`} onClick={() => setSyncDialogOpen(true)}>{syncStatus === 'syncing' || syncStatus === 'connecting' ? <RefreshCw size={15} className="spin" /> : syncStatus === 'offline' || syncStatus === 'error' || !isSupabaseConfigured ? <CloudOff size={15} /> : <Cloud size={15} />}<span>{syncLabel}</span></button>
    </aside>

    <section className="workspace">
      <header className="mobile-header"><button className="mobile-project-button" onClick={() => setProjectPickerOpen(!projectPickerOpen)}>{project?.name ?? '프로젝트 선택'} <ChevronDown size={16} /></button><div className="mobile-header-actions"><button className={`mobile-sync ${session ? syncStatus : 'local'}`} onClick={() => setSyncDialogOpen(true)} aria-label={syncLabel}>{syncStatus === 'syncing' || syncStatus === 'connecting' ? <RefreshCw size={18} className="spin" /> : syncStatus === 'offline' || syncStatus === 'error' || !isSupabaseConfigured ? <CloudOff size={18} /> : <Cloud size={18} />}</button><button className="mobile-add" onClick={() => openProjectDialog()} aria-label="새 프로젝트"><Plus size={19} /></button>{project && <DropdownMenu><DropdownMenuTrigger className="mobile-more" aria-label="현재 프로젝트 메뉴"><MoreHorizontal size={19} /></DropdownMenuTrigger><DropdownMenuContent align="end" className="menu-content"><DropdownMenuItem onClick={() => openProjectDialog(project)}>이름 수정</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget({ type: 'project', id: project.id, label: project.name })}>프로젝트 삭제</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div>
        {projectPickerOpen && <div className="mobile-project-menu">{data.projects.map((item) => <button key={item.id} className={item.id === selectedProjectId ? 'active' : ''} onClick={() => { setSelectedProjectId(item.id); setProjectPickerOpen(false); }}>{item.name}<span>{data.memos.filter((memo) => memo.projectId === item.id).length || ''}</span></button>)}</div>}
      </header>
      <div className="content">
        <div className="desktop-title"><h1>{project?.name ?? '프로젝트를 만들어주세요'}</h1><p>떠오르는 내용을 그대로 남겨두세요.</p></div>
        {project && <div className="quick-entry"><textarea ref={inputRef} value={draft} rows={3} placeholder="메모하거나 대화를 그대로 붙여넣으세요" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); saveMemo(); } }} aria-label="빠른 업무 기록" /><div className="entry-footer"><span>Enter로 기록 · Shift + Enter로 줄바꿈</span><button onClick={saveMemo} disabled={!draft.trim()}>기록</button></div></div>}

        {unresolved.length > 0 && <section className={`todo-overview ${showTodos ? 'open' : ''}`}><button className="todo-overview-heading" onClick={() => setShowTodos(!showTodos)}><span><ChevronRight size={16} /> 미완료 업무 <b>{unresolved.length}</b></span><small>{showTodos ? '접기' : '펼치기'}</small></button>{showTodos && <div className="todo-overview-list">{unresolved.map((todo) => { const summary = data.summaries.find((item) => item.projectId === selectedProjectId && item.date === todo.date)!; return <label key={todo.id} className="todo-row"><Checkbox checked={todo.completed} onCheckedChange={() => toggleTodo(summary.id, todo.id)} /><span>{todo.text}</span><time>{shortDate(todo.date)}</time></label>; })}</div>}</section>}

        <div className="date-list">{grouped.map(({ date, memos }, index) => { const isOpen = openDates.has(date) || (index === 0 && openDates.size === 0); const summary = data.summaries.find((item) => item.projectId === selectedProjectId && item.date === date); const summaryOpen = openSummaries.has(date); return <section className="date-group" key={date}>
          <div className="date-heading"><button className="date-toggle" onClick={() => setOpenDates((current) => { const next = new Set(current); next.has(date) ? next.delete(date) : next.add(date); return next; })}>{isOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}<span>{formatDateTitle(date)}</span><small>· {memos.length}개 기록</small></button><div className="date-actions"><button onClick={() => copyText(rawCopy(date, memos), '날짜 기록을 복사했어요')}><Copy size={14} /><span>복사</span></button><button onClick={() => copyText(gptCopy(date, memos), 'GPT용 기록을 복사했어요')}><Clipboard size={14} /><span>GPT용</span></button><button className={summary ? 'summary-ready' : ''} onClick={() => summary ? setOpenSummaries((current) => { const next = new Set(current); next.has(date) ? next.delete(date) : next.add(date); return next; }) : openSummaryDialog(date)}><Sparkles size={14} /> AI 정리</button></div></div>
          {summary && summaryOpen && <div className="summary-panel"><div className="summary-panel-top"><strong>AI 정리</strong><div><button onClick={() => openSummaryDialog(date)}>편집</button><button onClick={() => setDeleteTarget({ type: 'summary', id: summary.id, label: `${formatDateTitle(date)} AI 정리` })}>삭제</button></div></div>
            {summary.currentStatus && <SummarySection title="현재 상황"><p>{summary.currentStatus}</p></SummarySection>}
            {summary.decisions.length > 0 && <SummarySection title="결정 사항"><ul>{summary.decisions.map((item, i) => <li key={i}>{item}</li>)}</ul></SummarySection>}
            {summary.progress.length > 0 && <SummarySection title="진행 사항"><div className="checked-list">{summary.progress.map((item) => <div key={item.id}><Check size={15} /><span>{item.text}</span></div>)}</div></SummarySection>}
            {summary.nextActions.length > 0 && <SummarySection title="다음 할 일"><div className="summary-todos">{summary.nextActions.map((item) => <label key={item.id} className={item.completed ? 'completed' : ''}><Checkbox checked={item.completed} onCheckedChange={() => toggleTodo(summary.id, item.id)} /><span>{item.text}</span></label>)}</div></SummarySection>}
            {summary.note && <SummarySection title="메모"><p>{summary.note}</p></SummarySection>}
            {!summary.currentStatus && !summary.decisions.length && !summary.progress.length && !summary.nextActions.length && !summary.note && <div className="unparsed"><p>형식을 나누어 읽지 못해 원문을 그대로 보여드려요.</p><pre>{summary.rawText}</pre></div>}
          </div>}
          {isOpen && <div className="memo-list">{memos.map((memo) => { const long = memo.content.length > 180 || memo.content.split('\n').length > 4; const expanded = expandedMemos.has(memo.id); return <article className="memo" key={memo.id}><time>{formatTime(memo.createdAt)}</time><div className="memo-body"><div className={`memo-text ${long && !expanded ? 'clamped' : ''}`}>{memo.content}</div>{long && <button className="expand-button" onClick={() => setExpandedMemos((current) => { const next = new Set(current); next.has(memo.id) ? next.delete(memo.id) : next.add(memo.id); return next; })}>{expanded ? '접기' : '전체 보기'}</button>}</div><DropdownMenu><DropdownMenuTrigger className="icon-button memo-more" aria-label="기록 메뉴"><MoreHorizontal size={17} /></DropdownMenuTrigger><DropdownMenuContent align="end" className="menu-content"><DropdownMenuItem onClick={() => openMemoDialog(memo)}>수정</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget({ type: 'memo', id: memo.id, label: '이 기록' })}>삭제</DropdownMenuItem></DropdownMenuContent></DropdownMenu></article>; })}</div>}
        </section>; })}{project && grouped.length === 0 && <div className="empty-state"><p>아직 기록이 없어요.</p><span>위 입력창에 첫 업무를 남겨보세요.</span></div>}</div>
      </div>
    </section>

    <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}><DialogContent className="app-dialog sync-dialog"><DialogHeader><DialogTitle>기기 간 동기화</DialogTitle><DialogDescription>기록은 이 기기의 localStorage에 먼저 저장되고, 로그인하면 Supabase에도 안전하게 복사됩니다.</DialogDescription></DialogHeader>
      {!isSupabaseConfigured ? <div className="sync-info warning"><CloudOff size={18} /><div><strong>Supabase 연결 정보가 아직 없어요.</strong><p>프로젝트 URL과 공개용 키를 연결하면 동기화를 사용할 수 있어요.</p></div></div> : session ? <div className="sync-account"><div className="sync-info"><Cloud size={18} /><div><strong>{syncLabel}</strong><p>{session.user.email}</p></div></div><p className="sync-help">휴대폰과 PC에서 같은 이메일로 로그인하면 같은 업무 기록이 표시됩니다.</p><DialogFooter><button className="button-secondary signout-button" onClick={() => void signOut()}><LogOut size={14} /> 로그아웃</button><button className="button-primary sync-now-button" onClick={syncNow} disabled={syncStatus === 'syncing'}><RefreshCw size={14} /> 지금 동기화</button></DialogFooter></div> : <div className="sync-login"><label htmlFor="sync-email">로그인 이메일</label><input id="sync-email" className="dialog-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void sendMagicLink()} placeholder="name@example.com" /><p>메일로 오는 로그인 링크를 누르면 비밀번호 없이 연결됩니다.</p>{authMessage && <div className="auth-message" role="status">{authMessage}</div>}<DialogFooter><button className="button-secondary" onClick={() => setSyncDialogOpen(false)}>나중에</button><button className="button-primary" onClick={() => void sendMagicLink()} disabled={!email.trim() || authBusy}>{authBusy ? '보내는 중…' : '로그인 링크 보내기'}</button></DialogFooter></div>}
    </DialogContent></Dialog>
    <Dialog open={dialog === 'project'} onOpenChange={(open) => !open && setDialog(null)}><DialogContent className="app-dialog"><DialogHeader><DialogTitle>{editingProjectId ? '프로젝트 이름 수정' : '새 프로젝트'}</DialogTitle><DialogDescription>업무를 모아둘 프로젝트 이름을 입력하세요.</DialogDescription></DialogHeader><input className="dialog-input" autoFocus value={projectName} onChange={(e) => setProjectName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveProject()} placeholder="프로젝트 이름" /><DialogFooter><button className="button-secondary" onClick={() => setDialog(null)}>취소</button><button className="button-primary" onClick={saveProject} disabled={!projectName.trim()}>저장</button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === 'memo'} onOpenChange={(open) => !open && setDialog(null)}><DialogContent className="app-dialog wide"><DialogHeader><DialogTitle>기록 수정</DialogTitle><DialogDescription>원문을 수정합니다. 작성 시간은 유지돼요.</DialogDescription></DialogHeader><textarea className="dialog-textarea" value={memoText} onChange={(e) => setMemoText(e.target.value)} rows={8} /><DialogFooter><button className="button-secondary" onClick={() => setDialog(null)}>취소</button><button className="button-primary" onClick={saveEditedMemo} disabled={!memoText.trim()}>저장</button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === 'summary'} onOpenChange={(open) => !open && setDialog(null)}><DialogContent className="app-dialog summary-dialog"><DialogHeader><DialogTitle>{formatDateTitle(summaryDate || '2026-09-03')} AI 정리</DialogTitle><DialogDescription>ChatGPT에서 정리한 결과 전체를 그대로 붙여넣으세요. 원문 기록은 바뀌지 않아요.</DialogDescription></DialogHeader><textarea className="dialog-textarea summary-input" value={summaryText} onChange={(e) => setSummaryText(e.target.value)} placeholder={'[현재 상황]\n\n[결정 사항]\n- \n\n[진행 사항]\n- [x] \n\n[다음 할 일]\n- [ ] \n\n[메모]'} rows={18} /><DialogFooter><button className="button-secondary" onClick={() => setDialog(null)}>취소</button><button className="button-primary" onClick={saveSummary} disabled={!summaryText.trim()}>저장</button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}><AlertDialogContent className="app-alert"><AlertDialogHeader><AlertDialogTitle>{deleteTarget?.label}을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>{deleteTarget?.type === 'project' ? '프로젝트에 속한 기록과 AI 정리도 함께 삭제되며 되돌릴 수 없어요.' : '삭제한 내용은 되돌릴 수 없어요.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction className="delete-button" onClick={confirmDelete}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {toast && <div className="toast" role="status"><Check size={15} /> {toast}</div>}
  </main>;
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="summary-section"><h3>{title}</h3>{children}</section>; }
