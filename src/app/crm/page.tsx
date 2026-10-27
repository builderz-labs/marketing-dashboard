'use client';

import { useState, useCallback, useEffect, useRef, useSyncExternalStore, DragEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Contact, Search, ChevronRight, Star,
  Building2, User, ArrowUpDown, X, Pause,
  Send, Eye, CircleDot, MessageSquare, CalendarCheck, CheckCircle, Ban,
  Check, XCircle,
  LayoutList, Kanban, AlertCircle, BarChart3, ExternalLink,
} from 'lucide-react';
import { useSmartPoll } from '@/hooks/use-smart-poll';
import { useDashboard } from '@/store';
import { timeAgo } from '@/lib/utils';
import type { Lead, FunnelStep } from '@/types';
import { LeadDetailPanel } from '@/components/crm/lead-detail-panel';

interface CrmData {
  leads: Lead[];
  funnel: FunnelStep[];
  summary: {
    total: number;
    avg_score: number;
    tier_breakdown: { tier: string; c: number }[];
    pending_approvals: number;
    emails_sent: number;
    conversion_rate: number;
    tasks_overdue?: number;
    tasks_due_today?: number;
  };
  tasks_overdue?: number;
  tasks_due_today?: number;
}

const STAGES = ['new', 'validated', 'approved', 'contacted', 'replied', 'interested', 'booked', 'qualified'] as const;

const STAGE_ICONS: Record<string, typeof Send> = {
  new: CircleDot,
  validated: CheckCircle,
  approved: Check,
  contacted: Send,
  replied: MessageSquare,
  interested: Eye,
  booked: CalendarCheck,
  qualified: Star,
  rejected: XCircle,
  disqualified: Ban,
};

const STAGE_COLORS: Record<string, string> = {
  new: 'text-muted-foreground',
  validated: 'text-info',
  approved: 'text-success',
  contacted: 'text-primary',
  replied: 'text-warning',
  interested: 'text-success',
  booked: 'text-success',
  qualified: 'text-success',
  rejected: 'text-destructive',
  disqualified: 'text-destructive',
};

const TIER_COLORS: Record<string, string> = {
  A: 'bg-success/15 text-success border-success/30',
  B: 'bg-warning/15 text-warning border-warning/30',
  C: 'bg-muted/30 text-muted-foreground border-border',
};

type ViewMode = 'list' | 'kanban';
type Role = 'admin' | 'editor' | 'viewer';

// Minute-resolution wall clock for SLA ages. The server snapshot is null so
// render stays pure (react-hooks/purity) and hydration matches.
function subscribeMinuteClock(onChange: () => void) {
  const t = setInterval(onChange, 60_000);
  return () => clearInterval(t);
}
const getMinuteClock = () => Math.floor(Date.now() / 60_000) * 60_000;
const getServerClock = () => null;

