'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Clipboard, Copy, MoreHorizontal, Plus, Sparkles } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type Project = { id: string; name: string; createdAt: string };
type Memo = { id: string; projectId: string; content: string; createdAt: string; updatedAt: string };
type TodoItem = { id: string; text: string; completed: boolean };
type DailySummary = { id: string; projectId: string; date: string; rawText: string; currentStatus: string; decisions: string[]; progress: TodoItem[]; nextActions: TodoItem[]; note: string; createdAt: string; updatedAt: string };
type AppData = { projects: Project[]; memos: Memo[]; summaries: DailySummary[] };

const STORAGE_KEY = 'quick-work-notes:v1';
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const selectedProjectRef = useRef(selectedProjectId);

  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); const loaded = saved ? JSON.parse(saved) as AppData : initialData(); setData(loaded); setSelectedProjectId(loaded.projects[0]?.id ?? ''); }
    catch { setData(initialData()); }
  }, []);
  useEffect(() => { if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }, [data]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 1800); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { selectedProjectRef.current = selectedProjectId; }, [selectedProjectId]);

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

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-row"><span className="brand-mark" /><strong>업무 노트</strong></div>
      <button className="new-project" onClick={() => openProjectDialog()}><Plus size={16} /> 새 프로젝트</button>
      <nav className="project-list" aria-label="프로젝트 목록">{data.projects.map((item) => { const count = data.memos.filter((memo) => memo.projectId === item.id).length; return <div key={item.id} className={`project-row ${item.id === selectedProjectId ? 'selected' : ''}`}>
        <button className="project-select" onClick={() => setSelectedProjectId(item.id)}><span>{item.name}</span><small>{count || ''}</small></button>
        <DropdownMenu><DropdownMenuTrigger className="icon-button project-more" aria-label={`${item.name} 메뉴`}><MoreHorizontal size={16} /></DropdownMenuTrigger><DropdownMenuContent align="end" className="menu-content"><DropdownMenuItem onClick={() => openProjectDialog(item)}>이름 수정</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget({ type: 'project', id: item.id, label: item.name })}>프로젝트 삭제</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>; })}</nav>
    </aside>

    <section className="workspace">
      <header className="mobile-header"><button className="mobile-project-button" onClick={() => setProjectPickerOpen(!projectPickerOpen)}>{project?.name ?? '프로젝트 선택'} <ChevronDown size={16} /></button><div className="mobile-header-actions"><button className="mobile-add" onClick={() => openProjectDialog()} aria-label="새 프로젝트"><Plus size={19} /></button>{project && <DropdownMenu><DropdownMenuTrigger className="mobile-more" aria-label="현재 프로젝트 메뉴"><MoreHorizontal size={19} /></DropdownMenuTrigger><DropdownMenuContent align="end" className="menu-content"><DropdownMenuItem onClick={() => openProjectDialog(project)}>이름 수정</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget({ type: 'project', id: project.id, label: project.name })}>프로젝트 삭제</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div>
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

    <Dialog open={dialog === 'project'} onOpenChange={(open) => !open && setDialog(null)}><DialogContent className="app-dialog"><DialogHeader><DialogTitle>{editingProjectId ? '프로젝트 이름 수정' : '새 프로젝트'}</DialogTitle><DialogDescription>업무를 모아둘 프로젝트 이름을 입력하세요.</DialogDescription></DialogHeader><input className="dialog-input" autoFocus value={projectName} onChange={(e) => setProjectName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveProject()} placeholder="프로젝트 이름" /><DialogFooter><button className="button-secondary" onClick={() => setDialog(null)}>취소</button><button className="button-primary" onClick={saveProject} disabled={!projectName.trim()}>저장</button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === 'memo'} onOpenChange={(open) => !open && setDialog(null)}><DialogContent className="app-dialog wide"><DialogHeader><DialogTitle>기록 수정</DialogTitle><DialogDescription>원문을 수정합니다. 작성 시간은 유지돼요.</DialogDescription></DialogHeader><textarea className="dialog-textarea" value={memoText} onChange={(e) => setMemoText(e.target.value)} rows={8} /><DialogFooter><button className="button-secondary" onClick={() => setDialog(null)}>취소</button><button className="button-primary" onClick={saveEditedMemo} disabled={!memoText.trim()}>저장</button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialog === 'summary'} onOpenChange={(open) => !open && setDialog(null)}><DialogContent className="app-dialog summary-dialog"><DialogHeader><DialogTitle>{formatDateTitle(summaryDate || '2026-09-03')} AI 정리</DialogTitle><DialogDescription>ChatGPT에서 정리한 결과 전체를 그대로 붙여넣으세요. 원문 기록은 바뀌지 않아요.</DialogDescription></DialogHeader><textarea className="dialog-textarea summary-input" value={summaryText} onChange={(e) => setSummaryText(e.target.value)} placeholder={'[현재 상황]\n\n[결정 사항]\n- \n\n[진행 사항]\n- [x] \n\n[다음 할 일]\n- [ ] \n\n[메모]'} rows={18} /><DialogFooter><button className="button-secondary" onClick={() => setDialog(null)}>취소</button><button className="button-primary" onClick={saveSummary} disabled={!summaryText.trim()}>저장</button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}><AlertDialogContent className="app-alert"><AlertDialogHeader><AlertDialogTitle>{deleteTarget?.label}을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>{deleteTarget?.type === 'project' ? '프로젝트에 속한 기록과 AI 정리도 함께 삭제되며 되돌릴 수 없어요.' : '삭제한 내용은 되돌릴 수 없어요.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction className="delete-button" onClick={confirmDelete}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {toast && <div className="toast" role="status"><Check size={15} /> {toast}</div>}
  </main>;
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="summary-section"><h3>{title}</h3>{children}</section>; }
