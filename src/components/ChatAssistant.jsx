import { useEffect, useId, useMemo, useState } from 'react';

// UI-only preview of a natural-language sensor assistant. Nothing here talks
// to a real backend yet - conversations are local component state, seeded
// with a couple of illustrative examples grounded in this dashboard's actual
// KPI/sensor vocabulary so the shape of a future integration is obvious.

const EXAMPLE_PROMPTS = [
  'What is the current Kiln Feed Rate?',
  'Show WHRS Power Generation trend for the last 8 hours',
  'Is Preheater Fan-1 reporting normally?',
  'Average HP Steam Pressure for this shift',
];

const SEED_CONVERSATIONS = [
  {
    id: 'seed-1',
    title: 'Current Kiln Feed Rate',
    timeAgo: '1h ago',
    messages: [
      { role: 'user', text: 'What is the current Kiln Feed Rate?' },
      { role: 'system', text: 'Assistant backend is not connected yet — this thread is a UI preview only.' },
    ],
  },
  {
    id: 'seed-2',
    title: 'Min, max and average HP steam pressure',
    timeAgo: '5h ago',
    messages: [
      { role: 'user', text: 'Min, max and average HP Steam Pressure for this shift' },
      { role: 'system', text: 'Assistant backend is not connected yet — this thread is a UI preview only.' },
    ],
  },
  {
    id: 'seed-3',
    title: 'Preheater Fan-1 status',
    timeAgo: '1d ago',
    messages: [
      { role: 'user', text: 'Is Preheater Fan-1 reporting normally?' },
      { role: 'system', text: 'Assistant backend is not connected yet — this thread is a UI preview only.' },
    ],
  },
];

function timeAgoLabel() {
  return 'just now';
}

export default function ChatAssistant({ open, onClose }) {
  const [conversations, setConversations] = useState(SEED_CONVERSATIONS);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState('');
  const dialogId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) || null, [conversations, activeId]);

  function startNewChat() {
    setActiveId(null);
    setInput('');
  }

  function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (active) {
      setConversations((prev) => prev.map((c) => (c.id === active.id ? { ...c, messages: [...c.messages, { role: 'user', text: trimmed }] } : c)));
    } else {
      const id = `local-${Date.now()}`;
      const newConversation = {
        id,
        title: trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed,
        timeAgo: timeAgoLabel(),
        messages: [
          { role: 'user', text: trimmed },
          { role: 'system', text: 'Assistant backend is not connected yet — this thread is a UI preview only.' },
        ],
      };
      setConversations((prev) => [newConversation, ...prev]);
      setActiveId(id);
    }
    setInput('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <>
      <div className={`chat-backdrop ${open ? 'chat-backdrop-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`chat-panel ${open ? 'chat-panel-open' : ''}`} role="dialog" aria-modal="true" aria-label="Sensor assistant" aria-hidden={!open} id={dialogId}>
        <div className="chat-panel-header">
          <div className="chat-panel-identity">
            <span className="chat-avatar">P</span>
            <div>
              <div className="chat-panel-title">Prakriti · SiteWise Assistant</div>
              <div className="chat-panel-subtitle">Natural-language plant sensor queries</div>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-small" onClick={onClose} aria-label="Close assistant">
            Close
          </button>
        </div>

        <div className="chat-panel-body">
          <div className="chat-history-pane">
            <button type="button" className="btn btn-primary chat-new-btn" onClick={startNewChat}>
              + New chat
            </button>
            <div className="chat-history-label">Recent</div>
            <div className="chat-history-list">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chat-history-item ${active?.id === c.id ? 'chat-history-item-active' : ''}`}
                  onClick={() => setActiveId(c.id)}
                >
                  <div className="chat-history-item-title">{c.title}</div>
                  <div className="chat-history-item-meta">
                    {c.messages.length} msg · {c.timeAgo}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="chat-conversation-pane">
            {!active && (
              <div className="chat-empty-state">
                <span className="chat-avatar chat-avatar-lg">P</span>
                <div className="chat-empty-title">Ask about a plant sensor</div>
                <div className="chat-empty-subtitle">Query sensor data in plain English. Try an example below.</div>
                <div className="chat-example-chips">
                  {EXAMPLE_PROMPTS.map((p) => (
                    <button key={p} type="button" className="chat-example-chip" onClick={() => setInput(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {active && (
              <div className="chat-messages">
                {active.messages.map((m, i) => (
                  <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>
                    {m.text}
                  </div>
                ))}
              </div>
            )}

            <form className="chat-composer" onSubmit={handleSubmit}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. what is the current kiln feed rate?"
                aria-label="Message the assistant"
              />
              <button type="submit" className="btn btn-primary chat-send-btn" aria-label="Send message" disabled={!input.trim()}>
                Send
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
