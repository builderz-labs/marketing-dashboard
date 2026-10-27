'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Folder, RefreshCw, Save, Trash2, Plus, ArrowUp } from 'lucide-react';
import { toast } from '@/components/ui/toast';

type Entry = {
  path: string;
  type: 'file' | 'dir';
  size?: number;
  mtimeMs?: number;
};

type RootKind = 'agent-workspace' | 'openclaw' | 'workspace' | 'agent';

type Root = {
  agents?: string[];
  id: string;
  label: string;
  kind: RootKind;
  writable: boolean;
};

function formatBytes(n?: number) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function parentDir(p: string): string {
  const s = (p || '').replace(/\/+$/, '');
  const idx = s.lastIndexOf('/');
  return idx <= 0 ? '' : s.slice(0, idx);
}

function joinRel(base: string, next: string): string {
  const b = (base || '').replace(/\/+$/, '');
  const n = (next || '').replace(/^\/+/, '');
  return b ? `${b}/${n}` : n;
}

export default function AgentWorkspacePage() {
  const [role, setRole] = useState<'admin' | 'editor' | 'viewer'>('viewer');
  const canEdit = role === 'admin' || role === 'editor';

  const [roots, setRoots] = useState<Root[]>([]);
  const [loadingRoots, setLoadingRoots] = useState(true);

  const workspaceRoots = useMemo(
    () => roots.filter((r) => r.kind === 'workspace' || r.kind === 'agent-workspace'),
    [roots],
  );
  const agentRoots = useMemo(
    () => roots.filter((r) => r.kind === 'agent'),
    [roots],
  );
  const openclawRoot = useMemo(
    () => roots.find((r) => r.kind === 'openclaw') || null,
    [roots],
  );

  const [mode, setMode] = useState<'workspaces' | 'agents' | 'openclaw'>('workspaces');
  const [rootId, setRootId] = useState('agent-workspace');
  const [rootWritable, setRootWritable] = useState(true);
  const [rootLabel, setRootLabel] = useState('Agent Workspace');

  const [cwd, setCwd] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [mtimeMs, setMtimeMs] = useState<number | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [writeBlocked, setWriteBlocked] = useState<string | null>(null);

  const [newPath, setNewPath] = useState('notes.md');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((payload) =>
        setRole(
          payload?.user?.role === 'admin'
            ? 'admin'
            : payload?.user?.role === 'editor'
              ? 'editor'
              : 'viewer',
        ),
      )
      .catch(() => setRole('viewer'));
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch('/api/agents/workspace-roots')
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return;
        const rs = (data?.roots || []) as Root[];
        setRoots(rs);

        // Default root per mode.
        if (mode === 'openclaw') {
          const oc = rs.find((x) => x.kind === 'openclaw');
          if (oc) setRootId(oc.id);
        } else if (mode === 'agents') {
          const first = rs.find((x) => x.kind === 'agent');
          if (first) setRootId(first.id);
        } else {
          const first = rs.find((x) => x.kind === 'agent-workspace') || rs.find((x) => x.kind === 'workspace');
          if (first) setRootId(first.id);
        }
      })
      .catch(() => {
        toast.error('Failed to load workspace roots');
      })
      .finally(() => {
        if (mounted) setLoadingRoots(false);
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync root metadata from the loaded roots, and reset the browser when the
  // selected root changes (adjusting state during render, not in an effect).
  const [syncedRoot, setSyncedRoot] = useState({ roots, rootId });
  if (syncedRoot.roots !== roots || syncedRoot.rootId !== rootId) {
    const rootChanged = syncedRoot.rootId !== rootId;
    setSyncedRoot({ roots, rootId });
    const r = roots.find((x) => x.id === rootId);
    if (r) {
      setRootWritable(Boolean(r.writable));
      setRootLabel(r.label);
    }
    if (rootChanged) {
      setCwd('');
      setSelected(null);
      setContent('');
    }
  }

  // Show the list loading state whenever the listed directory changes.
  const listKey = `${rootId}\u0000${cwd}`;
  const [loadingListKey, setLoadingListKey] = useState(listKey);
  if (loadingListKey !== listKey) {
    setLoadingListKey(listKey);
    setLoadingList(true);
    setWriteBlocked(null);
  }

  const fetchEntries = useCallback(() => {
    const qs = new URLSearchParams();
    qs.set('rootId', rootId);
    if (cwd) qs.set('path', cwd);
    return fetch(`/api/agents/workspace?${qs.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(String(data?.error || 'Failed'));
        setEntries(data.entries || []);
        setRootWritable(Boolean(data.writable));
        setRootLabel((prev) => String(data.rootLabel || prev));
      })
      .catch((e) => {
        toast.error((e as Error).message || 'Failed to load workspace files');
      })
      .finally(() => {
        setLoadingList(false);
      });
  }, [cwd, rootId]);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    setWriteBlocked(null);
    await fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const openFile = async (p: string) => {
    setLoadingFile(true);
    setWriteBlocked(null);
    try {
      const qs = new URLSearchParams();
      qs.set('rootId', rootId);
      qs.set('path', p);
      const res = await fetch(`/api/agents/workspace?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(String(data?.error || 'Failed'));
      setSelected(p);
      setContent(String(data.content ?? ''));
      setMtimeMs(typeof data.mtimeMs === 'number' ? data.mtimeMs : null);
      setSize(typeof data.size === 'number' ? data.size : null);
      setRootWritable(Boolean(data.writable));
      setRootLabel(String(data.rootLabel || rootLabel));
    } catch (e) {
      toast.error((e as Error).message || 'Failed to open file');
    } finally {
      setLoadingFile(false);
    }
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setWriteBlocked(null);
    try {
      const res = await fetch('/api/agents/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootId, path: selected, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = String(data?.error || 'Save failed');
        if (res.status === 403) setWriteBlocked(msg);
        throw new Error(msg);
      }
      toast.success('Saved');
      await refresh();
      if (selected) await openFile(selected);
    } catch (e) {
      toast.error((e as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    const p = newPath.trim();
    if (!p) return;
    const rel = joinRel(cwd, p);

    setCreating(true);
    setWriteBlocked(null);
    try {
      const res = await fetch('/api/agents/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootId, path: rel, content: '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = String(data?.error || 'Create failed');
        if (res.status === 403) setWriteBlocked(msg);
        throw new Error(msg);
      }
      toast.success('File created');
      await refresh();
      await openFile(rel);
    } catch (e) {
      toast.error((e as Error).message || 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    const ok = window.confirm(`Delete ${selected}?`);
    if (!ok) return;
    setSaving(true);
    setWriteBlocked(null);
    try {
      const qs = new URLSearchParams();
      qs.set('rootId', rootId);
      qs.set('path', selected);
      const res = await fetch(`/api/agents/workspace?${qs.toString()}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = String(data?.error || 'Delete failed');
        if (res.status === 403) setWriteBlocked(msg);
        throw new Error(msg);
      }
      toast.success('Deleted');
      setSelected(null);
      setContent('');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const dirs = useMemo(() => entries.filter((e) => e.type === 'dir'), [entries]);
  const files = useMemo(() => entries.filter((e) => e.type === 'file'), [entries]);

  const crumbs = useMemo(() => {
    const parts = (cwd || '').split('/').filter(Boolean);
    const out: Array<{ label: string; path: string }> = [{ label: rootLabel, path: '' }];
    let acc = '';
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      out.push({ label: p, path: acc });
    }
    return out;
  }, [cwd, rootLabel]);

  const showEditorActions = Boolean(selected) && canEdit && rootWritable;
  const showCreate = canEdit && rootWritable;

  const switchMode = (m: typeof mode) => {
    setMode(m);
    if (m === 'openclaw') {
      if (openclawRoot) setRootId(openclawRoot.id);
      return;
    }
    if (m === 'agents') {
      if (agentRoots.length > 0) setRootId(agentRoots[0].id);
      return;
    }
    if (workspaceRoots.length > 0) setRootId(workspaceRoots[0].id);
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Workspace</h1>
          <p className="text-xs text-muted-foreground">
            Browse and edit workspace files. Hidden by default: dotfiles, credentials/state/logs, sessions, sandboxes.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" className="btn btn-ghost btn-sm" onClick={refresh} disabled={loadingList}>
            <RefreshCw size={14} /> Refresh
          </button>
          <span className="badge border bg-muted/20 text-muted-foreground">Role: {role}</span>
          <span className={`badge border ${rootWritable ? 'bg-muted/20 text-muted-foreground' : 'bg-warning/5 text-warning'}`}>
            {rootLabel}{rootWritable ? '' : ' (read-only)'}
          </span>
        </div>
      </div>

      {writeBlocked && (
        <div className="panel border border-warning/40 bg-warning/5">
          <div className="panel-body text-xs text-warning">{writeBlocked}</div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm font-medium">Roots</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`btn btn-sm text-xs ${mode === 'workspaces' ? '' : 'btn-ghost'}`}
              onClick={() => switchMode('workspaces')}
              disabled={loadingRoots}
            >
              Workspaces
            </button>
            <button
              type="button"
              className={`btn btn-sm text-xs ${mode === 'agents' ? '' : 'btn-ghost'}`}
              onClick={() => switchMode('agents')}
              disabled={loadingRoots}
            >
              Agents
            </button>
            <button
              type="button"
              className={`btn btn-sm text-xs ${mode === 'openclaw' ? '' : 'btn-ghost'}`}
              onClick={() => switchMode('openclaw')}
              disabled={loadingRoots}
            >
              .openclaw
            </button>
          </div>
        </div>

        <div className="panel-body">
          {loadingRoots ? (
            <div className="text-xs text-muted-foreground">Loading roots…</div>
          ) : mode === 'openclaw' ? (
            <div className="flex flex-wrap gap-1.5">
              {openclawRoot ? (
                <button
                  type="button"
                  className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                    rootId === openclawRoot.id
                      ? 'bg-primary/14 text-primary border-primary/30'
                      : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30'
                  }`}
                  onClick={() => setRootId(openclawRoot.id)}
                >
                  {openclawRoot.label}
                </button>
              ) : (
                <div className="text-xs text-muted-foreground">No .openclaw root available</div>
              )}
            </div>
          ) : mode === 'agents' ? (
            <div className="flex flex-wrap gap-1.5">
              {agentRoots.length === 0 ? (
                <div className="text-xs text-muted-foreground">No agent roots found</div>
              ) : (
                agentRoots.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                      rootId === r.id
                        ? 'bg-primary/14 text-primary border-primary/30'
                        : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    }`}
                    onClick={() => setRootId(r.id)}
                  >
                    {r.label}
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {workspaceRoots.length === 0 ? (
                <div className="text-xs text-muted-foreground">No workspace roots found</div>
              ) : (
                workspaceRoots.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                      rootId === r.id
                        ? 'bg-primary/14 text-primary border-primary/30'
                        : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    }`}
                    onClick={() => setRootId(r.id)}
                  >
                    {r.label}
                    {r.agents && r.agents.length > 0 && (
                      <span className="ml-1 opacity-60">({r.agents.join(', ')})</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="panel lg:col-span-1">
          <div className="panel-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">Files</div>
              {cwd && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-[10px]"
                  onClick={() => setCwd(parentDir(cwd))}
                  title="Up"
                >
                  <ArrowUp size={12} /> Up
                </button>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{dirs.length + files.length}</div>
          </div>

          <div className="panel-body space-y-3">
            <div className="text-[10px] text-muted-foreground flex flex-wrap gap-1">
              {crumbs.map((c, idx) => (
                <button
                  key={c.path || 'root'}
                  type="button"
                  className={`hover:underline ${idx === crumbs.length - 1 ? 'text-foreground' : ''}`}
                  onClick={() => setCwd(c.path)}
                >
                  {idx === 0 ? c.label : `/${c.label}`}
                </button>
              ))}
            </div>

            {showCreate && (
              <div className="flex items-center gap-2">
                <input
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  className="input text-xs"
                  placeholder="new-file.md"
                  aria-label="New file path"
                />
                <button type="button" className="btn btn-sm text-xs" onClick={create} disabled={creating}>
                  <Plus size={12} /> Add
                </button>
              </div>
            )}

            {loadingList ? (
              <div className="text-xs text-muted-foreground">Loading…</div>
            ) : (
              <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
                {dirs.map((e) => (
                  <button
                    key={e.path}
                    type="button"
                    onClick={() => {
                      setSelected(null);
                      setContent('');
                      setCwd(e.path);
                    }}
                    className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md text-xs transition-colors hover:bg-muted/30 text-muted-foreground hover:text-foreground"
                  >
                    <Folder size={14} />
                    <span className="flex-1 truncate">{e.path.split('/').pop()}</span>
                  </button>
                ))}

                {files.map((e) => (
                  <button
                    key={e.path}
                    type="button"
                    onClick={() => openFile(e.path)}
                    className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md text-xs transition-colors ${
                      selected === e.path
                        ? 'bg-primary/14 text-primary'
                        : 'hover:bg-muted/30 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <FileText size={14} />
                    <span className="flex-1 truncate">{e.path.split('/').pop()}</span>
                    {typeof e.size === 'number' && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatBytes(e.size)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel lg:col-span-2">
          <div className="panel-header flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm font-medium">{selected || 'Select a file'}</div>
              {selected && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  {size !== null ? `${formatBytes(size)} · ` : ''}
                  {mtimeMs ? `Updated ${new Date(mtimeMs).toLocaleString()}` : ''}
                </div>
              )}
            </div>
            {showEditorActions && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-xs"
                  onClick={remove}
                  disabled={saving}
                  aria-label="Delete file"
                >
                  <Trash2 size={14} /> Delete
                </button>
                <button type="button" className="btn btn-sm text-xs" onClick={save} disabled={saving}>
                  <Save size={14} /> Save
                </button>
              </div>
            )}
          </div>

          <div className="panel-body">
            {loadingFile ? (
              <div className="text-xs text-muted-foreground">Loading file…</div>
            ) : (
              <textarea
                className="w-full min-h-[60vh] input font-mono text-xs leading-relaxed"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={!selected || !canEdit || !rootWritable}
                placeholder={
                  selected ? (canEdit ? (rootWritable ? '' : 'Read-only root') : 'Read-only') : 'Choose a file to view/edit'
                }
                aria-label="Workspace file editor"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
