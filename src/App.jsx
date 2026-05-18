import React, { useState, useEffect, useCallback } from 'react';
import { checkAuth, login, logout, getIdentity, setIdentity, getAvailableUsers } from './auth';
import { requestPushPermission, isPushEnabled, sendPushSubscriptionToServer, showLocalNotification } from './push';
import { getTasks, updateTask, completeTask, snoozeTask, getCalendarEvents, savePushSubscription, addTask, submitTaskFeedback, saveRecurringSchedule, getSuggestedTasks } from './api';
import { getCachedTasks, setCachedTasks, addToSyncQueue, getSyncQueue, clearSyncQueue, getPref, setPref } from './storage';

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

function AddTaskModal({ currentUser, onClose, onAdd }) {
const [title, setTitle] = useState('');
const [details, setDetails] = useState('');
const [assignedTo, setAssignedTo] = useState(currentUser?.name || 'All');
const [priority, setPriority] = useState('Medium');
const [deadline, setDeadline] = useState('');
const [saving, setSaving] = useState(false);
const users = getAvailableUsers();
const handleSubmit = async (e) => {
e.preventDefault();
if (!title.trim()) return;
setSaving(true);
const task = { id: 'task_' + Date.now(), title: title.trim(), details: details.trim(), assignedTo, priority, deadline: deadline || null, frequency: 'Once', category: 'General', createdBy: currentUser?.name || 'Unknown' };
try { await addTask(task); } catch (e) { addToSyncQueue({ type: 'add', task }); }
onAdd(task);
setSaving(false);
onClose();
};
return (
<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
<div style={{ background: 'var(--surface)', borderRadius: '16px 16px 0 0', padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
<h2 style={{ fontSize: 18, margin: 0 }}>Add Task</h2>
<button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>x</button>
</div>
<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
<div>
<label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Title</label>
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
<div>
<label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Due Date</label>
<input className="input" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
</div>
<button className="btn btn-primary" type="submit" disabled={saving || !title.trim()} style={{ width: '100%', marginTop: 4 }}>{saving ? 'Adding...' : 'Add Task'}</button>
</form>
</div>
</div>
);
}

function TaskCard({ task, currentUser, onComplete, onSnooze }) {
const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !task.lastCompleted;
const isAssignedToMe = task.assignedTo === currentUser?.name || task.assignedTo === 'All';
const getPriorityClass = (p) => { if (p === 'High') return 'badge-high'; if (p === 'Medium') return 'badge-medium'; return 'badge-low'; };
return (
<div className={'task-card' + (isOverdue ? ' overdue' : '')}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
<div style={{ flex: 1 }}>
<div className="task-title">{task.title}</div>
{task.details && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{task.details}</p>}
<div className="task-meta" style={{ marginTop: 8 }}>
{task.priority && <span className={'badge ' + getPriorityClass(task.priority)}>{task.priority}</span>}
{task.category && <span style={{ color: 'var(--text-muted)' }}>#{task.category}</span>}
{task.frequency && <span>🔄 {task.frequency}</span>}
{task.deadline && <span>📅 {new Date(task.deadline).toLocaleDateString()}</span>}
{task.assignedTo && <span>👤 {task.assignedTo}</span>}
</div>
</div>
<div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
{isAssignedToMe && (<button className="btn btn-primary btn-sm" onClick={() => onComplete(task.id)}>Done</button>)}
<button className="btn btn-secondary btn-sm" onClick={() => onSnooze(task.id, 24)}>Snooze</button>
</div>
</div>
{task.lastCompleted && (<div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Last done: {new Date(task.lastCompleted).toLocaleDateString()}</div>)}
</div>
);
}

function TasksTab({ tasks, currentUser, onComplete, onSnooze, syncing }) {
const [filter, setFilter] = useState('mine');
const filteredTasks = tasks.filter(t => {
if (filter === 'mine') return t.assignedTo === currentUser?.name || t.assignedTo === 'All';
if (filter === 'all') return true;
if (filter === 'overdue') return t.deadline && new Date(t.deadline) < new Date();
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
{syncing && (<div className="sync-indicator"><div className="spinner" /><span>Syncing...</span></div>)}
{filteredTasks.length === 0 ? (
<div className="empty-state"><div className="icon">✅</div><h3>All caught up!</h3><p>No tasks here right now</p></div>
) : (filteredTasks.map(t => (<TaskCard key={t.id} task={t} currentUser={currentUser} onComplete={onComplete} onSnooze={onSnooze} />)))}
</div>
);
}

function CalendarTab({ currentUser }) {
const [events, setEvents] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
useEffect(() => {
if (!currentUser?.email) { setLoading(false); return; }
getCalendarEvents(currentUser.email).then(data => { setEvents(data.events || []); setLoading(false); }).catch(e => { setError(e.message); setLoading(false); });
}, [currentUser]);
const openGoogleCalendar = () => window.open('https://calendar.google.com/calendar/r/day', '_blank');
return (
<div>
<div style={{ padding: '16px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<div><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>TODAY</div><div style={{ fontSize: 16, fontWeight: 700 }}>{today}</div></div>
<button className="btn btn-secondary btn-sm" onClick={openGoogleCalendar}>Open Calendar</button>
</div>
{loading ? (<div className="sync-indicator" style={{ padding: 24, justifyContent: 'center' }}><div className="spinner" /><span>Loading calendar...</span></div>)
: error ? (<div className="empty-state"><div className="icon">📅</div><h3>Calendar not connected</h3><button className="btn btn-secondary" onClick={openGoogleCalendar}>Open Google Calendar</button></div>)
: events.length === 0 ? (<div className="empty-state"><div className="icon">🎉</div><h3>Nothing scheduled today!</h3><p>Enjoy your free day</p></div>)
: (<div>{events.map((e, i) => (<div key={i} className="calendar-event"><div className="event-time">{e.start ? new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'All day'}</div><div><div className="event-title">{e.title || e.summary}</div>{e.location && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>📍 {e.location}</div>}</div></div>))}</div>)}
</div>
);
}

const DETAILS_KEY = 'family_ledger_details';
function loadDetails() { try { return JSON.parse(localStorage.getItem(DETAILS_KEY) || '[]'); } catch { return []; } }
function saveDetailsLocal(tabs) { localStorage.setItem(DETAILS_KEY, JSON.stringify(tabs)); }

function DetailsTab() {
const [tabs, setTabs] = useState(() => loadDetails());
const [activeTab, setActiveTabLocal] = useState(null);
const [showNewTab, setShowNewTab] = useState(false);
const [newTabName, setNewTabName] = useState('');
const [showNewEntry, setShowNewEntry] = useState(false);
const [newEntryTitle, setNewEntryTitle] = useState('');
const [newEntryContent, setNewEntryContent] = useState('');
const [editingEntry, setEditingEntry] = useState(null);

useEffect(() => { if (tabs.length > 0 && !activeTab) setActiveTabLocal(tabs[0].id); }, [tabs]);

const persist = (updated) => { setTabs(updated); saveDetailsLocal(updated); };

const addTab = () => {
if (!newTabName.trim()) return;
const t = { id: 'dt_' + Date.now(), name: newTabName.trim(), entries: [] };
const updated = [...tabs, t];
persist(updated); setActiveTabLocal(t.id); setNewTabName(''); setShowNewTab(false);
};
const deleteTab = (id) => {
if (!window.confirm('Delete this section?')) return;
const updated = tabs.filter(t => t.id !== id);
persist(updated); setActiveTabLocal(updated.length > 0 ? updated[0].id : null);
};
const addEntry = () => {
if (!newEntryTitle.trim()) return;
const e = { id: 'e_' + Date.now(), title: newEntryTitle.trim(), content: newEntryContent.trim(), updatedAt: new Date().toISOString() };
persist(tabs.map(t => t.id === activeTab ? { ...t, entries: [...t.entries, e] } : t));
setNewEntryTitle(''); setNewEntryContent(''); setShowNewEntry(false);
};
const updateEntry = (eid, title, content) => {
persist(tabs.map(t => t.id === activeTab ? { ...t, entries: t.entries.map(e => e.id === eid ? { ...e, title, content, updatedAt: new Date().toISOString() } : e) } : t));
setEditingEntry(null);
};
const deleteEntry = (eid) => {
if (!window.confirm('Delete this entry?')) return;
persist(tabs.map(t => t.id === activeTab ? { ...t, entries: t.entries.filter(e => e.id !== eid) } : t));
};
const cur = tabs.find(t => t.id === activeTab);
return (
<div>
<div style={{ padding: '12px 16px 0', display: 'flex', gap: 8, overflowX: 'auto', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
{tabs.map(t => (
<button key={t.id} onClick={() => setActiveTabLocal(t.id)} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13, background: activeTab === t.id ? 'var(--primary)' : 'var(--surface-2)', color: activeTab === t.id ? 'white' : 'var(--text)', fontWeight: activeTab === t.id ? 600 : 400 }}>{t.name}</button>
))}
<button onClick={() => setShowNewTab(true)} style={{ padding: '6px 12px', borderRadius: 20, border: '1px dashed var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>+ Section</button>
</div>
{showNewTab && (
<div style={{ padding: '12px 16px', background: 'var(--surface-2)', display: 'flex', gap: 8 }}>
<input className="input" value={newTabName} onChange={e => setNewTabName(e.target.value)} placeholder="Section name (e.g. Bank Accounts)" autoFocus onKeyDown={e => { if (e.key === 'Enter') addTab(); if (e.key === 'Escape') { setShowNewTab(false); setNewTabName(''); }}} style={{ flex: 1 }} />
<button className="btn btn-primary btn-sm" onClick={addTab}>Add</button>
<button className="btn btn-secondary btn-sm" onClick={() => { setShowNewTab(false); setNewTabName(''); }}>Cancel</button>
</div>
)}
{tabs.length === 0 ? (
<div className="empty-state"><div className="icon">📁</div><h3>No sections yet</h3><p>Create your first section to organize family details</p><button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowNewTab(true)}>Create Section</button></div>
) : !cur ? null : (
<div style={{ padding: 16 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
<h2 style={{ fontSize: 16, margin: 0 }}>{cur.name}</h2>
<div style={{ display: 'flex', gap: 8 }}>
<button className="btn btn-primary btn-sm" onClick={() => setShowNewEntry(true)}>+ Add Entry</button>
<button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteTab(activeTab)}>Delete</button>
</div>
</div>
{showNewEntry && (
<div className="card" style={{ marginBottom: 16 }}>
<h3 style={{ fontSize: 14, marginBottom: 12 }}>New Entry</h3>
<input className="input" value={newEntryTitle} onChange={e => setNewEntryTitle(e.target.value)} placeholder="Title" style={{ marginBottom: 8 }} autoFocus />
<textarea className="input" value={newEntryContent} onChange={e => setNewEntryContent(e.target.value)} placeholder="Details, notes, account info..." rows={4} style={{ marginBottom: 8, resize: 'vertical' }} />
<div style={{ display: 'flex', gap: 8 }}>
<button className="btn btn-primary btn-sm" onClick={addEntry}>Save</button>
<button className="btn btn-secondary btn-sm" onClick={() => { setShowNewEntry(false); setNewEntryTitle(''); setNewEntryContent(''); }}>Cancel</button>
</div>
</div>
)}
{cur.entries.length === 0 && !showNewEntry ? (
<div className="empty-state" style={{ padding: '32px 0' }}><div className="icon">📝</div><p>No entries yet.</p></div>
) : cur.entries.map(entry => (
<div key={entry.id} className="card" style={{ marginBottom: 12 }}>
{editingEntry?.id === entry.id ? (
<div>
<input className="input" value={editingEntry.title} onChange={e => setEditingEntry({ ...editingEntry, title: e.target.value })} style={{ marginBottom: 8 }} />
<textarea className="input" value={editingEntry.content} onChange={e => setEditingEntry({ ...editingEntry, content: e.target.value })} rows={4} style={{ marginBottom: 8, resize: 'vertical' }} />
<div style={{ display: 'flex', gap: 8 }}>
<button className="btn btn-primary btn-sm" onClick={() => updateEntry(entry.id, editingEntry.title, editingEntry.content)}>Save</button>
<button className="btn btn-secondary btn-sm" onClick={() => setEditingEntry(null)}>Cancel</button>
</div>
</div>
) : (
<div>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
<div style={{ fontWeight: 600, fontSize: 15 }}>{entry.title}</div>
<div style={{ display: 'flex', gap: 6 }}>
<button className="btn btn-secondary btn-sm" onClick={() => setEditingEntry({ ...entry })}>Edit</button>
<button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteEntry(entry.id)}>Delete</button>
</div>
</div>
{entry.content && <pre style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{entry.content}</pre>}
<div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Updated {new Date(entry.updatedAt).toLocaleString()}</div>
</div>
)}
</div>
))}
</div>
)}
</div>
);
}

function SettingsTab({ currentUser, onLogout, onChangeUser }) {
const [pushEnabled, setPushEnabled] = useState(isPushEnabled());
const [emailEnabled, setEmailEnabled] = useState(getPref('emailEnabled', false));
const [requestingPush, setRequestingPush] = useState(false);
const handlePushToggle = async () => {
if (pushEnabled) { setPref('pushEnabled', false); setPushEnabled(false); return; }
setRequestingPush(true);
try {
const sub = await requestPushPermission();
if (sub) { await sendPushSubscriptionToServer(currentUser?.name, sub, import.meta.env.VITE_BACKEND_URL); setPref('pushEnabled', true); setPushEnabled(true); }
} catch (e) { console.error(e); }
setRequestingPush(false);
};
const handleEmailToggle = () => { const n = !emailEnabled; setEmailEnabled(n); setPref('emailEnabled', n); };
return (
<div style={{ padding: '16px' }}>
{currentUser && (
<div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
<div style={{ fontSize: 48, marginBottom: 8 }}>{currentUser.emoji}</div>
<div style={{ fontWeight: 700, fontSize: 18 }}>{currentUser.name}</div>
<div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{currentUser.email}</div>
<button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={onChangeUser}>Switch User</button>
</div>
)}
<div className="card">
<h3 style={{ marginBottom: 16, fontSize: 15 }}>Notifications</h3>
<div className="toggle-row">
<div><div style={{ fontWeight: 600 }}>Push Notifications</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Get notified of task reminders</div></div>
<button className={'toggle' + (pushEnabled ? ' on' : '')} onClick={handlePushToggle} disabled={requestingPush} />
</div>
<div className="toggle-row" style={{ borderBottom: 'none' }}>
<div><div style={{ fontWeight: 600 }}>Email Digest</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Weekly summary email</div></div>
<button className={'toggle' + (emailEnabled ? ' on' : '')} onClick={handleEmailToggle} />
</div>
</div>
<div style={{ marginTop: 24 }}>
<button className="btn btn-secondary" style={{ width: '100%' }} onClick={onLogout}>Log Out</button>
</div>
</div>
);
}

export default function App() {
const [authed, setAuthed] = useState(checkAuth());
const [identity, setIdentityState] = useState(getIdentity());
const [tasks, setTasks] = useState(getCachedTasks());
const [activeTab, setActiveTab] = useState('tasks');
const [syncing, setSyncing] = useState(false);
const [lastSync, setLastSync] = useState(null);
const [showAddTask, setShowAddTask] = useState(false);

const syncTasks = useCallback(async () => {
if (syncing) return;
setSyncing(true);
try {
const queue = getSyncQueue();
if (queue.length > 0) {
for (const item of queue) {
try {
if (item.type === 'complete') await completeTask(item.taskId, item.userId);
if (item.type === 'snooze') await snoozeTask(item.taskId, item.hours);
if (item.type === 'update') await updateTask(item.taskId, item.updates);
if (item.type === 'add') await addTask(item.task);
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

useEffect(() => { window.addEventListener('online', syncTasks); return () => window.removeEventListener('online', syncTasks); }, []);

useEffect(() => {
if ('serviceWorker' in navigator && 'SyncManager' in window) { navigator.serviceWorker.ready.then(reg => reg.sync.register('sync-tasks').catch(console.warn)); }
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'SYNC_REQUESTED') syncTasks(); });
}, []);

const handleComplete = async (taskId) => {
const userId = identity?.name || 'Unknown';
setTasks(prev => prev.map(t => t.id === taskId ? { ...t, lastCompleted: new Date().toISOString() } : t));
try { await completeTask(taskId, userId); await showLocalNotification('Task Complete!', 'Great job!'); syncTasks(); } catch (e) { addToSyncQueue({ type: 'complete', taskId, userId }); }
};
const handleSnooze = async (taskId, hours) => {
setTasks(prev => prev.map(t => { if (t.id !== taskId) return t; return { ...t, snoozedUntil: new Date(Date.now() + hours * 3600000).toISOString() }; }));
try { await snoozeTask(taskId, hours); } catch (e) { addToSyncQueue({ type: 'snooze', taskId, hours }); }
};
const handleTaskAdded = (task) => setTasks(prev => [task, ...prev]);
const handleLogout = () => { logout(); setAuthed(false); setIdentityState(null); };
const handleChangeUser = () => { setIdentity(null); setIdentityState(null); localStorage.removeItem('family_ledger_identity'); };
const handlePickIdentity = (user) => { setIdentity(user); setIdentityState(user); };

if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;
if (!identity) return <IdentityPicker onPick={handlePickIdentity} />;

const tabs = [
{ id: 'tasks', label: 'Tasks', icon: '✅' },
{ id: 'calendar', label: 'Today', icon: '📅' },
{ id: 'details', label: 'Details', icon: '📁' },
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
{syncing && <div className="spinner" />}
<button className="btn btn-secondary btn-sm" onClick={syncTasks} disabled={syncing}>Sync</button>
</div>
</header>
<div className="content">
{activeTab === 'tasks' && (<TasksTab tasks={tasks} currentUser={identity} onComplete={handleComplete} onSnooze={handleSnooze} syncing={syncing} />)}
{activeTab === 'calendar' && <CalendarTab currentUser={identity} />}
{activeTab === 'details' && <DetailsTab />}
{activeTab === 'settings' && (<SettingsTab currentUser={identity} onLogout={handleLogout} onChangeUser={handleChangeUser} />)}
</div>
{activeTab === 'tasks' && (
<button onClick={() => setShowAddTask(true)} style={{ position: 'fixed', bottom: 80, right: 20, width: 56, height: 56, borderRadius: '50%', background: 'var(--primary)', color: 'white', border: 'none', fontSize: 28, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }} aria-label="Add task">+</button>
)}
{showAddTask && (<AddTaskModal currentUser={identity} onClose={() => setShowAddTask(false)} onAdd={handleTaskAdded} />)}
<nav className="tab-bar">
{tabs.map(tab => (
<button key={tab.id} className={'tab-item' + (activeTab === tab.id ? ' active' : '')} onClick={() => setActiveTab(tab.id)}>
<span>{tab.icon}</span><span>{tab.label}</span>
</button>
))}
</nav>
</div>
);
}
