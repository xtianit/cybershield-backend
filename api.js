// api.js — CyberShield API service layer
const BASE = 'http://localhost:4000/api';

let _token = null;

export const setToken = (t) => { _token = t; if (t) localStorage.setItem('cs_token', t); else localStorage.removeItem('cs_token'); };
export const getToken = () => _token || localStorage.getItem('cs_token');

const headers = (extra = {}) => ({
  'Content-Type': 'application/json',
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  ...extra,
});

const req = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
};

const get  = (path)         => req('GET',    path);
const post = (path, body)   => req('POST',   path, body);
const put  = (path, body)   => req('PUT',    path, body);
const del  = (path)         => req('DELETE', path);

// Auth
export const auth = {
  login:          (email, password)         => post('/auth/login', { email, password }),
  register:       (data)                    => post('/auth/register', data),
  me:             ()                        => get('/auth/me'),
  changePassword: (current, newPassword)    => put('/auth/password', { current, newPassword }),
};

// Organizations
export const orgs = {
  list:      ()                  => get('/organizations'),
  get:       (id)                => get(`/organizations/${id}`),
  stats:     (id)                => get(`/organizations/${id}/stats`),
  create:    (data)              => post('/organizations', data),
  update:    (id, data)          => put(`/organizations/${id}`, data),
  remove:    (id)                => del(`/organizations/${id}`),
};

// Users
export const users = {
  list:           (params = {})  => get(`/users?${new URLSearchParams(params)}`),
  get:            (id)           => get(`/users/${id}`),
  create:         (data)         => post('/users', data),
  update:         (id, data)     => put(`/users/${id}`, data),
  remove:         (id)           => del(`/users/${id}`),
  recalcRisk:     (id)           => post(`/users/${id}/recalculate-risk`),
};

// Modules
export const modules = {
  list:       (params = {})      => get(`/modules?${new URLSearchParams(params)}`),
  get:        (id)               => get(`/modules/${id}`),
  create:     (data)             => post('/modules', data),
  update:     (id, data)         => put(`/modules/${id}`, data),
  remove:     (id)               => del(`/modules/${id}`),
  assign:     (id, data)         => post(`/modules/${id}/assign`, data),
  progress:   (id, progress)     => put(`/modules/${id}/progress`, { progress }),
  lessons:    (id)               => get(`/modules/${id}/lessons`),
  addLesson:  (id, data)         => post(`/modules/${id}/lessons`, data),
  quiz:       (id)               => get(`/modules/${id}/quiz`),
  submitQuiz: (id, answers)      => post(`/modules/${id}/quiz/submit`, { answers }),
};

// Simulations
export const sims = {
  list:     (params = {})        => get(`/simulations?${new URLSearchParams(params)}`),
  get:      (id)                 => get(`/simulations/${id}`),
  create:   (data)               => post('/simulations', data),
  launch:   (id)                 => post(`/simulations/${id}/launch`),
  complete: (id)                 => post(`/simulations/${id}/complete`),
  track:    (simId, event, data) => post(`/simulations/track/${simId}/${event}`, data),
  remove:   (id)                 => del(`/simulations/${id}`),
};

// Certificates
export const certs = {
  list:  (params = {})           => get(`/certificates?${new URLSearchParams(params)}`),
  get:   (id)                    => get(`/certificates/${id}`),
};

// Reports
export const reports = {
  platform: ()                   => get('/reports/platform'),
  org:      (orgId)              => get(orgId ? `/reports/org?orgId=${orgId}` : '/reports/org'),
  user:     (userId)             => get(`/reports/user/${userId}`),
};

export const healthCheck = () => get('/health').catch(() => null);
