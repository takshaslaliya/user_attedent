import axios from 'axios';

// Use relative /api endpoint or environment variable VITE_API_URL
const getBaseURL = () => {
  return import.meta.env.VITE_API_URL || '/api';
};

const apiClient = axios.create({
  baseURL: getBaseURL(),
  timeout: 15000,
});

// Helper to get or create persistent device uuid
export function getOrCreateDeviceUuid(): string {
  let uuid = localStorage.getItem('hams_device_uuid');
  if (!uuid) {
    uuid = 'dev_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
    localStorage.setItem('hams_device_uuid', uuid);
  }
  return uuid;
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const deviceUuid = getOrCreateDeviceUuid();
  if (deviceUuid) {
    config.headers['x-device-uuid'] = deviceUuid;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

/**
 * POST that survives a server overload: when the request gets no answer (network error,
 * timeout) or a busy/overload status, it waits and sends the *same* request again, up to
 * `attempts` times. Waits grow (≈1.5 s, 3 s, 6 s) with a random part, so hundreds of phones
 * retrying don't all hit the server in the same second. Only for requests that are safe to
 * repeat (attendance marking is: a repeat answers "already marked").
 */
export async function postWithRetry<T = any>(
  url: string,
  body: any,
  opts: { attempts?: number; onRetry?: (attempt: number, waitMs: number) => void } = {}
) {
  const attempts = opts.attempts ?? 4;
  const RETRY_STATUSES = new Set([429, 500, 502, 503, 504, 508]);
  for (let attempt = 1; ; attempt++) {
    try {
      return await apiClient.post<T>(url, body);
    } catch (err: any) {
      const status = err.response?.status;
      const retryable = !err.response || RETRY_STATUSES.has(status);
      if (!retryable || attempt >= attempts) throw err;
      const waitMs = Math.round(1500 * 2 ** (attempt - 1) * (0.7 + Math.random() * 0.6));
      opts.onRetry?.(attempt, waitMs);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

/** True when the request never got a usable answer (offline, timeout, overloaded proxy). */
export function isServerUnavailable(err: any): boolean {
  return !err?.response || [502, 503, 504, 508].includes(err.response.status);
}

// Account blocked (edited login token, or by an admin): leave the app and show the
// blocked screen with the reason on the login page.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error.response?.data;
    if (error.response?.status === 403 && data?.code === 'ACCOUNT_BLOCKED') {
      localStorage.setItem('hams_device_blocked_info', JSON.stringify({
        isBlocked: true,
        code: 'ACCOUNT_BLOCKED',
        message: data.message,
        reason: data.reason,
        blockedAt: data.blocked_at || new Date().toISOString()
      }));
      // Marking attendance shows the message on the mark screen itself (StudentDashboard);
      // any other request leaves the app for the blocked screen.
      const isMark = String(error.config?.url || '').includes('/attendance/mark');
      if (!isMark) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Mock interceptor to bypass backend errors when testing
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const token = localStorage.getItem('token');
    if (token === 'mock_token_for_testing' && error.response?.status === 401) {
      const url = error.config.url;
      
      if (url.includes('/attendance/my-status')) {
        return Promise.resolve({
          data: {
            success: true,
            data: { already_marked: false, attendance_active: true, start_time: '00:00', end_time: '23:59' }
          }
        });
      }
      
      if (url.includes('/admin/dashboard')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              total_students: 120, present_today: 110, late_today: 5, absent_today: 5,
              weekly_stats: [
                { date: new Date(Date.now() - 86400000).toISOString(), present: 100, late: 10 },
                { date: new Date().toISOString(), present: 110, late: 5 }
              ],
              floor_status: [
                { floor_name: 'Floor 1', session_status: 'Active', present_students: 45, total_students: 50 },
                { floor_name: 'Floor 2', session_status: 'Active', present_students: 65, total_students: 70 }
              ]
            }
          }
        });
      }
      
      if (url.includes('/attendance/challenge')) {
        return Promise.resolve({ data: { success: true, challenge: 'mock_ble_challenge_token' } });
      }
      
      if (url.includes('/attendance/mark')) {
        return Promise.resolve({ data: { success: true, message: 'Attendance marked successfully!' } });
      }
    }
    
    return Promise.reject(error);
  }
);


export default apiClient;
