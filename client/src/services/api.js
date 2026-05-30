// API_URL - use environment variable or default
// In development with Vite proxy, use /api (proxy will forward to http://localhost:5000)
// In production, use full URL from env or fall back to localhost
const API_URL = import.meta.env.VITE_API_URL 
  ? import.meta.env.VITE_API_URL
  : (import.meta.env.MODE === 'development' ? '/api' : 'http://localhost:5000');

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { 'x-auth-token': token } : {};
};

const handleResponse = async (res) => {
  if (res.status === 204) return res;
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { response: { data } });
  return { data };
};

export const api = {
  get: (path, params) => {
    const url = new URL(`${API_URL}${path}`, API_URL);
    if (params) Object.entries(params).forEach(([k, v]) => v !== undefined && url.searchParams.append(k, v));
    return fetch(url.toString(), { method: 'GET', headers: { ...getHeaders() } }).then(handleResponse);
  },
  post: (path, body) => {
    const url = `${API_URL}${path}`;
    const isFormData = body instanceof FormData;
    return fetch(url, {
      method: 'POST',
      headers: isFormData ? getHeaders() : { 'Content-Type': 'application/json', ...getHeaders() },
      body: isFormData ? body : JSON.stringify(body)
    }).then(handleResponse);
  },
  patch: (path, body) => {
    const url = `${API_URL}${path}`;
    return fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getHeaders() },
      body: JSON.stringify(body)
    }).then(handleResponse);
  },
  put: (path, body) => {
    const url = `${API_URL}${path}`;
    return fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getHeaders() },
      body: JSON.stringify(body)
    }).then(handleResponse);
  },
  delete: (path) => {
    return fetch(`${API_URL}${path}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse);
  }
};

// Auth
export const login = (email, password) => api.post('/api/auth/login', { email, password });
export const register = (data) => api.post('/api/auth/register', data);
export const verifyEmail = (token) => api.get(`/api/auth/verify-email?token=${token}`);
export const requestPasswordReset = (email) => api.post('/api/auth/forgot-password', { email });
export const forgotPassword = (email) => api.post('/api/auth/forgot-password', { email });
export const resetPassword = (token, password) => api.post('/api/auth/reset-password', { token, password });
export const resendVerification = () => api.post('/api/auth/resend-verification', {});

// Users
export const getCurrentUser = () => api.get('/api/users/me');
export const updateProfile = (data) => api.patch('/api/users/me', data);
export const fetchUserProfile = () => api.get('/api/users/me');
export const getUserById = (id) => api.get(`/api/users/${id}`);
export const fetchUserStats = (id) => api.get(`/api/users/${id}/stats`);
export const getLeaderboard = (params) => api.get('/api/users/leaderboard', params);

// Admin: analytics
export const getAnalytics = () => api.get('/api/admin/analytics');
export const getQueryStats = () => api.get('/api/queries/sla/stats');

// Admin: users (paginated)
export const getUsers = ({ page = 1, pageSize = 10, search = '' } = {}) =>
  api.get('/api/users/admin/users', { page, pageSize, search });

// Admin: ban user — hits PATCH /api/users/:id/ban
export const updateUserBan = (id, isBanned) => api.patch(`/api/users/${id}/ban`, { isBanned });

// Queries
export const getQueries = ({ page = 1, pageSize = 10, status, search = '' } = {}) =>
  api.get('/api/queries', { page, pageSize, status, search });
export const createQuery = (data) => api.post('/api/queries', data);
export const claimQuery = (id) => api.post(`/api/queries/${id}/claim`);
export const unclaimQuery = (id) => api.delete(`/api/queries/${id}/claim`);
export const releaseQuery = (id) => api.post(`/api/queries/${id}/release`);
export const takeQuery = (id) => api.post(`/api/queries/${id}/take`);
export const closeQuery = (id) => api.patch(`/api/queries/${id}`, { status: 'closed' });
export const deleteQuery = (id) => api.delete(`/api/queries/${id}`);
export const updateQuery = (id, data) => api.put(`/api/queries/${id}`, data);
export const getSimilarQueries = (title, excludeId) =>
  api.get('/api/search/similar', { q: title })
    .then(({ data }) => (data.queries || []).filter(q => q._id !== excludeId).slice(0, 3));
export const submitAnswer = (queryId, content) => api.post(`/api/queries/${queryId}/answers`, { content });
export const createAnswer = (queryId, content) => api.post('/api/answers', { queryId, content });
export const upvoteAnswer = (answerId) => api.post(`/api/answers/${answerId}/upvote`);
export const acceptAnswer = (answerId) => api.post(`/api/answers/${answerId}/accept`);
export const vetAnswer = (answerId) => api.post(`/api/answers/${answerId}/vet`);
export const getQueryById = (id) => api.get(`/api/queries/${id}`);

// Answers
export const postAnswer = (queryId, data) => api.post(`/api/queries/${queryId}/answers`, data);
export const voteAnswer = (answerId) => api.post(`/api/answers/${answerId}/vote`);
export const deleteAnswer = (id) => api.delete(`/api/answers/${id}`);

// FAQs
export const getFAQs = ({ page, pageSize, search, tag, category } = {}) =>
  api.get('/api/faqs', { page, pageSize, search, tag, category });
export const getFAQById = (id) => api.get(`/api/faqs/${id}`);
export const getFAQ = (id) => api.get(`/api/faqs/${id}`);
export const getFAQsByCategory = (tag, params) => api.get(`/api/faqs/category/${tag}`, params);
export const upvoteFAQ = (id) => api.post(`/api/faqs/${id}/upvote`);
export const getTrending = () => api.get('/api/faqs/trending');
export const getPins = () => api.get('/api/faqs/pins');

// FAQ Requests
export const submitFAQRequest = (data) => api.post('/api/faq-requests', data);
export const createFAQRequest = (data) => api.post('/api/faq-requests', data);
export const getFAQRequests = ({ page = 1, pageSize = 20 } = {}) =>
  api.get('/api/faq-requests', { page, pageSize });
export const resolveFAQRequest = (id, data = {}) => api.post(`/api/faq-requests/${id}/approve`, data);
export const rejectFAQRequest = (id) => api.post(`/api/faq-requests/${id}/reject`);

// Admin: FAQ management
// getAdminFaqs maps page/pageSize -> page/limit for the controller
export const getAdminFaqs = ({ page = 1, limit = 20, status, search, tag } = {}) =>
  api.get('/api/admin/faqs', { page, limit, status, search, tag });

export const patchFaq = (id, data) => api.patch(`/api/admin/faqs/${id}`, data);

export const deleteFAQ = (id) => api.patch(`/api/admin/faqs/${id}`, { status: 'deleted' });

// Admin: moderation
export const getModerationQueue = () => api.get('/api/admin/moderation');
export const approveAnswer = (id) => api.post(`/api/admin/answers/${id}/approve`);
export const rejectAnswer = (id) => api.post(`/api/admin/answers/${id}/reject`);

// Categories
export const getCategories = () => api.get('/api/categories');

// Search
export const searchSimilar = (q) => api.get('/api/search/similar', { q });
export const detectTags = (text) => api.get('/api/search/detect-tags', { text });

// RAG Chat
export const ragChat = (message, sessionId) => api.post('/api/rag/chat', { message, sessionId });

// Upload
export const uploadImage = (file) => {
  const form = new FormData();
  form.append('image', file);
  return api.post('/api/upload', form);
};

// Admin pins
export const getAdminPins = () => api.get('/api/admin/pins');
export const createPin = (data) => api.post('/api/admin/pins', data);

export default api;