export default function CrmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlLeadId = searchParams.get('lead');
  const urlStatus = searchParams.get('status') || '';
  const urlTier = searchParams.get('tier') || '';
  const urlSearch = searchParams.get('search') || '';
  const urlView = searchParams.get('view') || '';
  const urlSort = searchParams.get('sort') || '';

  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    first_name: '',
    last_name: '',
    title: '',
    company: '',
    email: '',
    linkedin_url: '',
    source: '',
    industry_segment: '',
    company_size: '',
    score: '',
    tier: '',
    status: 'new',
    notes: '',
    next_action_at: '',
  });

  useEffect(() => {
    if (!createOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [createOpen]);

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const nowMs = useSyncExternalStore(subscribeMinuteClock, getMinuteClock, getServerClock);
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'score' | 'created_at'>('score');
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Follow the URL's lead param when it changes (deep links, back/forward).
  const [syncedUrlLeadId, setSyncedUrlLeadId] = useState<string | null>(null);
  if (syncedUrlLeadId !== urlLeadId) {
    setSyncedUrlLeadId(urlLeadId);
    if (urlLeadId && selectedLead !== urlLeadId) setSelectedLead(urlLeadId);
  }

  // Keep local filters in sync with URL (back/forward, deep links).
  const urlFilterKey = [urlStatus, urlTier, urlSearch, urlView, urlSort].join('\u0000');
  const [syncedUrlFilterKey, setSyncedUrlFilterKey] = useState<string | null>(null);
  if (syncedUrlFilterKey !== urlFilterKey) {
    setSyncedUrlFilterKey(urlFilterKey);
    if (urlStatus !== stageFilter) setStageFilter(urlStatus);
    if (urlTier !== tierFilter) setTierFilter(urlTier);
    if (urlSearch !== search) setSearch(urlSearch);
    if ((urlView === 'kanban' || urlView === 'list') && urlView !== viewMode) setViewMode(urlView);
    if ((urlSort === 'score' || urlSort === 'created_at') && urlSort !== sortField) setSortField(urlSort);
  }
  const [role, setRole] = useState<Role>('viewer');
  const [slaStaleDays, setSlaStaleDays] = useState(7);
  const [slaNewDays, setSlaNewDays] = useState(3);
  const { realOnly } = useDashboard();

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((payload) => setRole(payload?.user?.role === 'admin' || payload?.user?.role === 'editor' ? payload.user.role : 'viewer'))
      .catch(() => setRole('viewer'));
  }, []);

  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedLead) next.set('lead', selectedLead);
    if (stageFilter) next.set('status', stageFilter);
    if (tierFilter) next.set('tier', tierFilter);
    if (search) next.set('search', search);
    if (viewMode !== 'list') next.set('view', viewMode);
    if (sortField !== 'score') next.set('sort', sortField);
    if (realOnly) next.set('real', 'true');
    const qs = next.toString();
    router.replace(qs ? `/crm?${qs}` : '/crm', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead, stageFilter, tierFilter, search, viewMode, sortField, realOnly]);

  useEffect(() => {
    fetch('/api/settings/crm')
      .then(r => r.json())
      .then((data) => {
        if (typeof data?.sla_stale_days === 'number') setSlaStaleDays(data.sla_stale_days);
        if (typeof data?.sla_new_days === 'number') setSlaNewDays(data.sla_new_days);
      })
      .catch(() => {});
  }, []);

  const params = new URLSearchParams();
  if (stageFilter) params.set('status', stageFilter);
  if (tierFilter) params.set('tier', tierFilter);
  if (search) params.set('search', search);
  if (realOnly) params.set('real', 'true');

  const { data } = useSmartPoll<CrmData>(
    () => fetch(`/api/crm?${params}`).then(r => r.json()),
    { interval: 30_000, key: `${realOnly}-${refreshKey}` },
  );

  const leads = data?.leads || [];
  const sorted = [...leads].sort((a, b) => {
    if (sortField === 'score') return (b.score ?? 0) - (a.score ?? 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const tasksDue = leads
    .filter(l => l.next_action_at)
    .sort((a, b) => new Date(a.next_action_at as string).getTime() - new Date(b.next_action_at as string).getTime());

  async function markTaskDone(leadId: string) {
    if (!canEdit) return;
    try {
      await fetch('/api/crm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId, next_action_at: null, task_done: true }),
      });
      setRefreshKey(k => k + 1);
    } catch {
      // ignore
    }
  }

  const handleMutate = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);
  const canEdit = role === 'admin' || role === 'editor';

  async function submitCreateLead(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setCreateSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        first_name: createForm.first_name || null,
        last_name: createForm.last_name || null,
        title: createForm.title || null,
        company: createForm.company || null,
        email: createForm.email || null,
        linkedin_url: createForm.linkedin_url || null,
        source: createForm.source || null,
        industry_segment: createForm.industry_segment || null,
        company_size: createForm.company_size || null,
        tier: createForm.tier || null,
        status: createForm.status || 'new',
        notes: createForm.notes || null,
        next_action_at: createForm.next_action_at
          ? new Date(`${createForm.next_action_at}T00:00:00.000Z`).toISOString()
          : null,
      };
      if (createForm.score.trim()) payload.score = Number(createForm.score);

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create lead');

      setCreateOpen(false);
      setCreateForm({
        first_name: '',
        last_name: '',
        title: '',
        company: '',
        email: '',
        linkedin_url: '',
        source: '',
        industry_segment: '',
        company_size: '',
        score: '',
        tier: '',
        status: 'new',
        notes: '',
        next_action_at: '',
      });
      setRefreshKey(k => k + 1);
      if (data?.lead?.id) setSelectedLead(data.lead.id);
    } catch {
      // ignore
    } finally {
      setCreateSubmitting(false);
    }
  }

  // Kanban drag handler
  async function handleKanbanDrop(leadId: string, newStage: string) {
    if (!canEdit) return;
    try {
      const res = await fetch('/api/crm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId, status: newStage }),
      });
      if (!res.ok) throw new Error('Update failed');
      setRefreshKey(k => k + 1);
    } catch {
      // silently fail, will refresh on next poll
    }
  }

  return (
    <div className="space-y-6 animate-in">
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setCreateOpen(false)}
          />
          <div className="panel relative w-full max-w-xl" role="dialog" aria-modal="true" aria-labelledby="crm-add-lead-title">
            <div className="panel-header flex items-center justify-between">
              <h2 id="crm-add-lead-title" className="text-sm font-medium">Add Lead</h2>
              <button type="button" aria-label="Close add lead" onClick={() => setCreateOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submitCreateLead} className="panel-body space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input name="first_name" aria-label="First name" autoComplete="given-name" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="First name" value={createForm.first_name} onChange={(e) => setCreateForm(v => ({ ...v, first_name: e.target.value }))} />
                <input name="last_name" aria-label="Last name" autoComplete="family-name" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="Last name" value={createForm.last_name} onChange={(e) => setCreateForm(v => ({ ...v, last_name: e.target.value }))} />
                <input name="title" aria-label="Title" autoComplete="organization-title" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="Title" value={createForm.title} onChange={(e) => setCreateForm(v => ({ ...v, title: e.target.value }))} />
                <input name="company" aria-label="Company" autoComplete="organization" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="Company" value={createForm.company} onChange={(e) => setCreateForm(v => ({ ...v, company: e.target.value }))} />
                <input name="email" aria-label="Email" autoComplete="email" type="email" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="Email" value={createForm.email} onChange={(e) => setCreateForm(v => ({ ...v, email: e.target.value }))} />
                <input name="linkedin_url" aria-label="LinkedIn URL" autoComplete="url" type="url" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="LinkedIn URL" value={createForm.linkedin_url} onChange={(e) => setCreateForm(v => ({ ...v, linkedin_url: e.target.value }))} />
                <input name="source" aria-label="Source" autoComplete="off" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="Source" value={createForm.source} onChange={(e) => setCreateForm(v => ({ ...v, source: e.target.value }))} />
                <input name="industry_segment" aria-label="Industry segment" autoComplete="off" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="Industry segment" value={createForm.industry_segment} onChange={(e) => setCreateForm(v => ({ ...v, industry_segment: e.target.value }))} />
                <input name="company_size" aria-label="Company size" autoComplete="off" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="Company size" value={createForm.company_size} onChange={(e) => setCreateForm(v => ({ ...v, company_size: e.target.value }))} />
                <input name="score" aria-label="Score" inputMode="numeric" type="number" min={0} max={100} className="px-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="Score (0-100)" value={createForm.score} onChange={(e) => setCreateForm(v => ({ ...v, score: e.target.value }))} />
                <select name="tier" aria-label="Tier" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" value={createForm.tier} onChange={(e) => setCreateForm(v => ({ ...v, tier: e.target.value }))}>
                  <option value="">Tier (optional)</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
                <select name="status" aria-label="Stage" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" value={createForm.status} onChange={(e) => setCreateForm(v => ({ ...v, status: e.target.value }))}>
                  {['new','validated','approved','contacted','replied','interested','booked','qualified','rejected','disqualified'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input name="next_action_at" aria-label="Next action date" type="date" className="px-3 py-2 rounded-lg border border-border bg-background text-sm" value={createForm.next_action_at} onChange={(e) => setCreateForm(v => ({ ...v, next_action_at: e.target.value }))} />
              </div>
              <textarea name="notes" aria-label="Notes" className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2" rows={3} placeholder="Notes" value={createForm.notes} onChange={(e) => setCreateForm(v => ({ ...v, notes: e.target.value }))} />
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button type="submit" disabled={createSubmitting} className="btn btn-primary btn-sm">
                  {createSubmitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">CRM</h1>
          {canEdit && (
            <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
              Add Lead
            </button>
          )}
        </div>
        {data?.summary && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span><strong className="text-foreground">{data.summary.total}</strong> leads</span>
            <span>avg score <strong className="text-foreground">{data.summary.avg_score}</strong></span>
            {data.summary.tier_breakdown.map(t => (
              <span key={t.tier} className={`badge border ${TIER_COLORS[t.tier] || ''}`}>
                Tier {t.tier}: {t.c}
              </span>
            ))}
          {(data.summary?.tasks_overdue ?? data.tasks_overdue ?? 0) > 0 && (
            <span className="badge border bg-destructive/15 text-destructive border-destructive/30">
                SLA breaches: {data.summary?.tasks_overdue ?? data.tasks_overdue}
            </span>
          )}
          {(data.summary?.tasks_due_today ?? data.tasks_due_today ?? 0) > 0 && (
            <span className="badge border bg-warning/15 text-warning border-warning/30">
                Due today: {data.summary?.tasks_due_today ?? data.tasks_due_today}
            </span>
          )}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="stat-tile">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <BarChart3 size={12} /> Pipeline
            </div>
            <div className="text-lg font-semibold">{data.summary.total}</div>
            <div className="text-[10px] text-muted-foreground">active leads</div>
          </div>
          <div className="stat-tile">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertCircle size={12} className="text-warning" /> Pending
            </div>
            <div className="text-lg font-semibold text-warning">{data.summary.pending_approvals}</div>
            <div className="text-[10px] text-muted-foreground">emails awaiting approval</div>
          </div>
          <div className="stat-tile">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Send size={12} className="text-success" /> Sent
            </div>
            <div className="text-lg font-semibold text-success">{data.summary.emails_sent}</div>
            <div className="text-[10px] text-muted-foreground">emails delivered</div>
          </div>
          <div className="stat-tile">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Star size={12} className="text-primary" /> Conversion
            </div>
            <div className="text-lg font-semibold text-primary">{data.summary.conversion_rate}%</div>
            <div className="text-[10px] text-muted-foreground">reply rate</div>
          </div>
        </div>
      )}

      {/* Pipeline Funnel */}
      {data?.funnel && (
        <div className="panel">
          <div className="panel-header">
            <h3 className="section-title">Pipeline</h3>
          </div>
          <div className="panel-body">
          <div className="flex items-end gap-1 h-20">
            {data.funnel.filter(s => s.name !== 'disqualified').map(step => {
              const maxVal = Math.max(...data.funnel.map(s => s.value), 1);
              const height = Math.max((step.value / maxVal) * 100, 8);
              const Icon = STAGE_ICONS[step.name] || CircleDot;
              const isFiltered = stageFilter === step.name;
              return (
                <button
                  key={step.name}
                  onClick={() => setStageFilter(isFiltered ? '' : step.name)}
                  className={`flex-1 flex flex-col items-center gap-1 group transition-opacity ${
                    stageFilter && !isFiltered ? 'opacity-40' : ''
                  }`}
                >
                  <span className="text-xs font-mono font-semibold">{step.value}</span>
                  <div
                    className={`w-full rounded-t transition-all ${
                      isFiltered ? 'bg-primary' : 'bg-primary/40 group-hover:bg-primary/60'
                    }`}
                    style={{ height: `${height}%` }}
                  />
                  <div className="flex flex-col items-center gap-0.5">
                    <Icon size={12} className={STAGE_COLORS[step.name]} />
                    <span className="text-[9px] text-muted-foreground capitalize">{step.name}</span>
                  </div>
                </button>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="panel">
        <div className="panel-body !p-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            name="search"
            aria-label="Search leads"
            autoComplete="off"
            placeholder="Search leads..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3"
          />
        </div>
        <select
          value={tierFilter}
          onChange={e => setTierFilter(e.target.value)}
          name="tier"
          aria-label="Tier filter"
          className="px-3"
        >
          <option value="">All Tiers</option>
          <option value="A">Tier A</option>
          <option value="B">Tier B</option>
          <option value="C">Tier C</option>
        </select>

        {/* View Toggle */}
        <div className="flex items-center border border-border/30 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            type="button"
            aria-label="List view"
            className={`px-2.5 py-2 text-sm transition-colors ${
              viewMode === 'list' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="List view"
          >
            <LayoutList size={14} />
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            type="button"
            aria-label="Kanban view"
            className={`px-2.5 py-2 text-sm transition-colors ${
              viewMode === 'kanban' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Board view"
          >
            <Kanban size={14} />
          </button>
        </div>

        {viewMode === 'list' && (
          <button
            onClick={() => setSortField(sortField === 'score' ? 'created_at' : 'score')}
            className="btn btn-ghost btn-sm"
          >
            <ArrowUpDown size={12} />
            {sortField === 'score' ? 'Score' : 'Date'}
          </button>
        )}
        {(stageFilter || tierFilter || search) && (
          <button onClick={() => { setStageFilter(''); setTierFilter(''); setSearch(''); }} className="btn btn-ghost btn-sm text-destructive">
            <X size={12} /> Clear
          </button>
        )}
        </div>
      </div>

      {/* Tasks Due */}
      {tasksDue.length > 0 && (
        <div className="panel">
          <div className="panel-header flex items-center justify-between">
            <h3 className="section-title">Tasks</h3>
            <button
              className="btn btn-ghost text-xs"
              onClick={() => {
                const rows = tasksDue.map(task => ([
                  task.id,
                  `${task.first_name ?? ''} ${task.last_name ?? ''}`.trim(),
                  task.company ?? '',
                  task.title ?? '',
                  task.email ?? '',
                  task.next_action_at ?? '',
                ]));
                const header = ['id', 'name', 'company', 'title', 'email', 'next_action_at'];
                const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
                const csv = [header.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'crm-tasks.csv';
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export CSV
            </button>
          </div>
          <div className="panel-body space-y-3">
            {(() => {
              const now = nowMs ?? 0;
              const overdue = tasksDue.filter(t => new Date(t.next_action_at as string).getTime() < now);
              const dueSoon = tasksDue.filter(t => {
                const ts = new Date(t.next_action_at as string).getTime();
                return ts >= now && ts < now + 24 * 60 * 60 * 1000;
              });
              const upcoming = tasksDue.filter(t => new Date(t.next_action_at as string).getTime() >= now + 24 * 60 * 60 * 1000);

              const renderList = (label: string, items: typeof tasksDue) => (
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label} ({items.length})</div>
                  {items.length === 0 ? (
                    <div className="text-xs text-muted-foreground">None</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {items.slice(0, 6).map(task => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2 text-xs hover:bg-muted/30 transition-colors"
                        >
                          <Link href={`/crm/${task.id}`} className="truncate">
                            <span className="font-medium">{task.first_name} {task.last_name}</span>
                            {task.company && <span className="text-muted-foreground"> · {task.company}</span>}
                          </Link>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                              new Date(task.next_action_at as string).getTime() < now
                                ? 'bg-destructive/15 text-destructive'
                                : 'bg-warning/15 text-warning'
                            }`}>
                              {timeAgo(task.next_action_at as string)}
                            </span>
                            <button
                              onClick={() => markTaskDone(task.id)}
                              disabled={!canEdit}
                              className="text-[10px] text-primary hover:underline disabled:opacity-50"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );

              return (
                <div className="space-y-3">
                  {renderList('Overdue', overdue)}
                  {renderList('Due Today', dueSoon)}
                  {renderList('Upcoming', upcoming)}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Main Content */}
      {viewMode === 'list' ? (
        /* ─── List View ──────────────────────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {sorted.length === 0 ? (
              <div className="panel p-8 text-center text-sm text-muted-foreground">No leads found</div>
            ) : (
              sorted.map(lead => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  nowMs={nowMs}
                  slaStaleDays={slaStaleDays}
                  slaNewDays={slaNewDays}
                  selected={selectedLead === lead.id}
                  onClick={() => setSelectedLead(selectedLead === lead.id ? null : lead.id)}
                />
              ))
            )}
          </div>

          <div className="lg:col-span-1">
            {selectedLead ? (
          <LeadDetailPanel
              key={selectedLead}
              id={selectedLead}
              onClose={() => setSelectedLead(null)}
              onMutate={handleMutate}
              canEdit={canEdit}
              nowMs={nowMs}
              slaStaleDays={slaStaleDays}
              slaNewDays={slaNewDays}
            />
            ) : (
              <div className="panel p-8 text-center text-sm text-muted-foreground sticky top-24">
                <Contact size={32} className="mx-auto mb-3 opacity-30" />
                <p>Select a lead to view details</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ─── Kanban View ────────────────────────────────── */
        <KanbanBoard
          leads={sorted}
          selectedLead={selectedLead}
          nowMs={nowMs}
          onSelectLead={(id) => setSelectedLead(selectedLead === id ? null : id)}
          onDropLead={handleKanbanDrop}
          onMutate={handleMutate}
          onCloseLead={() => setSelectedLead(null)}
          canEdit={canEdit}
          slaStaleDays={slaStaleDays}
          slaNewDays={slaNewDays}
        />
      )}
    </div>
  );
}

/* ─── Kanban Board ─────────────────────────────────────── */

function KanbanBoard({
  leads,
  selectedLead,
  nowMs,
  onSelectLead,
  onDropLead,
  onMutate,
  onCloseLead,
  canEdit,
  slaStaleDays,
  slaNewDays,
}: {
  leads: Lead[];
  selectedLead: string | null;
  nowMs: number | null;
  onSelectLead: (id: string) => void;
  onDropLead: (leadId: string, newStage: string) => void;
  onMutate: () => void;
  onCloseLead: () => void;
  canEdit: boolean;
  slaStaleDays: number;
  slaNewDays: number;
}) {
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const stageLeads = STAGES.reduce<Record<string, Lead[]>>((acc, stage) => {
    acc[stage] = leads.filter(l => l.status === stage);
    return acc;
  }, {});

  // Also add rejected/disqualified columns
  const rejectedLeads = leads.filter(l => l.status === 'rejected');
  const dqLeads = leads.filter(l => l.status === 'disqualified');

  return (
    <div className="space-y-4">
      {/* Board + Detail side by side on lg */}
      <div className="flex gap-4">
        <div
          ref={scrollRef}
          className={`flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory ${
            selectedLead ? 'flex-1' : 'w-full'
          }`}
          style={{ scrollbarWidth: 'thin' }}
        >
          {STAGES.map(stage => {
            const count = stageLeads[stage]?.length || 0;
            const Icon = STAGE_ICONS[stage] || CircleDot;

            return (
              <KanbanColumn
                key={stage}
                stage={stage}
                icon={Icon}
                count={count}
                leads={stageLeads[stage] || []}
                selectedLead={selectedLead}
                nowMs={nowMs}
                canEdit={canEdit}
                slaStaleDays={slaStaleDays}
                slaNewDays={slaNewDays}
                isDragOver={dragOverStage === stage}
                onSelectLead={onSelectLead}
                onDragOver={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  setDragOverStage(stage);
                }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  setDragOverStage(null);
                  const leadId = e.dataTransfer.getData('text/plain');
                  if (leadId) onDropLead(leadId, stage);
                }}
              />
            );
          })}

          {/* Rejected column */}
          {rejectedLeads.length > 0 && (
            <KanbanColumn
              stage="rejected"
              icon={XCircle}
              count={rejectedLeads.length}
              leads={rejectedLeads}
              selectedLead={selectedLead}
              nowMs={nowMs}
              canEdit={canEdit}
              slaStaleDays={slaStaleDays}
              slaNewDays={slaNewDays}
              isDragOver={dragOverStage === 'rejected'}
              onSelectLead={onSelectLead}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setDragOverStage('rejected');
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setDragOverStage(null);
                const leadId = e.dataTransfer.getData('text/plain');
                if (leadId) onDropLead(leadId, 'rejected');
              }}
            />
          )}

          {/* Disqualified column */}
          {dqLeads.length > 0 && (
            <KanbanColumn
              stage="disqualified"
              icon={Ban}
              count={dqLeads.length}
              leads={dqLeads}
              selectedLead={selectedLead}
              nowMs={nowMs}
              canEdit={canEdit}
              slaStaleDays={slaStaleDays}
              slaNewDays={slaNewDays}
              isDragOver={dragOverStage === 'disqualified'}
              onSelectLead={onSelectLead}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setDragOverStage('disqualified');
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setDragOverStage(null);
                const leadId = e.dataTransfer.getData('text/plain');
                if (leadId) onDropLead(leadId, 'disqualified');
              }}
            />
          )}
        </div>

        {/* Detail panel in kanban mode */}
        {selectedLead && (
          <div className="hidden lg:block w-80 shrink-0">
          <LeadDetailPanel
            key={selectedLead}
            id={selectedLead}
            onClose={onCloseLead}
            onMutate={onMutate}
            canEdit={canEdit}
            nowMs={nowMs}
            slaStaleDays={slaStaleDays}
            slaNewDays={slaNewDays}
          />
          </div>
        )}
      </div>

      {/* Mobile detail panel */}
      {selectedLead && (
        <div className="lg:hidden">
          <LeadDetailPanel
            key={`mobile-${selectedLead}`}
            id={selectedLead}
            onClose={onCloseLead}
            onMutate={onMutate}
            canEdit={canEdit}
            nowMs={nowMs}
            slaStaleDays={slaStaleDays}
            slaNewDays={slaNewDays}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Kanban Column ────────────────────────────────────── */

function KanbanColumn({
  stage,
  icon: Icon,
  count,
  leads,
  selectedLead,
  nowMs,
  canEdit,
  slaStaleDays,
  slaNewDays,
  isDragOver,
  onSelectLead,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  stage: string;
  icon: typeof Send;
  count: number;
  leads: Lead[];
  selectedLead: string | null;
  nowMs: number | null;
  canEdit: boolean;
  slaStaleDays: number;
  slaNewDays: number;
  isDragOver: boolean;
  onSelectLead: (id: string) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
}) {
  return (
    <div
      className={`min-w-[200px] w-[200px] shrink-0 snap-start transition-colors rounded-xl ${
        isDragOver ? 'bg-primary/10 ring-1 ring-primary/30' : ''
      }`}
      onDragOver={canEdit ? onDragOver : undefined}
      onDragLeave={onDragLeave}
      onDrop={canEdit ? onDrop : undefined}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-2 py-2 mb-2">
        <Icon size={13} className={STAGE_COLORS[stage]} />
        <span className="text-xs font-medium capitalize">{stage}</span>
        <span className="text-[10px] font-mono bg-muted/50 px-1.5 py-0.5 rounded ml-auto">{count}</span>
      </div>

      {/* Cards */}
      <div className="space-y-2 min-h-[100px] px-1">
        {leads.map(lead => (
          <KanbanCard
            key={lead.id}
            lead={lead}
            selected={selectedLead === lead.id}
            nowMs={nowMs}
            canEdit={canEdit}
            slaStaleDays={slaStaleDays}
            slaNewDays={slaNewDays}
            onSelect={() => onSelectLead(lead.id)}
          />
        ))}
        {leads.length === 0 && (
          <div className="text-[10px] text-muted-foreground text-center py-6 opacity-50">
            {canEdit ? 'Drop here' : 'No items'}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Kanban Card ──────────────────────────────────────── */

function KanbanCard({ lead, selected, onSelect, nowMs, canEdit, slaStaleDays, slaNewDays }: { lead: Lead; selected: boolean; onSelect: () => void; nowMs: number | null; canEdit: boolean; slaStaleDays: number; slaNewDays: number }) {
  const isPaused = (lead as { pause_outreach?: number }).pause_outreach === 1;
  const missingEmail = !lead.email;
  const missingCompany = !lead.company;
  const missingIndustry = !lead.industry_segment;
  const staleDays = (nowMs != null && lead.last_touch_at)
    ? Math.floor((nowMs - new Date(lead.last_touch_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const newDays = (nowMs != null && !lead.last_touch_at)
    ? Math.floor((nowMs - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  function handleDragStart(e: DragEvent) {
    if (!canEdit) return;
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <button
      type="button"
      draggable={canEdit}
      onDragStart={handleDragStart}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${lead.first_name ?? ''} ${lead.last_name ?? ''}${lead.company ? `, ${lead.company}` : ''}`.trim() || 'Lead'}
      className={`card p-2.5 transition-all text-left hover:border-primary/30 ${
        selected ? 'border-primary/50 bg-primary/5' : ''
      } ${isPaused ? 'opacity-60' : ''} ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
    >
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <span className="text-xs font-medium truncate leading-tight">
          {lead.first_name} {lead.last_name}
        </span>
        {lead.tier && (
          <span className={`text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0 ${TIER_COLORS[lead.tier] || ''}`}>
            {lead.tier}
          </span>
        )}
      </div>
      {lead.company && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1.5">
          <Building2 size={9} />
          <span className="truncate">{lead.company}</span>
        </div>
      )}
      <div className="flex items-center gap-1 flex-wrap text-[9px] text-muted-foreground mb-1.5">
        {lead.last_touch_at && (
          <span className={`px-1.5 py-0.5 rounded-full ${
            staleDays !== null && staleDays > slaStaleDays
              ? 'bg-destructive/15 text-destructive'
              : staleDays !== null && staleDays > Math.max(1, Math.floor(slaStaleDays / 3))
                ? 'bg-warning/15 text-warning'
                : 'bg-success/15 text-success'
          }`}>
            {timeAgo(lead.last_touch_at)}
          </span>
        )}
        {!lead.last_touch_at && newDays !== null && (
          <span className={`px-1.5 py-0.5 rounded-full ${
            newDays > slaNewDays ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'
          }`}>
            new {newDays}d
          </span>
        )}
        {(staleDays !== null && staleDays > slaStaleDays) && (
          <span className="px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">
            SLA
          </span>
        )}
        {lead.next_action_at && (
          <span className="px-1.5 py-0.5 rounded-full bg-info/15 text-info">
            next {timeAgo(lead.next_action_at)}
          </span>
        )}
        {(missingEmail || missingCompany || missingIndustry) && (
          <span className="px-1.5 py-0.5 rounded-full bg-warning/15 text-warning flex items-center gap-1">
            <AlertCircle size={9} /> missing
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        {lead.score != null && (
          <div className="flex items-center gap-1">
            <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  lead.score >= 80 ? 'bg-success' : lead.score >= 50 ? 'bg-warning' : 'bg-destructive'
                }`}
                style={{ width: `${lead.score}%` }}
              />
            </div>
            <span className="text-[9px] font-mono text-muted-foreground">{lead.score}</span>
          </div>
        )}
        {isPaused && <Pause size={10} className="text-warning" />}
      </div>
    </button>
  );
}

/* ─── Lead Row (List View) ─────────────────────────────── */

function LeadRow({ lead, selected, onClick, nowMs, slaStaleDays, slaNewDays }: { lead: Lead & { pause_outreach?: number }; selected: boolean; onClick: () => void; nowMs: number | null; slaStaleDays: number; slaNewDays: number }) {
  const Icon = STAGE_ICONS[lead.status] || CircleDot;
  const isPaused = (lead as { pause_outreach?: number }).pause_outreach === 1;
  const missingEmail = !lead.email;
  const missingCompany = !lead.company;
  const missingIndustry = !lead.industry_segment;
  const staleDays = (nowMs != null && lead.last_touch_at)
    ? Math.floor((nowMs - new Date(lead.last_touch_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const newDays = (nowMs != null && !lead.last_touch_at)
    ? Math.floor((nowMs - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  return (
    <button
      onClick={onClick}
      className={`card card-hover w-full text-left p-4 flex items-center gap-4 transition-all ${
        selected ? 'border-primary/50 bg-primary/5' : ''
      } ${isPaused ? 'opacity-60' : ''}`}
    >
      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
        {isPaused ? (
          <Pause size={14} className="text-warning" />
        ) : (
          <User size={16} className="text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">
            {lead.first_name} {lead.last_name}
          </span>
          {lead.tier && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TIER_COLORS[lead.tier] || ''}`}>
              {lead.tier}
            </span>
          )}
          {isPaused && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">
              paused
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {lead.company && (
            <span className="flex items-center gap-1 truncate">
              <Building2 size={10} /> {lead.company}
            </span>
          )}
          {lead.title && <span className="truncate">{lead.title}</span>}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1 flex-wrap">
          {lead.last_touch_at && (
            <span className={`px-2 py-0.5 rounded-full ${
              staleDays !== null && staleDays > slaStaleDays
                ? 'bg-destructive/15 text-destructive'
                : staleDays !== null && staleDays > Math.max(1, Math.floor(slaStaleDays / 3))
                  ? 'bg-warning/15 text-warning'
                  : 'bg-success/15 text-success'
            }`}>
              last touch {timeAgo(lead.last_touch_at)}
            </span>
          )}
          {!lead.last_touch_at && newDays !== null && (
            <span className={`px-2 py-0.5 rounded-full ${
              newDays > slaNewDays ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'
            }`}>
              new {newDays}d
            </span>
          )}
          {(staleDays !== null && staleDays > slaStaleDays) && (
            <span className="px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
              SLA breach
            </span>
          )}
          {lead.next_action_at && (
            <span className="px-2 py-0.5 rounded-full bg-info/15 text-info">
              next {timeAgo(lead.next_action_at)}
            </span>
          )}
          {(missingEmail || missingCompany || missingIndustry) && (
            <span className="px-2 py-0.5 rounded-full bg-warning/15 text-warning flex items-center gap-1">
              <AlertCircle size={10} /> missing {[
                missingEmail ? 'email' : null,
                missingCompany ? 'company' : null,
                missingIndustry ? 'industry' : null,
              ].filter(Boolean).join(', ')}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <Icon size={14} className={STAGE_COLORS[lead.status]} />
          <span className="text-xs capitalize">{lead.status}</span>
        </div>
        {lead.score != null && (
          <span className="text-xs font-mono font-semibold bg-muted/50 px-2 py-0.5 rounded">
            {lead.score}
          </span>
        )}
        <Link
          href={`/crm/${lead.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground"
          title="Open record"
          aria-label="Open record"
        >
          <ExternalLink size={14} />
        </Link>
        <ChevronRight size={14} className="text-muted-foreground" />
      </div>
    </button>
  );
}


/* Lead detail panel extracted to src/components/crm/lead-detail-panel.tsx */
