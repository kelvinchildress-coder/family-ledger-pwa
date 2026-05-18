import React, { useState, useEffect, useCallback } from 'react';
import { checkAuth, login, logout, getIdentity, setIdentity, getAvailableUsers } from './auth';
import { requestPushPermission, isPushEnabled, sendPushSubscriptionToServer, showLocalNotification } from './push';
import { getTasks, updateTask, completeTask, snoozeTask, getCalendarEvents, savePushSubscription, addTask } from './api';
import { getCachedTasks, setCachedTasks, addToSyncQueue, getSyncQueue, clearSyncQueue, getPref, setPref } from './storage';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_KEY || '';

async function callGemini(messages) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1500 }
      })
    }
  );
  if (!res.ok) throw new Error('Gemini API error: ' + res.status);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function PasswordGate({ onAuth }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  const handleSubmit = (e) => {
    e.preventDefault();
    if (login(password, remember)) { onAuth(); } else { setError('Incorrect password'); setTimeout(() => setError(''), 2000); }
  };
  return (
    <div className="login-page">
      <div style={{ fontSize: 64, marginBottom: 8 }}>🏠</div>
      <h1>Childress Family Ledger</h1>
      <p>Enter the family password to continue</p>
      <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input className="input" type="password" placeholder="Family password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
        {error && <p style={{ color: 'var(--danger)', textAlign: 'center', fontSize: 13 }}>{error}</p>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          Remember me on this device
        </label>
        <button className="btn btn-primary" type="submit" style={{ width: '100%' }}>Enter</button>
      </form>
    </div>
  );
}

function IdentityPicker({ onPick }) {
  const [selected, setSelected] = useState(null);
  const users = getAvailableUsers();
  return (
    <div className="login-page">
      <div style={{ fontSize: 48 }}>👤</div>
      <h1>Who are you?</h1>
      <p>Choose your profile for this session</p>
      <div className="user-select">
        {users.map(u => (
          <button key={u.name} className={'user-card' + (selected?.name === u.name ? ' selected' : '')} onClick={() => setSelected(u)}>
            <span className="user-avatar">{u.emoji}</span>
            <span className="user-name">{u.name}</span>
          </button>
        ))}
      </div>
      <button className="btn btn-primary" disabled={!selected} style={{ width: '100%' }} onClick={() => onPick(selected)}>
        Continue as {selected?.name || '...'}
      </button>
    </div>
  );
}

// ── AI Suggest Tasks Modal ──────────────────────────────────────────────────
function SuggestTasksModal({ currentUser, onClose, onAddTasks }) {
  const [messages, setMessages] = useState([
    { role: 'model', text: "Hi! I'm your task assistant. Tell me about an area of life you'd like help managing — home maintenance, gardening, business, health, etc. — and I'll suggest specific tasks you can add!" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState(new Set());
  const messagesEndRef = React.useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setLoading(true);
    const newMessages = [...messages, { role: 'user', text: userMsg }];
    setMessages(newMessages);
    try {
      const history = newMessages.map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }]
      }));
      const withSystem = [
        { role: 'user', parts: [{ text: 'You are a helpful household and life management assistant for the Childress family task manager app. Your job is to have a natural conversation to understand their needs, then suggest specific actionable tasks. When you have enough context, output a JSON block at the end of your message using this EXACT format (no other text after it): SUGGESTED_TASKS_JSON:[{"title":"Task name","details":"Description","priority":"High|Medium|Low","frequency":"Once|Daily|Weekly|Monthly|Quarterly|Annually","recurrenceInterval":0,"category":"Home|Garden|Health|Business|Finance|Family|Other"}] The recurrenceInterval is days between recurrences (0=not recurring,7=weekly,30=monthly,90=quarterly,365=annually). Include 3-8 concrete suggestions. Keep your conversational response friendly and brief BEFORE the JSON block.' }] },
        { role: 'model', parts: [{ text: 'Understood! I will have a helpful conversation and provide task suggestions in the requested JSON format.' }] },
        ...history
      ];
      const reply = await callGemini(withSystem);
      const jsonMatch = reply.match(/SUGGESTED_TASKS_JSON:([[sS]*])s*$/);
      let taskSuggestions = [];
      let displayReply = reply;
      if (jsonMatch) {
        try {
          taskSuggestions = JSON.parse(jsonMatch[1]);
          displayReply = reply.replace(/SUGGESTED_TASKS_JSON:[sS]*$/, '').trim();
          setSuggestions(taskSuggestions);
          setSelectedSuggestions(new Set(taskSuggestions.map((_, i) => i)));
        } catch(e) { console.warn('Could not parse task JSON', e); }
      }
      setMessages(prev => [...prev, { role: 'model', text: displayReply || 'Here are my suggestions!' }]);
    } catch(e) {
      setMessages(prev => [...prev, { role: 'model', text: 'Sorry, I had trouble connecting. Please try again.' }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const toggleSuggestion = (idx) => {
    setSelectedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const addSelected = () => {
    const toAdd = suggestions
      .filter((_, i) => selectedSuggestions.has(i))
      .map((s, i) => ({
        id: 'task_' + Date.now() + '_' + i,
        title: s.title, details: s.details || '',
        assignedTo: currentUser?.name || 'All', priority: s.priority || 'Medium',
        frequency: s.frequency || 'Once', recurrenceInterval: s.recurrenceInterval || 0,
        category: s.category || 'General', deadline: null,
        visibility: 'public', createdBy: currentUser?.name || 'Unknown',
      }));
    onAddTasks(toAdd);
    onClose();
  };

  const prioColor = (p) => p === 'High' ? { bg: 'rgba(239,68,68,0.2)', fg: '#ef4444' } : p === 'Medium' ? { bg: 'rgba(245,158,11,0.2)', fg: '#f59e0b' } : { bg: 'rgba(34,197,94,0.2)', fg: '#22c55e' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1100 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, height: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17 }}>✨ AI Task Suggestions</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Describe what you need help with</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: m.role === 'user' ? 'var(--primary)' : 'var(--surface-2, #1e1e2e)', color: m.role === 'user' ? 'white' : 'var(--text)', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'var(--surface-2, #1e1e2e)', color: 'var(--text-muted)', fontSize: 14 }}>Thinking...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        {suggestions.length > 0 && (
          <div style={{ maxHeight: 230, overflowY: 'auto', borderTop: '1px solid var(--border)', padding: '10px 14px', flexShrink: 0, background: 'var(--surface-2, #1a1a2e)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>SUGGESTED ({selectedSuggestions.size} selected)</div>
              <button className="btn btn-primary btn-sm" onClick={addSelected} disabled={selectedSuggestions.size === 0}>Add {selectedSuggestions.size}</button>
            </div>
            {suggestions.map((s, i) => {
              const pc = prioColor(s.priority);
              return (
                <div key={i} onClick={() => toggleSuggestion(i)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, background: selectedSuggestions.has(i) ? 'rgba(99,102,241,0.12)' : 'transparent', border: '1px solid ' + (selectedSuggestions.has(i) ? 'var(--primary)' : 'var(--border)'), marginBottom: 6, cursor: 'pointer' }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid ' + (selectedSuggestions.has(i) ? 'var(--primary)' : 'var(--text-muted)'), background: selectedSuggestions.has(i) ? 'var(--primary)' : 'transparent', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11 }}>
                    {selectedSuggestions.has(i) ? '✓' : ''}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.title}</div>
                    {s.details && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.details}</div>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {s.priority && <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: pc.bg, color: pc.fg }}>{s.priority}</span>}
                      {s.frequency && s.frequency !== 'Once' && <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: 'var(--primary)' }}>🔁 {s.frequency}</span>}
                      {s.category && <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(120,120,120,0.15)', color: 'var(--text-muted)' }}>{s.category}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <textarea className="input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Describe what you need help with..." rows={2} style={{ flex: 1, resize: 'none', fontSize: 14 }} disabled={loading} />
          <button className="btn btn-primary" onClick={sendMessage} disabled={loading || !input.trim()} style={{ padding: '0 16px', alignSelf: 'flex-end', height: 40 }}>➤</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Task Modal ─────────────────────────────────────────────────────────
function AddTaskModal({ currentUser, onClose, onAdd, onOpenSuggest }) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [assignedTo, setAssignedTo] = useState(currentUser?.name || 'All');
  const [priority, setPriority] = useState('Medium');
  const [deadline, setDeadline] = useState('');
  const [frequency, setFrequency] = useState('Once');
  const [visibility, setVisibility] = useState('public');
  const [saving, setSaving] = useState(false);
  const users = getAvailableUsers();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const freqDays = { Once: 0, Daily: 1, Weekly: 7, Monthly: 30, Quarterly: 90, Annually: 365 };
    const task = {
      id: 'task_' + Date.now(), title: title.trim(), details: details.trim(),
      assignedTo, priority, deadline: deadline || null, frequency,
      recurrenceInterval: freqDays[frequency] || 0,
      category: 'General', visibility,
      createdBy: currentUser?.name || 'Unknown'
    };
    try { await addTask(task); } catch (e) { addToSyncQueue({ type: 'add', task }); }
    onAdd(task); setSaving(false); onClose();
  };

  const visOpts = [
    { key: 'public', icon: '🌐', label: 'Public', desc: 'Anyone can see & complete' },
    { key: 'personal', icon: '👁', label: 'Personal', desc: 'Anyone sees, only you complete' },
    { key: 'private', icon: '🔒', label: 'Private', desc: 'Only you can see & complete' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', borderRadius: '16px 16px 0 0', padding: 24, width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Add Task</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {onOpenSuggest && <button onClick={onOpenSuggest} className="btn btn-secondary btn-sm" style={{ fontSize: 13 }}>✨ Suggest</button>}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
          </div>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Title *</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to be done?" autoFocus required />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Details</label>
            <textarea className="input" value={details} onChange={e => setDetails(e.target.value)} placeholder="Optional details..." rows={2} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Assign To</label>
              <select className="input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="All">Everyone</option>
                {users.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Priority</label>
              <select className="input" value={priority} onChange={e => setPriority(e.target.value)}>
                <option>High</option><option>Medium</option><option>Low</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Frequency</label>
              <select className="input" value={frequency} onChange={e => setFrequency(e.target.value)}>
                <option>Once</option><option>Daily</option><option>Weekly</option><option>Monthly</option><option>Quarterly</option><option>Annually</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Due Date</label>
              <input className="input" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Visibility</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {visOpts.map(v => (
                <button key={v.key} type="button" onClick={() => setVisibility(v.key)} style={{ padding: '8px 4px', borderRadius: 8, border: '2px solid ' + (visibility === v.key ? 'var(--primary)' : 'var(--border)'), background: visibility === v.key ? 'rgba(99,102,241,0.12)' : 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 18 }}>{v.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: visibility === v.key ? 'var(--primary)' : 'var(--text)' }}>{v.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>{v.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving || !title.trim()} style={{ width: '100%', marginTop: 4 }}>{saving ? 'Adding...' : 'Add Task'}</button>
        </form>
      </div>
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────
function TaskCard({ task, currentUser, onComplete, onSnooze }) {
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !task.lastCompleted;
  const isAssignedToMe = task.assignedTo === currentUser?.name || task.assignedTo === 'All';
  const canComplete = task.visibility === 'public' || ((task.visibility === 'personal' || task.visibility === 'private') && isAssignedToMe);
  const getPriorityClass = (p) => { if (p === 'High') return 'badge-high'; if (p === 'Medium') return 'badge-medium'; return 'badge-low'; };
  const visIcon = task.visibility === 'private' ? ' 🔒' : task.visibility === 'personal' ? ' 👁' : '';
  return (
    <div className={'task-card' + (isOverdue ? ' overdue' : '')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div className="task-title">{task.title}{visIcon}</div>
          {task.details && <div className="task-details">{task.details}</div>}
          <div className="task-meta" style={{ marginTop: 8 }}>
            {task.priority && <span className={'badge ' + getPriorityClass(task.priority)}>{task.priority}</span>}
            {task.frequency && task.frequency !== 'Once' && <span>🔁 {task.frequency}</span>}
            {task.deadline && <span>📅 {new Date(task.deadline).toLocaleDateString()}</span>}
            {task.assignedTo && <span>👤 {task.assignedTo}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          {canComplete && <button className="btn btn-primary btn-sm" onClick={() => onComplete(task.id)}>Done</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => onSnooze(task.id, 24)}>Snooze</button>
        </div>
      </div>
      {isOverdue && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>⚠ Overdue</div>}
    </div>
  );
}

// ── Tasks Tab ─────────────────────────────────────────────────────────────
function TasksTab({ tasks, currentUser, onComplete, onSnooze, syncing }) {
  const [filter, setFilter] = useState('mine');
  const filteredTasks = tasks.filter(t => {
    if (t.visibility === 'private' && t.assignedTo !== currentUser?.name) return false;
    if (filter === 'mine') return t.assignedTo === currentUser?.name || t.assignedTo === 'All';
    if (filter === 'overdue') return t.deadline && new Date(t.deadline) < new Date() && !t.lastCompleted;
    return true;
  });
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto' }}>
        {['mine', 'all', 'overdue'].map(f => (
          <button key={f} className={'btn btn-sm ' + (filter === f ? 'btn-primary' : 'btn-secondary')} onClick={() => setFilter(f)}>
            {f === 'mine' ? 'My Tasks' : f === 'all' ? 'All Tasks' : 'Overdue'}
          </button>
        ))}
      </div>
      {syncing && <div className="sync-indicator"><div className="spinner"/><span>Syncing...</span></div>}
      {filteredTasks.length === 0 ? (
        <div className="empty-state"><div className="icon">✅</div><h3>All caught up!</h3><p>No tasks here right now</p></div>
      ) : filteredTasks.map(t => <TaskCard key={t.id} task={t} currentUser={currentUser} onComplete={onComplete} onSnooze={onSnooze} />)}
    </div>
  );
}

// ── Calendar Tab ──────────────────────────────────────────────────────────
function CalendarTab({ currentUser }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const openGoogleCalendar = () => window.open('https://calendar.google.com', '_blank');
  useEffect(() => {
    if (!currentUser?.email) { setLoading(false); return; }
    getCalendarEvents(currentUser.email).then(data => { setEvents(data.events || []); setLoading(false); }).catch(() => { setError(true); setLoading(false); });
  }, [currentUser]);
  return (
    <div>
      <div style={{ padding: '16px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>TODAY</div><div style={{ fontSize: 16, fontWeight: 700 }}>{today}</div></div>
        <button className="btn btn-secondary btn-sm" onClick={openGoogleCalendar}>Open Calendar</button>
      </div>
      {loading ? (<div className="sync-indicator" style={{ padding: 24, justifyContent: 'center' }}><div className="spinner"/><span>Loading calendar...</span></div>)
      : error ? (<div className="empty-state"><div className="icon">📅</div><h3>Calendar not connected</h3><button className="btn btn-secondary" onClick={openGoogleCalendar}>Open Google Calendar</button></div>)
      : events.length === 0 ? (<div className="empty-state"><div className="icon">🎉</div><h3>Nothing scheduled today!</h3><p>Enjoy your free day</p></div>)
      : (<div>{events.map((ev, i) => (<div key={i} className="task-card"><div className="task-title">{ev.summary}</div><div className="task-meta">{ev.start && <span>🕐 {new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</div></div>))}</div>)}
    </div>
  );
}

// ── Details Tab ───────────────────────────────────────────────────────────
const DETAILS_KEY = 'fl_details_v2';
function loadDetails() { try { return JSON.parse(localStorage.getItem(DETAILS_KEY) || '[]'); } catch { return []; } }
function saveDetailsLocal(tabs) { localStorage.setItem(DETAILS_KEY, JSON.stringify(tabs)); }

function DetailsTab() {
  const [tabs, setTabs] = useState(() => loadDetails());
  const [activeTab, setActiveTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [newTabName, setNewTabName] = useState('');
  const [addingTab, setAddingTab] = useState(false);

  const updateContent = (content) => {
    const next = tabs.map((t, i) => i === activeTab ? { ...t, content } : t);
    setTabs(next); saveDetailsLocal(next);
  };
  const addTab = () => {
    if (!newTabName.trim()) return;
    const next = [...tabs, { name: newTabName.trim(), content: '' }];
    setTabs(next); saveDetailsLocal(next); setActiveTab(next.length - 1); setNewTabName(''); setAddingTab(false);
  };
  const removeTab = (i) => {
    const next = tabs.filter((_, idx) => idx !== i);
    setTabs(next); saveDetailsLocal(next); setActiveTab(Math.min(activeTab, next.length - 1));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 4, padding: '8px 16px', overflowX: 'auto', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {tabs.map((t, i) => (
          <button key={i} className={'btn btn-sm ' + (i === activeTab ? 'btn-primary' : 'btn-secondary')} onClick={() => setActiveTab(i)} style={{ whiteSpace: 'nowrap' }}>{t.name}</button>
        ))}
        <button className="btn btn-sm btn-secondary" onClick={() => setAddingTab(true)}>+ Tab</button>
      </div>
      {addingTab && (
        <div style={{ padding: '8px 16px', display: 'flex', gap: 8 }}>
          <input className="input" value={newTabName} onChange={e => setNewTabName(e.target.value)} placeholder="Tab name" onKeyDown={e => e.key === 'Enter' && addTab()} autoFocus style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={addTab}>Add</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setAddingTab(false)}>Cancel</button>
        </div>
      )}
      {tabs.length === 0 ? (
        <div className="empty-state"><div className="icon">📋</div><h3>No details yet</h3><p>Add a tab to get started</p></div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{tabs[activeTab]?.name}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(e => !e)}>{editing ? 'Done' : 'Edit'}</button>
              <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeTab(activeTab)}>Remove</button>
            </div>
          </div>
          {editing ? (
            <textarea className="input" style={{ flex: 1, resize: 'none', minHeight: 200 }} value={tabs[activeTab]?.content || ''} onChange={e => updateContent(e.target.value)} />
          ) : (
            <div style={{ flex: 1, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, color: tabs[activeTab]?.content ? 'var(--text)' : 'var(--text-muted)' }}>
              {tabs[activeTab]?.content || 'Nothing here yet. Tap Edit to add content.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────
function SettingsTab({ currentUser, onLogout }) {
  const [pushEnabled, setPushEnabled] = useState(isPushEnabled());
  const handlePushToggle = async () => {
    if (pushEnabled) { setPushEnabled(false); return; }
    const ok = await requestPushPermission();
    if (ok) { const sub = await sendPushSubscriptionToServer(currentUser?.name); setPushEnabled(!!sub); }
  };
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="task-card">
        <div className="task-title" style={{ marginBottom: 4 }}>Push Notifications</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>Get notified about task reminders</div>
        <button className={'btn btn-sm ' + (pushEnabled ? 'btn-secondary' : 'btn-primary')} onClick={handlePushToggle}>
          {pushEnabled ? '🔔 Enabled — Tap to disable' : '🔕 Enable Notifications'}
        </button>
      </div>
      <div className="task-card">
        <div className="task-title" style={{ marginBottom: 4 }}>Profile</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Signed in as {currentUser?.emoji} {currentUser?.name}</div>
      </div>
      <button className="btn btn-secondary" style={{ width: '100%', color: 'var(--danger)' }} onClick={onLogout}>Sign Out</button>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(() => checkAuth());
  const [identity, setIdentityState] = useState(() => getIdentity());
  const [tasks, setTasks] = useState(() => getCachedTasks());
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [activeTab, setActiveTab] = useState('tasks');
  const [showAddTask, setShowAddTask] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);

  const syncTasks = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const queue = getSyncQueue();
      if (queue.length > 0) {
        for (const item of queue) {
          try {
            if (item.type === 'add') await addTask(item.task);
            else if (item.type === 'complete') await completeTask(item.taskId, item.userId);
            else if (item.type === 'snooze') await snoozeTask(item.taskId, item.hours);
          } catch (e) { console.warn('Sync item failed:', e); }
        }
        clearSyncQueue();
      }
      const data = await getTasks();
      if (data.tasks) { setTasks(data.tasks); setCachedTasks(data.tasks); setLastSync(new Date()); }
    } catch (e) { console.warn('Sync failed, using cached data:', e); }
    setSyncing(false);
  }, [syncing]);

  useEffect(() => {
    if (!authed || !identity) return;
    syncTasks();
    const interval = setInterval(syncTasks, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [authed, identity]);

  useEffect(() => {
    const saved = getPref('activeTab');
    if (saved) setActiveTab(saved);
  }, []);

  const handleComplete = async (taskId) => {
    const userId = identity?.name || 'unknown';
    try { await completeTask(taskId, userId); await showLocalNotification('Task Complete!', 'Great job!'); syncTasks(); }
    catch (e) { addToSyncQueue({ type: 'complete', taskId, userId }); }
  };

  const handleSnooze = async (taskId, hours) => {
    try { await snoozeTask(taskId, hours); }
    catch (e) { addToSyncQueue({ type: 'snooze', taskId, hours }); }
  };

  const handleAddTask = (task) => {
    setTasks(prev => { const next = [...prev, task]; setCachedTasks(next); return next; });
  };

  const handleAddMultipleTasks = async (taskArray) => {
    for (const task of taskArray) {
      try { await addTask(task); } catch (e) { addToSyncQueue({ type: 'add', task }); }
    }
    setTasks(prev => { const next = [...prev, ...taskArray]; setCachedTasks(next); return next; });
    setTimeout(() => syncTasks(), 1500);
  };

  const handleTabChange = (tab) => { setActiveTab(tab); setPref('activeTab', tab); };
  const handleLogout = () => { logout(); setAuthed(false); setIdentityState(null); };

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;
  if (!identity) return <IdentityPicker onPick={(u) => { setIdentity(u); setIdentityState(u); }} />;

  const tabs = [
    { id: 'tasks', label: 'Tasks', icon: '✅' },
    { id: 'calendar', label: 'Today', icon: '📅' },
    { id: 'details', label: 'Details', icon: '📋' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Family Ledger</h1>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {identity.emoji} {identity.name} {lastSync ? 'synced ' + lastSync.toLocaleTimeString() : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {syncing && <div className="spinner"/>}
          <button className="btn btn-secondary btn-sm" onClick={syncTasks} disabled={syncing}>Sync</button>
        </div>
      </header>
      <div className="content">
        {activeTab === 'tasks' && <TasksTab tasks={tasks} currentUser={identity} onComplete={handleComplete} onSnooze={handleSnooze} syncing={syncing} />}
        {activeTab === 'calendar' && <CalendarTab currentUser={identity} />}
        {activeTab === 'details' && <DetailsTab />}
        {activeTab === 'settings' && <SettingsTab currentUser={identity} onLogout={handleLogout} />}
      </div>
      {activeTab === 'tasks' && (
        <button onClick={() => setShowAddTask(true)} style={{ position: 'fixed', bottom: 80, right: 20, width: 56, height: 56, borderRadius: '50%', background: 'var(--primary)', color: 'white', border: 'none', fontSize: 28, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }} aria-label="Add task">+</button>
      )}
      {showAddTask && (
        <AddTaskModal currentUser={identity} onClose={() => setShowAddTask(false)} onAdd={handleAddTask} onOpenSuggest={() => { setShowAddTask(false); setShowSuggest(true); }} />
      )}
      {showSuggest && (
        <SuggestTasksModal currentUser={identity} onClose={() => setShowSuggest(false)} onAddTasks={handleAddMultipleTasks} />
      )}
      <nav className="tab-bar">
        {tabs.map(tab => (
          <button key={tab.id} className={'tab-item' + (activeTab === tab.id ? ' active' : '')} onClick={() => handleTabChange(tab.id)}>
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
