const BASE_URL = '/api';

async function request(path, options = {}) {
  const token = JSON.parse(localStorage.getItem('moonbase-auth') || '{}')?.state?.token;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch((e) => {
    console.error('[api] JSON parse error:', e.message);
    return {};
  });
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  get:    (path)         => request(path),
  post:   (path, body)   => request(path, { method: 'POST',  body }),
  put:    (path, body)   => request(path, { method: 'PUT',   body }),
  delete: (path)         => request(path, { method: 'DELETE' }),
  patch:  (path, body)   => request(path, { method: 'PATCH', body }),
};
