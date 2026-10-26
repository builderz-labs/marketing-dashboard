'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { TrendChart } from '@/components/ui/trend-chart';
import { PILLAR_LABELS, formatDateTime } from '@/lib/utils';
import { Check, X } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { useDashboard } from '@/store';
import type { ContentPost } from '@/types';

type Tab = 'queue' | 'calendar' | 'metrics';

export default function ContentPage() {
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [tab, setTab] = useState<Tab>('queue');
  const [filter, setFilter] = useState<string>('');
  const { realOnly } = useDashboard();

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filter) params.set('status', filter);
    if (realOnly) params.set('real', 'true');
    const q = params.toString();
    fetch(`/api/content${q ? '?' + q : ''}`).then(r => r.json()).then(setPosts).catch(() => {});
  }, [filter, realOnly]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch('/api/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      toast.success(status === 'ready' ? 'Content approved' : 'Content rejected');
      load();
    } catch {
      toast.error('Failed to update content status');
    }
  };

  const queue = posts.filter(p => ['draft', 'pending_approval', 'ready'].includes(p.status));
  const published = posts.filter(p => p.status === 'published');

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Content</h1>
        <select
          className="px-3"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="ready">Ready</option>
          <option value="published">Published</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="panel">
        <div className="panel-body !p-0">
      <div className="flex gap-0 border-b border-border">
        {(['queue', 'calendar', 'metrics'] as Tab[]).map(t => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      </div>
      </div>

      {tab === 'queue' && (
        <div className="panel">
          <div className="panel-header">
            <h3 className="section-title">Queue</h3>
          </div>
          <div className="panel-body !p-0">
          <DataTable
            columns={[
              { key: 'platform', label: 'Platform', render: (r: ContentPost) => (
                <span className="font-mono text-xs uppercase">{r.platform}</span>
              )},
              { key: 'text_preview', label: 'Content', render: (r: ContentPost) => (
                <span className="text-sm max-w-md truncate block">{r.text_preview || '\u2014'}</span>
              )},
              { key: 'pillar', label: 'Pillar', render: (r: ContentPost) => (
                r.pillar ? <span className="text-xs">{PILLAR_LABELS[r.pillar] || `P${r.pillar}`}</span> : <span>{'\u2014'}</span>
              )},
              { key: 'format', label: 'Format', render: (r: ContentPost) => (
                <span className="text-xs text-muted-foreground">{r.format.replace(/_/g, ' ')}</span>
              )},
              { key: 'status', label: 'Status', render: (r: ContentPost) => <Badge status={r.status} /> },
              { key: 'scheduled_for', label: 'Scheduled', render: (r: ContentPost) => (
                <span className="text-xs">{formatDateTime(r.scheduled_for)}</span>
              )},
              { key: 'actions', label: '', render: (r: ContentPost) => (
                r.status === 'pending_approval' ? (
                  <div className="flex gap-1">
                    <button className="btn btn-success btn-sm" onClick={() => updateStatus(r.id, 'ready')}>
                      <Check size={12} />
                    </button>
                    <button className="btn btn-destructive btn-sm" onClick={() => updateStatus(r.id, 'rejected')}>
                      <X size={12} />
                    </button>
                  </div>
                ) : null
              )},
            ]}
            data={queue}
            keyField="id"
            emptyMessage="No content in queue"
          />
          </div>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="panel">
          <div className="panel-header">
            <h3 className="section-title">Published & Scheduled</h3>
          </div>
          <div className="panel-body">
          <div className="grid grid-cols-7 gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
            ))}
            {generateCalendarDays(published).map((day, i) => (
              <div key={i} className={`min-h-16 p-1 rounded-lg border ${
                day.posts.length > 0 ? 'border-primary/30 bg-primary/5' : 'border-border/30'
              }`}>
                <span className="text-xs text-muted-foreground">{day.label}</span>
                {day.posts.map(p => (
                  <div key={p.id} className="mt-1">
                    <div className="text-[10px] px-1 py-0.5 rounded bg-primary/20 text-primary truncate">
                      {p.platform} \u2014 {p.text_preview?.slice(0, 20)}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {tab === 'metrics' && (
        <div className="space-y-4">
          <div className="panel">
            <div className="panel-header">
              <h3 className="section-title">Engagement by Post</h3>
            </div>
            <div className="panel-body">
            <TrendChart
              data={published.slice(0, 20).map(p => ({
                label: p.text_preview?.slice(0, 15) || p.id.slice(0, 8),
                impressions: p.impressions,
                engagement: p.likes + p.replies + p.reposts,
              }))}
              xKey="label"
              lines={[
                { key: 'impressions', color: 'var(--primary)', label: 'Impressions' },
                { key: 'engagement', color: 'var(--success)', label: 'Engagement' },
              ]}
              height={250}
            />
            </div>
          </div>

          {/* Top performers */}
          <div className="panel">
            <div className="panel-header">
              <h3 className="section-title">Top Performers</h3>
            </div>
            <div className="panel-body !p-0">
            <DataTable
              columns={[
                { key: 'text_preview', label: 'Post', render: (r: ContentPost) => (
                  <span className="text-sm max-w-xs truncate block">{r.text_preview}</span>
                )},
                { key: 'impressions', label: 'Impressions', sortable: true },
                { key: 'likes', label: 'Likes', sortable: true },
                { key: 'replies', label: 'Replies', sortable: true },
                { key: 'engagement_rate', label: 'Eng Rate', sortable: true, render: (r: ContentPost) => (
                  <span className="font-mono text-xs">{(r.engagement_rate * 100).toFixed(1)}%</span>
                )},
              ]}
              data={published}
              keyField="id"
              emptyMessage="No published content yet"
            />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function generateCalendarDays(posts: ContentPost[]) {
  const days: { label: string; posts: ContentPost[] }[] = [];
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);

  for (let i = 0; i < 14; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    const dayPosts = posts.filter(p =>
      (p.published_at && p.published_at.slice(0, 10) === dateStr) ||
      (p.scheduled_for && p.scheduled_for.slice(0, 10) === dateStr)
    );
    days.push({ label: String(date.getDate()), posts: dayPosts });
  }
  return days;
}
