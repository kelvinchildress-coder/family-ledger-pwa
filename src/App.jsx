import React, { useState, useEffect, useCallback } from 'react';
import { checkAuth, login, logout, getIdentity, setIdentity, getAvailableUsers } from './auth';
import { requestPushPermission, isPushEnabled, sendPushSubscriptionToServer, showLocalNotification } from './push';
import { getTasks, updateTask, completeTask, snoozeTask, getCalendarEvents, savePushSubscription } from './api';
import { getCachedTasks, setCachedTasks, addToSyncQueue, getSyncQueue, clearSyncQueue, getPref, setPref } from './storage';

// ============================================================
// PASSWORD GATE
// ============================================================
function PasswordGate({ onAuth }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (login(password, remember)) {
      onAuth();
    } else {
      setError('Incorrect password');
      setTimeout(() => setError(''), 2000);
    }
  };

  return (
    <div className="login-page">
      <div style={{ fontSize: 64, marginBottom: 8 }}>🏠</div>
      <h1>Childress Family Ledger</h1>
      <p>Enter the family password to continue</p>
      <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          className="input"
          type="password"
          placeholder="Family password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
        />
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

// ============================================================
// IDENTITY PICKER
// ============================================================
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
          <button
            key={u.name}
            className={'user-card' + (selected?.name === u.name ? ' selected' : '')}
            onClick={() => setSelected(u)}
          >
            <span className="user-avatar">{u.emoji}</span>
            <span className="user-name">{u.name}</span>
          </button>
        ))}
      </div>
      <button
        className="btn btn-primary"
        disabled={!selected}
        style={{ width: '100%' }}
        onClick={() => onPick(selected)}
      >
        Continue as {selected?.name || '...'}
      </button>
    </div>
  );
}

// ============================================================
// TASK CARD
// ============================================================
function TaskCard({ task, currentUser, onComplete, onSnooze }) {
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !task.lastCompleted;
  const isAssignedToMe = task.assignedTo === currentUser?.name || task.assignedTo === 'All';
  
  const getPriorityClass = (p) => {
    if (p === 'High') return 'badge-high';
    if (p === 'Medium') return 'badge-medium';
    return 'badge-low';
  };

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
          {isAssignedToMe && (
            <button className="btn btn-primary btn-sm" onClick={() => onComplete(task.id)}>✓ Done</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => onSnooze(task.id, 24)}>💤 24h</button>
        </div>
      </div>
      {task.lastCompleted && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          ✅ Last done: {new Date(task.lastCompleted).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TASKS TAB
// ============================================================
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
          <button
            key={f}
            className={'btn btn-sm ' + (filter === f ? 'btn-primary' : 'btn-secondary')}
            onClick={() => setFilter(f)}
          >
            {f === 'mine' ? 'My Tasks' : f === 'all' ? 'All Tasks' : '⚠️ Overdue'}
          </button>
        ))}
      </div>
      {syncing && (
        <div className="sync-indicator">
          <div className="spinner" />
          <span>Syncing...</span>
        </div>
      )}
      {filteredTasks.length === 0 ? (
        <div className="empty-state">
          <div className="icon">✅</div>
          <h3>All caught up!</h3>
          <p>No tasks here right now</p>
        </div>
      ) : (
        filteredTasks.map(t => (
          <TaskCard
            key={t.id}
            task={t}
            currentUser={currentUser}
            onComplete={onComplete}
            onSnooze={onSnooze}
          />
        ))
      )}
    </div>
  );
}

