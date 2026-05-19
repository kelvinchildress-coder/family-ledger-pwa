const BASE = import.meta.env.VITE_BACKEND_URL || '';

async function apiFetch(action, data = {}) {
    const url = BASE + '?action=' + action;
    const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('API error: ' + res.status);
    return res.json();
}

export async function getTasks() {
    return apiFetch('getTasks');
}

export async function updateTask(taskId, updates) {
    return apiFetch('updateTask', { taskId, updates });
}

export async function completeTask(taskId, userId) {
    return apiFetch('completeTask', { taskId, userId, completedAt: new Date().toISOString() });
}

export async function snoozeTask(taskId, hours) {
    const snoozeUntil = new Date(Date.now() + hours * 3600000).toISOString();
    return apiFetch('snoozeTask', { taskId, snoozeUntil });
}

export async function getCalendarEvents(email) {
    return apiFetch('getCalendarEvents', { email });
}

export async function savePushSubscription(userId, subscription) {
    return apiFetch('savePushSubscription', { userId, subscription });
}


export async function addTask(task) {
        return apiFetch('addTask', { ...task, createdAt: new Date().toISOString() });
}

export async function getDetails() {
        return apiFetch('getDetails');
}

                                             export async function saveDetails(details) {
                                                     return apiFetch('saveDetails', { details });
}
