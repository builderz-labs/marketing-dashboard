'use client';

import { useEffect, useState, useCallback } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { FunnelChart } from '@/components/ui/funnel-chart';
import { ApprovalCard } from '@/components/ui/approval-card';
import { formatDateTime } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import { useDashboard } from '@/store';
import type { Lead, Sequence, FunnelStep, Suppression } from '@/types';

type Tab = 'pipeline' | 'leads' | 'sequences' | 'approvals' | 'suppression';

export default function OutreachPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Sequence[]>([]);
  const [suppression, setSuppression] = useState<Suppression[]>([]);
  const [tab, setTab] = useState<Tab>('pipeline');
  const [tierFilter, setTierFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { realOnly } = useDashboard();

  const load = useCallback(() => {
    const realParam = realOnly ? '&real=true' : '';
    fetch(`/api/outreach?_=1${realParam}`).then(r => r.json()).then(data => {
      setLeads(data.leads || []);
      setFunnel(data.funnel || []);
      setPendingApprovals(data.pendingApprovals || []);
    }).catch(() => {});
    const realParam2 = realOnly ? '?real=true' : '';
    fetch(`/api/sequences${realParam2}`).then(r => r.json()).then(setSequences).catch(() => {});
    fetch(`/api/suppression${realParam2}`).then(r => r.json()).then(setSuppression).catch(() => {});
  }, [realOnly]);

  useEffect(() => { load(); }, [load]);

  const updateLeadStatus = async (id: string, status: string) => {
    try {
      await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      toast.success(`Lead status updated to ${status}`);
      load();
    } catch {
      toast.error('Failed to update lead status');
    }
  };

  const updateSequenceStatus = async (id: string, status: string) => {
    try {
      await fetch('/api/sequences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      toast.success(status === 'approved' ? 'Email draft approved' : 'Email draft rejected');
      load();
    } catch {
      toast.error('Failed to update sequence status');
    }
  };

  const filteredLeads = leads.filter(l => {
    if (tierFilter && l.tier !== tierFilter) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Outreach</h1>
        <div className="text-xs text-muted-foreground">
          Leads <span className="font-mono text-foreground">{leads.length}</span>
          {' · '}
          Approvals <span className="font-mono text-foreground">{pendingApprovals.length}</span>
          {' · '}
          Suppression <span className="font-mono text-foreground">{suppression.length}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-body !p-0">
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {([
          { key: 'pipeline' as Tab, label: 'Pipeline' },
          { key: 'leads' as Tab, label: `Leads (${leads.length})` },
          { key: 'sequences' as Tab, label: `Sequences (${sequences.length})` },
          { key: 'approvals' as Tab, label: `Approvals (${pendingApprovals.length})` },
          { key: 'suppression' as Tab, label: `Suppression (${suppression.length})` },
        ]).map(t => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      </div>
      </div>

      {tab === 'pipeline' && (
        <div className="panel">
          <div className="panel-header">
            <h3 className="section-title">Lead Funnel</h3>
          </div>
          <div className="panel-body">
          <FunnelChart steps={funnel} />
          </div>
        </div>
      )}

      {tab === 'leads' && (
        <>
          <div className="panel">
            <div className="panel-body !p-3 flex gap-3 flex-wrap">
            <select
              className="px-3"
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
            >
              <option value="">All Tiers</option>
              <option value="A">Tier A</option>
              <option value="B">Tier B</option>
              <option value="C">Tier C</option>
            </select>
            <select
              className="px-3"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {["new", "validated", "approved", "contacted", "replied", "interested", "booked", "qualified", "rejected", "disqualified"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            </div>
          </div>
          <div className="panel">
            <div className="panel-header">
              <h3 className="section-title">Leads</h3>
            </div>
            <div className="panel-body !p-0">
              <DataTable
                columns={[
                  { key: 'first_name', label: 'Name', render: (r: Lead) => (
                    <span className="font-medium text-sm">{r.first_name} {r.last_name}</span>
                  )},
                  { key: 'company', label: 'Company' },
                  { key: 'title', label: 'Title', render: (r: Lead) => (
                    <span className="text-xs text-muted-foreground">{r.title}</span>
                  )},
                  { key: 'tier', label: 'Tier', render: (r: Lead) => r.tier ? (
                    <span className={`badge ${r.tier === 'A' ? 'badge-success' : r.tier === 'B' ? 'badge-info' : 'badge-neutral'}`}>
                      {r.tier}
                    </span>
                  ) : <span>{'\u2014'}</span> },
                  { key: 'status', label: 'Status', render: (r: Lead) => (
                    <select
                      className="px-2 py-0.5 text-xs min-h-[24px]"
                      value={r.status}
                      onChange={e => updateLeadStatus(r.id, e.target.value)}
                    >
                      {["new", "validated", "approved", "contacted", "replied", "interested", "booked", "qualified", "rejected", "disqualified"].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )},
                  { key: 'score', label: 'Score', sortable: true, render: (r: Lead) => (
                    <span className="font-mono text-xs">{r.score ?? '\u2014'}</span>
                  )},
                  { key: 'source', label: 'Source', render: (r: Lead) => (
                    <span className="text-xs text-muted-foreground">{r.source || '\u2014'}</span>
                  )},
                  { key: 'last_touch_at', label: 'Last Touch', render: (r: Lead) => (
                    <span className="text-xs">{formatDateTime(r.last_touch_at)}</span>
                  )},
                ]}
                data={filteredLeads}
                keyField="id"
                emptyMessage="No leads"
              />
            </div>
          </div>
        </>
      )}

      {tab === 'sequences' && (
        <div className="panel">
          <div className="panel-header">
            <h3 className="section-title">Sequences</h3>
          </div>
          <div className="panel-body !p-0">
          <DataTable
            columns={[
              { key: 'sequence_name', label: 'Sequence' },
              { key: 'lead_id', label: 'Lead', render: (r: Sequence) => (
                <span className="font-mono text-xs">{r.lead_id?.slice(0, 8)}</span>
              )},
              { key: 'step', label: 'Step' },
              { key: 'subject', label: 'Subject', render: (r: Sequence) => (
                <span className="text-sm max-w-xs truncate block">{r.subject || '\u2014'}</span>
              )},
              { key: 'status', label: 'Status', render: (r: Sequence) => <Badge status={r.status || 'queued'} /> },
              { key: 'tier', label: 'Tier' },
              { key: 'scheduled_for', label: 'Scheduled', render: (r: Sequence) => (
                <span className="text-xs">{formatDateTime(r.scheduled_for)}</span>
              )},
            ]}
            data={sequences}
            keyField="id"
            emptyMessage="No sequences"
          />
          </div>
        </div>
      )}

      {tab === 'approvals' && (
        <div className="space-y-3">
          {pendingApprovals.length === 0 ? (
            <div className="panel p-8 text-center text-muted-foreground text-sm">
              No email drafts pending approval
            </div>
          ) : (
            pendingApprovals.map(seq => (
              <ApprovalCard
                key={seq.id}
                id={seq.id}
                title={seq.subject || 'Untitled Email'}
                subtitle={`Step ${seq.step} \u2014 ${seq.sequence_name || 'Unknown Sequence'} \u2014 Tier ${seq.tier || '?'}`}
                body={seq.body || ''}
                status={seq.status || 'pending_approval'}
                meta={`Scheduled: ${formatDateTime(seq.scheduled_for)}`}
                onApprove={(id) => updateSequenceStatus(id, 'approved')}
                onReject={(id) => updateSequenceStatus(id, 'cancelled')}
              />
            ))
          )}
        </div>
      )}

      {tab === 'suppression' && (
        <div className="panel">
          <div className="panel-header">
            <h3 className="section-title">Suppression</h3>
          </div>
          <div className="panel-body !p-0">
          <DataTable
            columns={[
              { key: 'email', label: 'Email' },
              { key: 'type', label: 'Type', render: (r: Suppression) => <Badge status={r.type || 'opt_out'} /> },
              { key: 'added_at', label: 'Added', render: (r: Suppression) => (
                <span className="text-xs">{formatDateTime(r.added_at)}</span>
              )},
            ]}
            data={suppression}
            keyField="email"
            emptyMessage="No suppressed emails"
          />
          </div>
        </div>
      )}
    </div>
  );
}
