const TASKS_KEY = 'fl_tasks';
const QUEUE_KEY = 'fl_sync_queue';
const PREFS_KEY = 'fl_prefs';

export function getCachedTasks() {
  try {
      return JSON.parse(localStorage.getItem(TASKS_KEY) || '[]');
        } catch (e) {
            return [];
              }
              }

              export function setCachedTasks(tasks) {
                try {
                    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
                      } catch (e) {
                          console.warn('Could not cache tasks:', e);
                            }
                            }

                            export function getSyncQueue() {
                              try {
                                  return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
                                    } catch (e) {
                                        return [];
                                          }
                                          }

                                          export function addToSyncQueue(item) {
                                            const queue = getSyncQueue();
                                              queue.push({ ...item, timestamp: Date.now() });
                                                try {
                                                    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
                                                      } catch (e) {
                                                          console.warn('Could not update sync queue:', e);
                                                            }
                                                            }

                                                            export function clearSyncQueue() {
                                                              localStorage.removeItem(QUEUE_KEY);
                                                              }

                                                              export function getPref(key, defaultValue = null) {
                                                                try {
                                                                    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
                                                                        return key in prefs ? prefs[key] : defaultValue;
                                                                          } catch (e) {
                                                                              return defaultValue;
                                                                                }
                                                                                }

                                                                                export function setPref(key, value) {
                                                                                  try {
                                                                                      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
                                                                                          prefs[key] = value;
                                                                                              localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
                                                                                                } catch (e) {
                                                                                                    console.warn('Could not save pref:', e);
                                                                                                      }
                                                                                                      }
