'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, Send, Settings2, Shuffle } from 'lucide-react';

type Mode = 'orchestrator' | 'agent_bridge';

interface MissionMessage {
  id: number;
  conversation_id: string;
  from_agent: string;
  to_agent: string | null;
  content: string;
  message_type: 'text' | 'system';
  metadata: Record<string, unknown> | null;
  read_at: number | null;
  created_at: number;
}

interface MissionData {
  conversation_id: string;
  messages: MissionMessage[];
  agents: string[];
}

interface MissionConversation {
  conversation_id: string;
  last_message_at: number;
  message_count: number;
  from_agent?: string;
  to_agent?: string;
}

interface HistoryData {
  conversations: MissionConversation[];
  agents: string[];
}

export function MissionControlChat() {
  const [mode, setMode] = useState<Mode>('orchestrator');
  const [fromAgent, setFromAgent] = useState('');
  const [toAgent, setToAgent] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [messages, setMessages] = useState<MissionMessage[]>([]);
  const [conversations, setConversations] = useState<MissionConversation[]>([]);
  const [conversationId, setConversationId] = useState<string>('');
  const [agents, setAgents] = useState<string[]>([]);
  const [copyingId, setCopyingId] = useState<number | null>(null);

  // In agent-bridge mode the conversation id and the from/to agents mirror each
  // other: a newly chosen a2a conversation sets the agents, otherwise the
  // agents pick the conversation. Reconciled during render, not in effects.
  const [bridgeSync, setBridgeSync] = useState({ mode, fromAgent, toAgent, conversationId });
  if (
    bridgeSync.mode !== mode
    || bridgeSync.fromAgent !== fromAgent
    || bridgeSync.toAgent !== toAgent
    || bridgeSync.conversationId !== conversationId
  ) {
    let nextFrom = fromAgent;
    let nextTo = toAgent;
    let nextConversationId = conversationId;
    if (mode === 'agent_bridge') {
      if (bridgeSync.conversationId !== conversationId && conversationId.startsWith('mc:a2a:')) {
        const [, , parsedFrom, parsedTo] = conversationId.split(':');
        if (parsedFrom) nextFrom = parsedFrom;
        if (parsedTo) nextTo = parsedTo;
      } else if (fromAgent && toAgent && fromAgent !== toAgent) {
        nextConversationId = `mc:a2a:${fromAgent}:${toAgent}`;
      }
    }
    setBridgeSync({ mode, fromAgent: nextFrom, toAgent: nextTo, conversationId: nextConversationId });
    if (nextFrom !== fromAgent) setFromAgent(nextFrom);
    if (nextTo !== toAgent) setToAgent(nextTo);
    if (nextConversationId !== conversationId) setConversationId(nextConversationId);
  }

  // Show loading states whenever the inputs of a fetch change (and on mount).
  const historyKey = `${mode}\u0000${conversationId}`;
  const [historyLoadingKey, setHistoryLoadingKey] = useState<string | null>(null);
  if (historyLoadingKey !== historyKey) {
    setHistoryLoadingKey(historyKey);
    setHistoryLoading(true);
  }
  const messagesKey = `${mode}\u0000${conversationId}\u0000${fromAgent}\u0000${toAgent}`;
  const [messagesLoadingKey, setMessagesLoadingKey] = useState<string | null>(null);
  if (messagesLoadingKey !== messagesKey) {
    setMessagesLoadingKey(messagesKey);
    setLoading(true);
  }

  const fetchHistory = useCallback(() => {
    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('list', 'true');
    return fetch(`/api/mission-control/chat?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as HistoryData;
        const nextConversations = Array.isArray(data.conversations) ? data.conversations : [];
        setConversations(nextConversations);
        if (Array.isArray(data.agents) && data.agents.length > 0) {
          setAgents(data.agents);
          setFromAgent((prev) => (prev && data.agents.includes(prev) ? prev : data.agents[0]));
          setToAgent((prev) => {
            if (prev && data.agents.includes(prev) && prev !== data.agents[0]) return prev;
            const fallback = data.agents.find((a) => a !== data.agents[0]);
            return fallback ?? data.agents[0];
          });
        }
        if (nextConversations.length > 0) {
          const stillExists = nextConversations.some((c) => c.conversation_id === conversationId);
          if (!conversationId || !stillExists) {
            setConversationId(nextConversations[0].conversation_id);
          }
        } else {
          setConversationId('');
        }
      })
      .finally(() => {
        setHistoryLoading(false);
      });
  }, [mode, conversationId]);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    return fetchHistory();
  }, [fetchHistory]);

  const fetchMessages = useCallback(() => {
    const params = new URLSearchParams();
    params.set('mode', mode);
    if (conversationId) params.set('conversation_id', conversationId);
    if (mode === 'agent_bridge') {
      params.set('from_agent', fromAgent);
      params.set('to_agent', toAgent);
    }
    return fetch(`/api/mission-control/chat?${params.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as MissionData;
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        if (Array.isArray(data.agents) && data.agents.length > 0) {
          setAgents(data.agents);
          setFromAgent((prev) => (prev && data.agents.includes(prev) ? prev : data.agents[0]));
          setToAgent((prev) => {
            if (prev && data.agents.includes(prev) && prev !== data.agents[0]) return prev;
            const fallback = data.agents.find((a) => a !== data.agents[0]);
            return fallback ?? data.agents[0];
          });
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [mode, conversationId, fromAgent, toAgent]);

  const loadMessages = useCallback(() => {
    setLoading(true);
    return fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    fetchHistory().catch(() => {});
  }, [fetchHistory]);

  useEffect(() => {
    fetchMessages().catch(() => {});
    const timer = setInterval(() => {
      loadMessages().catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [fetchMessages, loadMessages]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending) return;
    if (mode === 'agent_bridge' && (!fromAgent || !toAgent || fromAgent === toAgent)) return;
    setSending(true);
    try {
      const payload: Record<string, string> = { mode, content };
      if (conversationId) payload.conversation_id = conversationId;
      if (mode === 'agent_bridge') {
        payload.from_agent = fromAgent;
        payload.to_agent = toAgent;
      }
      const res = await fetch('/api/mission-control/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      setInput('');
      await Promise.all([loadMessages(), loadHistory()]);
    } finally {
      setSending(false);
    }
  }

  async function copyMessage(messageId: number, text: string) {
    if (!text) return;
    setCopyingId(messageId);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // no-op
    } finally {
      setTimeout(() => setCopyingId(null), 500);
    }
  }

  function labelConversation(conv: MissionConversation): string {
    if (conv.conversation_id === 'mc:orchestrator') return 'orchestrator';
    if (conv.from_agent && conv.to_agent) return `${conv.from_agent} -> ${conv.to_agent}`;
    return conv.conversation_id;
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Settings2 size={14} className="text-primary" />
          Mission Control (Admin)
        </h3>
        <button className="btn btn-ghost btn-sm" onClick={() => { loadHistory().catch(() => {}); loadMessages().catch(() => {}); }}>
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="px-2 py-1 rounded-md border border-border bg-background text-xs"
        >
          <option value="orchestrator">orchestrator</option>
          <option value="agent_bridge">agent bridge</option>
        </select>
        {mode === 'agent_bridge' && (
          <>
            <select
              value={fromAgent}
              onChange={(e) => setFromAgent(e.target.value)}
              className="px-2 py-1 rounded-md border border-border bg-background text-xs"
              disabled={agents.length === 0}
            >
              {agents.map((agent) => (
                <option key={`from-${agent}`} value={agent}>{agent}</option>
              ))}
            </select>
            <Shuffle size={12} className="text-muted-foreground" />
            <select
              value={toAgent}
              onChange={(e) => setToAgent(e.target.value)}
              className="px-2 py-1 rounded-md border border-border bg-background text-xs"
              disabled={agents.length === 0}
            >
              {agents.map((agent) => (
                <option key={`to-${agent}`} value={agent}>{agent}</option>
              ))}
            </select>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground shrink-0">History</label>
        <select
          value={conversationId}
          onChange={(e) => setConversationId(e.target.value)}
          className="px-2 py-1 rounded-md border border-border bg-background text-xs flex-1"
          disabled={historyLoading || conversations.length === 0}
        >
          {conversations.length === 0 ? (
            <option value="">{historyLoading ? 'Loading...' : 'No history yet'}</option>
          ) : (
            conversations.map((conv) => (
              <option key={conv.conversation_id} value={conv.conversation_id}>
                {labelConversation(conv)} · {conv.message_count}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="rounded-lg border border-border/40 bg-muted/10 p-3 h-64 overflow-y-auto space-y-2">
        {loading ? (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" /> Loading...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-xs text-muted-foreground">No messages yet.</div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="text-xs">
              <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-2">
                <span>
                  {new Date(message.created_at * 1000).toLocaleTimeString()} · {message.from_agent}{message.to_agent ? ` -> ${message.to_agent}` : ''}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm px-2 py-0.5 h-auto text-[10px]"
                    onClick={() => copyMessage(message.id, message.content)}
                  >
                    <Copy size={10} /> {copyingId === message.id ? 'copied' : 'copy'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm px-2 py-0.5 h-auto text-[10px]"
                    onClick={() => setInput(message.content)}
                  >
                    resend
                  </button>
                </span>
              </div>
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'orchestrator' ? 'Write to orchestrator...' : `Bridge ${fromAgent} -> ${toAgent}...`}
          rows={2}
          className="flex-1 resize-none bg-muted/30 rounded-lg px-3 py-2 text-sm border border-border/30 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending || (mode === 'agent_bridge' && (!fromAgent || !toAgent || fromAgent === toAgent))}
          className="btn btn-primary btn-sm flex items-center gap-1 disabled:opacity-50"
        >
          {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Send
        </button>
      </div>
    </div>
  );
}
