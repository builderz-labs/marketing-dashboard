'use client';

import { useState } from 'react';
import { Mail, Linkedin, Clock, ChevronLeft, ChevronRight, Check, XCircle, Save, X, Ban, Pause, Play, Trash2, Edit3, Loader2, ChevronDown, ChevronUp, Send, CheckCircle, MessageSquare, Eye, CalendarCheck, Star, CircleDot } from 'lucide-react';
import { useSmartPoll } from '@/hooks/use-smart-poll';
import { timeAgo } from '@/lib/utils';
import type { Lead, Sequence } from '@/types';

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

export type LeadDetailPanelVariant = 'panel' | 'page';

interface LeadDetail {
  lead: Lead & { pause_outreach?: number };
  sequences: Sequence[];
  timeline: { id: number; type: string; description: string; timestamp: string }[];
}

export function LeadDetailPanel({
  id,
  onClose,
  onMutate,
  canEdit,
  nowMs,
  slaStaleDays,
  slaNewDays,
  variant = 'panel',
}: {
  id: string;
  onClose: () => void;
  onMutate: () => void;
  canEdit: boolean;
  nowMs: number | null;
  slaStaleDays: number;
  slaNewDays: number;
  variant?: LeadDetailPanelVariant;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [expandedSeq, setExpandedSeq] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    first_name: '',
    last_name: '',
    title: '',
    company: '',
    company_size: '',
    industry_segment: '',
    source: '',
    email: '',
    linkedin_url: '',
    score: '',
  });

  const { data, loading } = useSmartPoll<LeadDetail>(
    () => fetch(`/api/crm?id=${id}`).then(r => {
      if (!r.ok) throw new Error('Failed to load');
      return r.json();
    }),
    { interval: 30_000, key: detailRefresh },
  );

  // Refresh the editable drafts when a new lead payload arrives (or profile
  // editing ends), adjusting state during render instead of in an effect.
  const loadedLead = data?.lead;
  const [syncedDraftSource, setSyncedDraftSource] = useState({ lead: loadedLead, editingProfile });
  if (syncedDraftSource.lead !== loadedLead || syncedDraftSource.editingProfile !== editingProfile) {
    setSyncedDraftSource({ lead: loadedLead, editingProfile });
    if (loadedLead?.notes !== undefined) {
      setNotesValue(loadedLead.notes || '');
    }
    if (loadedLead?.next_action_at) {
      setNextAction(loadedLead.next_action_at.split('T')[0]);
    }
    if (!editingProfile && loadedLead) {
      setProfileDraft({
        first_name: loadedLead.first_name || '',
        last_name: loadedLead.last_name || '',
        title: loadedLead.title || '',
        company: loadedLead.company || '',
        company_size: loadedLead.company_size || '',
        industry_segment: loadedLead.industry_segment || '',
        source: loadedLead.source || '',
        email: loadedLead.email || '',
        linkedin_url: loadedLead.linkedin_url || '',
        score: typeof loadedLead.score === 'number' ? String(loadedLead.score) : '',
      });
    }
  }

  function showFeedback(type: 'success' | 'error', msg: string) {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 2500);
  }

  async function patchLead(updates: Record<string, unknown>) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/crm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) throw new Error('Update failed');
      showFeedback('success', 'Updated');
      setDetailRefresh(k => k + 1);
      onMutate();
    } catch {
      showFeedback('error', 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    if (!canEdit) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        id,
        first_name: profileDraft.first_name.trim() || null,
        last_name: profileDraft.last_name.trim() || null,
        title: profileDraft.title.trim() || null,
        company: profileDraft.company.trim() || null,
        company_size: profileDraft.company_size.trim() || null,
        industry_segment: profileDraft.industry_segment.trim() || null,
        source: profileDraft.source.trim() || null,
        email: profileDraft.email.trim() || null,
        linkedin_url: profileDraft.linkedin_url.trim() || null,
        score: profileDraft.score.trim() ? Number(profileDraft.score) : null,
      };

      const res = await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      showFeedback('success', 'Updated');
      setEditingProfile(false);
      setDetailRefresh(k => k + 1);
      onMutate();
    } catch {
      showFeedback('error', 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  async function deleteLead() {
    if (!canEdit) return;
    if (!confirm('Delete this lead? This will also delete its sequences.')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      showFeedback('success', 'Deleted');
      onClose();
      onMutate();
    } catch {
      showFeedback('error', 'Failed to delete');
    } finally {
      setSaving(false);
    }
  }

  async function patchSequence(seqId: string, status: string) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/crm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: seqId, type: 'sequence', status }),
      });
      if (!res.ok) throw new Error('Update failed');
      showFeedback('success', status === 'approved' ? 'Email approved' : 'Email rejected');
      setDetailRefresh(k => k + 1);
      onMutate();
    } catch {
      showFeedback('error', 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  const wrapperClass =
    variant === 'panel'
      ? 'panel sticky top-24 animate-slide-in max-h-[calc(100vh-8rem)] overflow-y-auto'
      : 'panel w-full';

  if (loading && !data) {
    return (
      <div className={`${wrapperClass} p-6 flex items-center justify-center h-64`}>
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`${wrapperClass} p-6 text-center space-y-2`}>
        <XCircle size={24} className="mx-auto text-destructive/60" />
        <p className="text-sm text-muted-foreground">Failed to load lead</p>
        <button onClick={() => setDetailRefresh(k => k + 1)} className="btn btn-ghost btn-sm">
          Retry
        </button>
      </div>
    );
  }

  const { lead, sequences, timeline } = data;
  const isPaused = (lead as { pause_outreach?: number }).pause_outreach === 1;
  const currentStageIdx = STAGES.indexOf(lead.status as typeof STAGES[number]);
  const canAdvance = currentStageIdx >= 0 && currentStageIdx < STAGES.length - 1;
  const canRevert = currentStageIdx > 0;
  const staleDays = (nowMs != null && lead.last_touch_at)
    ? Math.floor((nowMs - new Date(lead.last_touch_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const newDays = (nowMs != null && !lead.last_touch_at)
    ? Math.floor((nowMs - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const sentCount = sequences.filter(s => s.status === 'sent').length;
  const pendingCount = sequences.filter(s => s.status === 'pending_approval').length;
  const totalSteps = sequences.length;

  const Icon = STAGE_ICONS[lead.status] || CircleDot;

  return (
    <div className={wrapperClass}>
      {feedback && (
        <div className={`mx-5 mt-5 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 animate-in ${
          feedback.type === 'success' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'
        }`}>
          {feedback.type === 'success' ? <Check size={12} /> : <XCircle size={12} />}
          {feedback.msg}
        </div>
      )}

      <div className="panel-header">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{lead.first_name} {lead.last_name}</h3>
            <Icon size={14} className="text-muted-foreground shrink-0" />
          </div>
          <p className="text-xs text-muted-foreground truncate">{lead.title} at {lead.company}</p>
          {!canEdit && <p className="text-[10px] text-muted-foreground mt-0.5">Read-only</p>}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={deleteLead}
              disabled={saving}
              className="text-destructive hover:text-destructive/80 disabled:opacity-50"
              title="Delete lead"
              aria-label="Delete lead"
              type="button"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button type="button" aria-label="Close lead" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="panel-body space-y-4">
        {/* Contact */}
        <div className="space-y-1.5">
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-xs hover:text-primary transition-colors">
              <Mail size={12} className="text-muted-foreground shrink-0" />
              <span className="font-mono truncate">{lead.email}</span>
            </a>
          )}
          {lead.linkedin_url && (
            <a
              href={lead.linkedin_url.startsWith('http') ? lead.linkedin_url : `https://${lead.linkedin_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs hover:text-primary transition-colors"
            >
              <Linkedin size={12} className="text-muted-foreground shrink-0" />
              <span className="truncate">{lead.linkedin_url}</span>
            </a>
          )}
        </div>

        {/* Profile */}
        <div className="rounded-lg border border-border/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-muted-foreground">Profile</h4>
            {!editingProfile && canEdit && (
              <button
                type="button"
                onClick={() => setEditingProfile(true)}
                className="text-[10px] text-primary hover:underline"
              >
                Edit
              </button>
            )}
          </div>

          {editingProfile ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input name="first_name" aria-label="First name" autoComplete="given-name" className="px-2 py-1 rounded-md border border-border bg-background text-xs" placeholder="First name" value={profileDraft.first_name} onChange={(e) => setProfileDraft(v => ({ ...v, first_name: e.target.value }))} />
                <input name="last_name" aria-label="Last name" autoComplete="family-name" className="px-2 py-1 rounded-md border border-border bg-background text-xs" placeholder="Last name" value={profileDraft.last_name} onChange={(e) => setProfileDraft(v => ({ ...v, last_name: e.target.value }))} />
                <input name="title" aria-label="Title" autoComplete="organization-title" className="px-2 py-1 rounded-md border border-border bg-background text-xs" placeholder="Title" value={profileDraft.title} onChange={(e) => setProfileDraft(v => ({ ...v, title: e.target.value }))} />
                <input name="company" aria-label="Company" autoComplete="organization" className="px-2 py-1 rounded-md border border-border bg-background text-xs" placeholder="Company" value={profileDraft.company} onChange={(e) => setProfileDraft(v => ({ ...v, company: e.target.value }))} />
                <input name="email" aria-label="Email" autoComplete="email" type="email" className="px-2 py-1 rounded-md border border-border bg-background text-xs" placeholder="Email" value={profileDraft.email} onChange={(e) => setProfileDraft(v => ({ ...v, email: e.target.value }))} />
                <input name="linkedin_url" aria-label="LinkedIn URL" autoComplete="url" type="url" className="px-2 py-1 rounded-md border border-border bg-background text-xs" placeholder="LinkedIn URL" value={profileDraft.linkedin_url} onChange={(e) => setProfileDraft(v => ({ ...v, linkedin_url: e.target.value }))} />
                <input name="source" aria-label="Source" autoComplete="off" className="px-2 py-1 rounded-md border border-border bg-background text-xs" placeholder="Source" value={profileDraft.source} onChange={(e) => setProfileDraft(v => ({ ...v, source: e.target.value }))} />
                <input name="industry_segment" aria-label="Industry segment" autoComplete="off" className="px-2 py-1 rounded-md border border-border bg-background text-xs" placeholder="Industry segment" value={profileDraft.industry_segment} onChange={(e) => setProfileDraft(v => ({ ...v, industry_segment: e.target.value }))} />
                <input name="company_size" aria-label="Company size" autoComplete="off" className="px-2 py-1 rounded-md border border-border bg-background text-xs" placeholder="Company size" value={profileDraft.company_size} onChange={(e) => setProfileDraft(v => ({ ...v, company_size: e.target.value }))} />
                <input name="score" aria-label="Score" inputMode="numeric" type="number" min={0} max={100} className="px-2 py-1 rounded-md border border-border bg-background text-xs" placeholder="Score (0-100)" value={profileDraft.score} onChange={(e) => setProfileDraft(v => ({ ...v, score: e.target.value }))} />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-xs"
                  onClick={() => { setEditingProfile(false); setDetailRefresh(k => k + 1); }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm text-xs bg-primary/15 text-primary hover:bg-primary/25"
                  onClick={saveProfile}
                  disabled={saving}
                >
                  <Save size={12} /> Save
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Source</span><span className="truncate">{lead.source || '—'}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Industry</span><span className="truncate">{lead.industry_segment || '—'}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Company Size</span><span className="truncate">{lead.company_size || '—'}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Email</span><span className="truncate">{lead.email || '—'}</span></div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/30 rounded-lg p-2 text-center">
            <div className="text-sm font-semibold">{lead.score ?? '\u2014'}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Score</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-2 text-center">
            <div className="text-sm font-semibold capitalize">{lead.tier || '\u2014'}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Tier</div>
          </div>
          <div className="bg-muted/30 rounded-lg p-2 text-center">
            <div className="text-sm font-semibold capitalize">{lead.status}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Stage</div>
          </div>
        </div>

        {/* Stage Controls */}
        <div className="flex items-center gap-2">
          <button
            disabled={!canEdit || !canRevert || saving}
            onClick={() => patchLead({ status: STAGES[currentStageIdx - 1] })}
            className="btn btn-ghost btn-sm flex-1 disabled:opacity-30"
            title="Previous stage"
            type="button"
          >
            <ChevronLeft size={14} />
            {canRevert ? STAGES[currentStageIdx - 1] : 'Back'}
          </button>
          <button
            disabled={!canEdit || !canAdvance || saving}
            onClick={() => patchLead({ status: STAGES[currentStageIdx + 1] })}
            className="btn btn-sm flex-1 bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-30"
            title="Advance stage"
            type="button"
          >
            {canAdvance ? STAGES[currentStageIdx + 1] : 'Done'}
            <ChevronRight size={14} />
          </button>
          {lead.status !== 'disqualified' && lead.status !== 'rejected' && (
            <button
              disabled={!canEdit || saving}
              onClick={() => patchLead({ status: 'disqualified' })}
              className="btn btn-ghost btn-sm text-destructive hover:bg-destructive/10"
              title="Disqualify"
              type="button"
            >
              <Ban size={14} />
            </button>
          )}
        </div>

        {/* SLA/Task */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {lead.last_touch_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Touch</span>
              <span className={`px-2 py-0.5 rounded-full ${
                staleDays !== null && staleDays > slaStaleDays
                  ? 'bg-destructive/15 text-destructive'
                  : staleDays !== null && staleDays > Math.max(1, Math.floor(slaStaleDays / 3))
                    ? 'bg-warning/15 text-warning'
                    : 'bg-success/15 text-success'
              }`}>
                {timeAgo(lead.last_touch_at)}
              </span>
            </div>
          )}
          {!lead.last_touch_at && newDays !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">New Lead SLA</span>
              <span className={`px-2 py-0.5 rounded-full ${
                newDays > slaNewDays ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'
              }`}>
                {newDays}d
              </span>
            </div>
          )}

          <div className="flex justify-between items-center gap-2 col-span-2">
            <span className="text-muted-foreground">Next Action</span>
            <input
              type="date"
              value={nextAction}
              onChange={e => setNextAction(e.target.value)}
              className="bg-muted/30 rounded px-2 py-0.5 text-[10px]"
              disabled={!canEdit || saving}
            />
            <button
              onClick={() => patchLead({ next_action_at: nextAction ? new Date(`${nextAction}T00:00:00.000Z`).toISOString() : null })}
              disabled={!canEdit || saving}
              className="btn btn-ghost btn-sm text-[10px]"
              type="button"
            >
              Save
            </button>
          </div>
        </div>

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Edit3 size={12} /> Notes
            </h4>
            {!editingNotes && canEdit && (
              <button
                onClick={() => { setEditingNotes(true); setNotesValue(lead.notes || ''); }}
                className="text-[10px] text-primary hover:underline"
                type="button"
              >
                Edit
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                value={notesValue}
                onChange={e => setNotesValue(e.target.value)}
                placeholder="Add notes about this lead..."
                rows={3}
                className="w-full text-xs resize-none"
              />
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setEditingNotes(false)} className="btn btn-ghost btn-sm text-xs" type="button">Cancel</button>
                <button
                  onClick={() => { patchLead({ notes: notesValue }); setEditingNotes(false); }}
                  disabled={!canEdit || saving}
                  className="btn btn-sm text-xs bg-primary/15 text-primary hover:bg-primary/25"
                  type="button"
                >
                  <Save size={12} /> Save
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-muted/20 rounded-lg p-3 text-xs min-h-[2rem]">
              {lead.notes || <span className="text-muted-foreground italic">No notes yet</span>}
            </div>
          )}
        </div>

        {/* Timeline */}
        {timeline.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Clock size={12} /> Timeline
            </h4>
            <div className="space-y-3 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border">
              {timeline.map(event => (
                <div key={event.id} className="flex items-start gap-3 pl-0 relative">
                  <div className={`w-[15px] h-[15px] rounded-full border-2 border-background shrink-0 z-10 ${
                    event.type === 'pending_approval' ? 'bg-warning' :
                    event.type === 'approved' ? 'bg-success' :
                    'bg-muted'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed">{event.description}</p>
                    <p className="text-[10px] text-muted-foreground">{timeAgo(event.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sequences */}
        {sequences.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Send size={12} /> Email Sequences ({sequences.length})
              </h4>
              <div className="flex items-center gap-2 text-[10px]">
                {sentCount > 0 && <span className="text-success">{sentCount} sent</span>}
                {pendingCount > 0 && <span className="text-warning">{pendingCount} pending</span>}
              </div>
            </div>

            {totalSteps > 0 && (
              <div className="flex items-center gap-1.5 mb-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden flex">
                  <div className="h-full bg-success transition-all" style={{ width: `${(sentCount / totalSteps) * 100}%` }} />
                  <div className="h-full bg-warning transition-all" style={{ width: `${(pendingCount / totalSteps) * 100}%` }} />
                </div>
                <span className="text-[9px] text-muted-foreground font-mono">{sentCount}/{totalSteps}</span>
              </div>
            )}

            <div className="space-y-1.5">
              {sequences.map(seq => (
                <div key={seq.id} className="bg-muted/20 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedSeq(expandedSeq === seq.id ? null : seq.id)}
                    className="w-full flex items-center justify-between text-xs px-3 py-2 hover:bg-muted/30 transition-colors"
                    type="button"
                  >
                    <div className="truncate text-left">
                      <span className="text-muted-foreground">Step {seq.step}: </span>
                      {seq.subject || 'No subject'}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={`${
                        seq.status === 'sent' ? 'text-success' :
                        seq.status === 'pending_approval' ? 'text-warning' :
                        seq.status === 'approved' ? 'text-info' :
                        seq.status === 'cancelled' ? 'text-destructive' :
                        'text-muted-foreground'
                      }`}>
                        {seq.status === 'pending_approval' ? 'pending' : seq.status}
                      </span>
                      {expandedSeq === seq.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </div>
                  </button>

                  {expandedSeq === seq.id && (
                    <div className="border-t border-border/20 px-3 py-2 space-y-2">
                      {seq.body ? (
                        <div className="text-xs bg-background/50 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono leading-relaxed">
                          {seq.body}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground italic">No body</div>
                      )}

                      {seq.status === 'pending_approval' && canEdit && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => patchSequence(seq.id, 'cancelled')}
                            disabled={saving}
                            className="btn btn-ghost btn-sm text-xs text-destructive hover:bg-destructive/10"
                            type="button"
                          >
                            <XCircle size={12} /> Reject
                          </button>
                          <button
                            onClick={() => patchSequence(seq.id, 'approved')}
                            disabled={saving}
                            className="btn btn-sm text-xs bg-success/15 text-success hover:bg-success/25"
                            type="button"
                          >
                            <Check size={12} /> Approve
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outreach pause */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canEdit || saving}
            onClick={() => patchLead({ pause_outreach: !isPaused })}
            className="btn btn-ghost btn-sm"
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            {isPaused ? 'Resume outreach' : 'Pause outreach'}
          </button>
        </div>
      </div>
    </div>
  );
}

