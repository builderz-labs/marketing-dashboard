'use client';

import { useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, History, ThermometerSun, Pencil, Plus, Trash2, X, BookmarkPlus } from 'lucide-react';
import { useSmartPoll } from '@/hooks/use-smart-poll';
import { toast } from '@/components/ui/toast';

interface CronJob {
  id: string;
  name?: string;
  agentId?: string;
  skill?: string;
  enabled?: boolean;
  schedule?: { expr?: string; tz?: string };
  payload?: { model?: string; message?: string };
  state?: {
    lastRunAtMs?: number;
    lastStatus?: string;
    lastDurationMs?: number;
    lastError?: string;
    nextRunAtMs?: number;
  };
  lastRun?: string | null;
  lastResult?: string | null;
}

interface CronStatusPayload {
  jobs: CronJob[];
  can_write?: boolean;
  can_templates_write?: boolean;
}

interface CronTemplate {
  id: string;
  name: string;
  description?: string | null;
  job_json: string;
  updated_at_ms?: number;
}

interface CronRun {
  ts?: number | string | null;
  status?: string;
  durationMs?: number | null;
  summary?: string | null;
  error?: string | null;
  nextRunAtMs?: number | null;
}

interface ModelHealth {
  ok?: boolean;
  running?: { name: string; expires_at?: string }[];
}

function formatTime(ms?: number) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

function formatRunTs(ts?: number | string | null) {
  if (!ts) return '—';
  if (typeof ts === 'number') return new Date(ts).toLocaleString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
}