// ============================================================
// CALENDAR TAB
// ============================================================
function CalendarTab({ currentUser }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  useEffect(() => {
    if (!currentUser?.email) { setLoading(false); return; }
    getCalendarEvents(currentUser.email)
      .then(data => { setEvents(data.events || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [currentUser]);

  const openGoogleCalendar = () => {
    const url = 'https://calendar.google.com/calendar/r/day';
    window.open(url, '_blank');
  };

  return (
    <div>
      <div style={{ padding: '16px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>TODAY</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{today}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={openGoogleCalendar}>📅 Open Calendar</button>
      </div>
      {loading ? (
        <div className="sync-indicator" style={{ padding: 24, justifyContent: 'center' }}>
          <div className="spinner" />
          <span>Loading calendar...</span>
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="icon">📅</div>
          <h3>Calendar not connected</h3>
          <p style={{ marginBottom: 16 }}>Connect your Google Calendar to see events here</p>
          <button className="btn btn-secondary" onClick={openGoogleCalendar}>Open Google Calendar</button>
        </div>
      ) : events.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🎉</div>
          <h3>Nothing scheduled today!</h3>
          <p>Enjoy your free day</p>
        </div>
      ) : (
        <div>
          {events.map((e, i) => (
            <div key={i} className="calendar-event">
              <div className="event-time">{e.start ? new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'All day'}</div>
              <div>
                <div className="event-title">{e.title || e.summary}</div>
                {e.location && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>📍 {e.location}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SETTINGS TAB
// ============================================================
function SettingsTab({ currentUser, onLogout, onChangeUser }) {
  const [pushEnabled, setPushEnabled] = useState(isPushEnabled());
  const [emailEnabled, setEmailEnabled] = useState(getPref('emailEnabled', false));
  const [requestingPush, setRequestingPush] = useState(false);

  const handlePushToggle = async () => {
    if (pushEnabled) {
      setPref('pushEnabled', false);
      setPushEnabled(false);
      return;
    }
    setRequestingPush(true);
    try {
      const sub = await requestPushPermission();
      if (sub) {
        await sendPushSubscriptionToServer(currentUser?.name, sub, import.meta.env.VITE_BACKEND_URL);
        setPref('pushEnabled', true);
        setPushEnabled(true);
      }
    } catch (e) {
      console.error(e);
    }
    setRequestingPush(false);
  };

  const handleEmailToggle = () => {
    const newVal = !emailEnabled;
    setEmailEnabled(newVal);
    setPref('emailEnabled', newVal);
  };

  return (
    <div style={{ padding: '16px' }}>
      {currentUser && (
        <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{currentUser.emoji}</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{currentUser.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{currentUser.email}</div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={onChangeUser}>
            Switch User
          </button>
        </div>
      )}
      
      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 15 }}>Notifications</h3>
        <div className="toggle-row">
          <div>
            <div style={{ fontWeight: 600 }}>Push Notifications</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Get notified of task reminders</div>
          </div>
          <button
            className={'toggle' + (pushEnabled ? ' on' : '')}
            onClick={handlePushToggle}
            disabled={requestingPush}
          />
        </div>
        <div className="toggle-row" style={{ borderBottom: 'none' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Email Digest</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Weekly summary email</div>
          </div>
          <button
            className={'toggle' + (emailEnabled ? ' on' : '')}
            onClick={handleEmailToggle}
          />
        </div>
      </div>
      
      <div style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onLogout}>
          🚪 Log Out
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [authed, setAuthed] = useState(checkAuth());
  const [identity, setIdentityState] = useState(getIdentity());
  const [tasks, setTasks] = useState(getCachedTasks());
  const [activeTab, setActiveTab] = useState('tasks');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  // Background sync
  const syncTasks = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      // Process offline queue first
      const queue = getSyncQueue();
      if (queue.length > 0) {
        for (const item of queue) {
          try {
            if (item.type === 'complete') await completeTask(item.taskId, item.userId);
            if (item.type === 'snooze') await snoozeTask(item.taskId, item.hours);
            if (item.type === 'update') await updateTask(item.taskId, item.updates);
          } catch (e) { console.warn('Sync item failed:', e); }
        }
        clearSyncQueue();
      }
      const data = await getTasks();
      if (data.tasks) {
        setTasks(data.tasks);
        setCachedTasks(data.tasks);
        setLastSync(new Date());
      }
    } catch (e) {
      console.warn('Sync failed, using cached data:', e);
    }
    setSyncing(false);
  }, [syncing]);

  // Auto-sync on mount and periodically
  useEffect(() => {
    if (!authed || !identity) return;
    syncTasks();
    const interval = setInterval(syncTasks, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(interval);
  }, [authed, identity]);

  // Online/offline sync
  useEffect(() => {
    const handleOnline = () => { syncTasks(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Register background sync via service worker
  useEffect(() => {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.sync.register('sync-tasks').catch(console.warn);
      });
    }
    // Listen for sw sync requests
    navigator.serviceWorker?.addEventListener('message', (e) => {
      if (e.data?.type === 'SYNC_REQUESTED') syncTasks();
    });
  }, []);

  const handleComplete = async (taskId) => {
    const userId = identity?.name || 'Unknown';
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, lastCompleted: new Date().toISOString() } : t));
    try {
      await completeTask(taskId, userId);
      await showLocalNotification('Task Complete! 🎉', 'Great job! Task marked as done.');
      syncTasks();
    } catch (e) {
      addToSyncQueue({ type: 'complete', taskId, userId });
    }
  };

  const handleSnooze = async (taskId, hours) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const snoozeUntil = new Date(Date.now() + hours * 3600000).toISOString();
      return { ...t, snoozedUntil: snoozeUntil };
    }));
    try {
      await snoozeTask(taskId, hours);
    } catch (e) {
      addToSyncQueue({ type: 'snooze', taskId, hours });
    }
  };

  const handleLogout = () => {
    logout();
    setAuthed(false);
    setIdentityState(null);
  };

  const handleChangeUser = () => {
    setIdentity(null);
    setIdentityState(null);
    localStorage.removeItem('family_ledger_identity');
  };

  const handlePickIdentity = (user) => {
    setIdentity(user);
    setIdentityState(user);
  };

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;
  if (!identity) return <IdentityPicker onPick={handlePickIdentity} />;

  const tabs = [
    { id: 'tasks', label: 'Tasks', icon: '✅' },
    { id: 'calendar', label: 'Today', icon: '📅' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Family Ledger</h1>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {identity.emoji} {identity.name} {lastSync ? '· synced ' + lastSync.toLocaleTimeString() : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {syncing && <div className="spinner" />}
          <button className="btn btn-secondary btn-sm" onClick={syncTasks} disabled={syncing}>
            🔄
          </button>
        </div>
      </header>
      
      <div className="content">
        {activeTab === 'tasks' && (
          <TasksTab
            tasks={tasks}
            currentUser={identity}
            onComplete={handleComplete}
            onSnooze={handleSnooze}
            syncing={syncing}
          />
        )}
        {activeTab === 'calendar' && <CalendarTab currentUser={identity} />}
        {activeTab === 'settings' && (
          <SettingsTab
            currentUser={identity}
            onLogout={handleLogout}
            onChangeUser={handleChangeUser}
          />
        )}
      </div>
      
      <nav className="tab-bar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={'tab-item' + (activeTab === tab.id ? ' active' : '')}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
