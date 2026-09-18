/**
 * Thin API client for FreightOne backend.
 * Attaches layer-2 plant access headers when present (localStorage).
 */

const API = 'http://127.0.0.1:8000';
export default API;

function plantSecurityHeaders() {
  try {
    const auth = JSON.parse(localStorage.getItem('freightone_auth') || 'null');
    const plant = auth?.plant?.code || auth?.manager?.plant || '';
    const access = auth?.security?.plant_access_code_prefill || auth?.plantAccessCode || plant;
    if (!plant) return {};
    return {
      'X-Plant-Code': plant,
      'X-Plant-Access': access || plant,
    };
  } catch {
    return {};
  }
}

export async function api(path, opts = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Auto-append plant_access_code query for consignments if missing
    let url = `${API}${path}`;
    if (path.startsWith('/api/consignments') && !path.includes('plant_access_code=')) {
      const auth = (() => {
        try { return JSON.parse(localStorage.getItem('freightone_auth') || 'null'); } catch { return null; }
      })();
      const plant = auth?.plant?.code || auth?.manager?.plant || '';
      const access = auth?.security?.plant_access_code_prefill || auth?.plantAccessCode || plant;
      if (access) {
        url += (url.includes('?') ? '&' : '?') + `plant_access_code=${encodeURIComponent(access)}`;
      }
    }

    const response = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...plantSecurityHeaders(),
        ...(opts.headers || {}),
      },
      body: opts.body,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { detail: text };
    }
    if (!response.ok) {
      throw new Error(data.detail || `Request failed (${response.status})`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Backend request timed out.');
    if (err instanceof TypeError) throw new Error('Cannot reach FreightOne backend.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