function normalizeModel(model?: string | null) {
  if (!model) return null;
  return model.replace(/^ollama\//, '');
}

export function CronBoard({ variant = 'embedded' }: { variant?: 'page' | 'embedded' }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data } = useSmartPoll<CronStatusPayload>(
    () => fetch('/api/cron').then(r => r.json()),
    { interval: 30_000, key: refreshKey },
  );
  const { data: modelHealth } = useSmartPoll<ModelHealth>(
    () => fetch('/api/model-health').then(r => r.json()),
    { interval: 30_000 },
  );
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [runs, setRuns] = useState<Record<string, CronRun[]>>({});
  const [openRuns, setOpenRuns] = useState<Record<string, boolean>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<'create' | 'edit'>('edit');
  const [editJobId, setEditJobId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<CronTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateId, setTemplateId] = useState<string>('');

  const jobs = useMemo(() => data?.jobs ?? [], [data?.jobs]);
  const canWrite = !!data?.can_write;
  const canTemplatesWrite = !!data?.can_templates_write;
  const runningSet = useMemo(() => {
    const set = new Set<string>();
    for (const m of modelHealth?.running || []) {
      if (m?.name) set.add(m.name);
    }
    return set;
  }, [modelHealth]);

  const summary = useMemo(() => {
    const total = jobs.length;
    const errors = jobs.filter(j => j.enabled !== false && j.state?.lastStatus && j.state.lastStatus !== 'ok').length;
    const disabled = jobs.filter(j => j.enabled === false).length;
    return { total, errors, disabled };
  }, [jobs]);

  const refreshTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch('/api/cron/templates');
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(payload?.error || 'Failed to load templates'));
      setTemplates(Array.isArray(payload?.templates) ? payload.templates : []);
    } catch (e) {
      toast.error((e as Error).message || 'Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const runAction = async (id: string, action: 'toggle' | 'trigger') => {
    setPending((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch('/api/cron', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error('Request failed');
      toast.success(action === 'trigger' ? 'Cron triggered' : 'Cron toggled');
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Cron action failed');
    } finally {
      setPending((p) => ({ ...p, [id]: false }));
    }
  };

  const openCreate = () => {
    setEditError(null);
    setEditMode('create');
    setEditJobId(null);
    setTemplateId('');
    setEditJson(JSON.stringify({
      id: 'new-job-id',
      agentId: 'hermes',
      name: 'New Cron Job',
      enabled: true,
      schedule: { kind: 'cron', expr: '0 9 * * 1-5', tz: 'UTC' },
      sessionTarget: 'isolated',
      wakeMode: 'now',
      payload: {
        kind: 'agentTurn',
        message: 'Describe what this cron should do and where it should write results.',
        thinking: 'low',
        model: 'ollama/qwen2.5-coder:7b',
      },
      delivery: { mode: 'none' },
      skill: 'custom',
    }, null, 2));
    setEditOpen(true);
    if (!editOpen) refreshTemplates();
  };

  const openEdit = (job: CronJob) => {
    setEditError(null);
    setEditMode('edit');
    setEditJobId(job.id);
    setTemplateId('');
    // Strip transient fields added by the Hermes API enrichment.
    const rest: Record<string, unknown> = { ...job };
    delete rest.lastRun;
    delete rest.lastResult;
    setEditJson(JSON.stringify(rest, null, 2));
    setEditOpen(true);
    if (!editOpen) refreshTemplates();
  };

  const loadTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setEditError(null);
    setTemplateId(id);
    setEditJson(t.job_json);
  };

  const saveTemplateFromEditor = async () => {
    setEditError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(editJson);
    } catch {
      setEditError('Invalid JSON (cannot save as template)');
      return;
    }
    const name = window.prompt('Template name?');
    if (!name) return;
    const description = window.prompt('Template description? (optional)') || '';

    try {
      const res = await fetch('/api/cron/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, job: parsed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data?.error || 'Template save failed'));
      toast.success('Template saved');
      await refreshTemplates();
    } catch (e) {
      toast.error((e as Error).message || 'Template save failed');
    }
  };

  const saveEdit = async () => {
    setEditBusy(true);
    setEditError(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(editJson);
      } catch {
        throw new Error('Invalid JSON');
      }
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Job must be an object');
      }

      const res = await fetch('/api/cron/jobs', {
        method: editMode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: parsed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.error || 'Save failed'));
      }
      toast.success(editMode === 'create' ? 'Cron created' : 'Cron updated');
      setEditOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setEditError((e as Error).message || 'Save failed');
    } finally {
      setEditBusy(false);
    }
  };

  const deleteJob = async (id: string) => {
    const ok = window.confirm(`Delete cron job "${id}"?`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/cron/jobs?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data?.error || 'Delete failed'));
      toast.success('Cron deleted');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error((e as Error).message || 'Delete failed');
    }
  };

  const toggleRuns = async (id: string) => {
    const open = !openRuns[id];
    setOpenRuns((p) => ({ ...p, [id]: open }));
    if (open && !runs[id]) {
      try {
        const res = await fetch(`/api/cron/runs?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        setRuns((p) => ({ ...p, [id]: data.runs || [] }));
      } catch {
        toast.error('Failed to load runs');
      }
    }
  };

  const wrapperClass = variant === 'page' ? 'space-y-6 animate-in' : 'panel';
  const innerGridClass = variant === 'page' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'grid grid-cols-1 lg:grid-cols-2 gap-4';

  return (
      <div className={wrapperClass}>
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setEditOpen(false)}
          />
          <div className="panel relative w-full max-w-3xl" role="dialog" aria-modal="true" aria-labelledby="cron-edit-title">
            <div className="panel-header flex items-center justify-between gap-3">
              <div>
                <h2 id="cron-edit-title" className="text-sm font-medium">
                  {editMode === 'create' ? 'Add Cron Job' : `Edit Cron Job${editJobId ? `: ${editJobId}` : ''}`}
                </h2>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Edit the full job JSON. This writes back to OpenClaw&apos;s `cron/jobs.json`.
                </div>
              </div>
              <button type="button" aria-label="Close cron editor" onClick={() => setEditOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="panel-body space-y-3">
              {editError && (
                <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
                  {editError}
                </div>
              )}

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Templates</label>
                  <select
                    className="input text-xs"
                    value={templateId}
                    onChange={(e) => loadTemplate(e.target.value)}
                    disabled={templatesLoading}
                    aria-label="Load cron template"
                  >
                    <option value="">Load template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {templatesLoading && (
                    <span className="text-[10px] text-muted-foreground">Loading…</span>
                  )}
                </div>
                {canTemplatesWrite && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-xs"
                    onClick={saveTemplateFromEditor}
                    disabled={editBusy}
                    aria-label="Save cron template"
                  >
                    <BookmarkPlus size={12} /> Save as template
                  </button>
                )}
              </div>

              <textarea
                className="w-full min-h-[55vh] input font-mono text-xs leading-relaxed"
                value={editJson}
                onChange={(e) => setEditJson(e.target.value)}
                aria-label="Cron job JSON editor"
              />
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditOpen(false)} disabled={editBusy}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit} disabled={editBusy}>
                  {editBusy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={variant === 'page' ? 'panel' : 'panel-header'}>
        <div className={variant === 'page' ? 'panel-header flex items-center justify-between flex-wrap gap-3' : 'flex items-center justify-between flex-wrap gap-3'}>
          <div>
            <h2 className={variant === 'page' ? 'text-xl font-semibold' : 'text-sm font-medium'}>Cron Jobs</h2>
            {variant === 'page' && (
              <p className="text-sm text-muted-foreground">Live status from OpenClaw cron jobs</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="status-pill status-neutral">Total: {summary.total}</span>
            <span className={summary.errors > 0 ? 'status-pill status-danger' : 'status-pill status-ok'}>
              Errors: {summary.errors}
            </span>
            <span className="status-pill status-warn">Disabled: {summary.disabled}</span>
            {canWrite && (
              <button type="button" className="btn btn-sm text-xs" onClick={openCreate}>
                <Plus size={12} /> Add
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={variant === 'page' ? innerGridClass : `panel-body ${innerGridClass}`}>
        {jobs.map(job => {
          const ok = job.state?.lastStatus === 'ok';
          const statusClass = ok ? 'status-pill status-ok' : (job.state?.lastStatus ? 'status-pill status-danger' : 'status-pill status-neutral');
          const busy = !!pending[job.id];
          const isDisabled = job.enabled === false;
          const runList = runs[job.id] || [];
          const model = normalizeModel(job.payload?.model);
          const isWarm = model ? runningSet.has(model) : false;
          const message = typeof job.payload?.message === 'string' ? job.payload.message : '';
          return (
            <div key={job.id} className="panel">
              <div className="panel-header">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">{job.name || job.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {job.agentId ? `${job.agentId} · ` : ''}{job.skill || 'cron'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={statusClass}>{job.state?.lastStatus || 'unknown'}</span>
                    {isDisabled && <span className="status-pill status-warn">disabled</span>}
                  </div>
                </div>
              </div>
              <div className="panel-body space-y-3">
                {message && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">What it does</summary>
                    <div className="mt-2 bg-muted/20 border border-border/40 rounded-md p-2 space-y-2">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Payload message</div>
                      <pre className="whitespace-pre-wrap bg-muted/30 border border-border/30 rounded-md p-2 max-h-56 overflow-y-auto">
                        {message}
                      </pre>
                    </div>
                  </details>
                )}

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">Schedule</div>
                    <div className="font-mono">{job.schedule?.expr || '—'}</div>
                    <div className="text-muted-foreground">{job.schedule?.tz || ''}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Next Run</div>
                    <div className="font-mono">{formatTime(job.state?.nextRunAtMs)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Last Run</div>
                    <div className="font-mono">{formatTime(job.state?.lastRunAtMs)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Duration</div>
                    <div className="font-mono">{job.state?.lastDurationMs ? `${Math.round(job.state.lastDurationMs / 1000)}s` : '—'}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <ThermometerSun size={12} />
                    <span className="text-muted-foreground">Model:</span>
                    <span className="font-mono">{model || '—'}</span>
                    {model && (
                      <span className={isWarm ? 'status-pill status-ok' : 'status-pill status-warn'}>
                        {isWarm ? 'warm' : 'cold'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-xs"
                    onClick={() => runAction(job.id, 'trigger')}
                    disabled={busy}
                  >
                    <RotateCcw size={12} /> Run now
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm text-xs ${isDisabled ? 'bg-success/15 text-success hover:bg-success/25' : 'bg-warning/15 text-warning hover:bg-warning/25'}`}
                    onClick={() => runAction(job.id, 'toggle')}
                    disabled={busy}
                  >
                    {isDisabled ? <Play size={12} /> : <Pause size={12} />}
                    {isDisabled ? 'Enable' : 'Disable'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-xs"
                    onClick={() => toggleRuns(job.id)}
                  >
                    <History size={12} /> Runs
                  </button>
                  {canWrite && (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm text-xs"
                        onClick={() => openEdit(job)}
                        aria-label="Edit cron job"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm text-xs text-destructive"
                        onClick={() => deleteJob(job.id)}
                        aria-label="Delete cron job"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </>
                  )}
                </div>

                {openRuns[job.id] && (
                  <div className="bg-muted/20 border border-border/40 rounded-md p-3 text-xs space-y-2">
                    {runList.length === 0 ? (
                      <div className="text-muted-foreground">No recent runs</div>
                    ) : (
                      runList.map((r, idx) => (
                        <div key={idx} className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-mono">{formatRunTs(r.ts)}</div>
                            {r.summary && (
                              <div className="text-[11px] text-muted-foreground line-clamp-2">{r.summary}</div>
                            )}
                            {r.error && (
                              <div className="text-[11px] text-destructive">{r.error}</div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className={r.status === 'ok' ? 'status-pill status-ok' : 'status-pill status-danger'}>{r.status || 'unknown'}</div>
                            <div className="text-[10px] text-muted-foreground mt-1">
                              {r.durationMs ? `${Math.round(r.durationMs / 1000)}s` : '—'}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {(job.state?.lastStatus && job.state.lastStatus !== 'ok') || job.state?.lastError ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-destructive">Error drilldown</summary>
                    <div className="mt-2 bg-destructive/10 border border-destructive/30 rounded-md p-2 space-y-2">
                      <div className="text-[11px]">
                        Last status: <span className="font-mono">{job.state?.lastStatus || 'unknown'}</span>
                      </div>
                      {job.state?.lastError && (
                        <div className="text-[11px] text-destructive">{job.state.lastError}</div>
                      )}
                      {job.lastResult && (
                        <pre className="whitespace-pre-wrap bg-muted/30 border border-border/30 rounded-md p-2 max-h-40 overflow-y-auto">
                          {job.lastResult}
                        </pre>
                      )}
                    </div>
                  </details>
                ) : null}

                {job.lastResult && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Last log snippet</summary>
                    <pre className="mt-2 whitespace-pre-wrap bg-muted/30 border border-border/30 rounded-md p-2 max-h-40 overflow-y-auto">
                      {job.lastResult}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
