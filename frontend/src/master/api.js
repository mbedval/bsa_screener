/** Centralised API layer for master data management */

const BASE = '/api/master'

async function _req(method, url, body) {
  const opts = { method, headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const r = await fetch(url, opts)
  if (r.status === 204) return true
  const ct = r.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    const text = await r.text()
    throw new Error(r.ok ? 'Invalid response format received from server.' : `HTTP ${r.status}: ${text.slice(0, 100)}`)
  }
  const json = await r.json()
  if (!r.ok) throw new Error(json.detail || r.statusText)
  return json
}


// ── Sectors ──────────────────────────────────────────────────────────────────
export const sectors = {
  list: ()              => _req('GET',    `${BASE}/sectors`),
  create: (data)        => _req('POST',   `${BASE}/sectors`,       data),
  update: (id, data)    => _req('PUT',    `${BASE}/sectors/${id}`, data),
  remove: (id)          => _req('DELETE', `${BASE}/sectors/${id}`),
  tickers: (id)         => _req('GET',    `${BASE}/sectors/${id}/tickers`),
  summary: ()           => _req('GET',    `${BASE}/sectors-summary`),
}

// ── Tickers ───────────────────────────────────────────────────────────────────
export const tickers = {
  list: (params = {}) => {
    const q = new URLSearchParams()
    if (params.search)    q.set('search',    params.search)
    if (params.sector_id) q.set('sector_id', params.sector_id)
    if (params.is_fno !== undefined) q.set('is_fno', params.is_fno)
    if (params.limit)     q.set('limit',     params.limit)
    if (params.offset)    q.set('offset',    params.offset)
    const qs = q.toString()
    return _req('GET', `${BASE}/tickers${qs ? '?' + qs : ''}`)
  },
  create: (data)           => _req('POST',   `${BASE}/tickers`,                  data),
  update: (ticker, data)   => _req('PUT',    `${BASE}/tickers/${ticker}`,         data),
  remove: (ticker)         => _req('DELETE', `${BASE}/tickers/${ticker}`),
  setSectors: (ticker, ids) => _req('POST',  `${BASE}/tickers/${ticker}/sectors`, { sector_ids: ids }),
}

// ── Watchlists ────────────────────────────────────────────────────────────────
export const watchlists = {
  list: ()                 => _req('GET',    `${BASE}/watchlists`),
  create: (data)           => _req('POST',   `${BASE}/watchlists`,              data),
  update: (id, data)       => _req('PUT',    `${BASE}/watchlists/${id}`,        data),
  remove: (id)             => _req('DELETE', `${BASE}/watchlists/${id}`),
  setTickers: (id, tickers) => _req('POST',  `${BASE}/watchlists/${id}/tickers`, { tickers }),
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const users = {
  list: ()              => _req('GET',    `${BASE}/users`),
  create: (data)        => _req('POST',   `${BASE}/users`,             data),
  update: (email, data) => _req('PUT',    `${BASE}/users/${email}`,    data),
  remove: (email)       => _req('DELETE', `${BASE}/users/${email}`),
}

// ── Alternative Names (Ticker Aliases) ────────────────────────────────────────
export const alternativeNames = {
  list: (search)      => _req('GET',    `${BASE}/alternative-names${search ? '?search=' + encodeURIComponent(search) : ''}`),
  create: (data)      => _req('POST',   `${BASE}/alternative-names`,      data),
  update: (id, data)  => _req('PUT',    `${BASE}/alternative-names/${id}`, data),
  remove: (id)        => _req('DELETE', `${BASE}/alternative-names/${id}`),
}

// ── Excluded Tickers (Logical Exclusion Layer) ────────────────────────────────
export const excludedTickers = {
  list: (search)      => _req('GET',    `${BASE}/excluded-tickers${search ? '?search=' + encodeURIComponent(search) : ''}`),
  create: (data)      => _req('POST',   `${BASE}/excluded-tickers`,      data),
  update: (id, data)  => _req('PUT',    `${BASE}/excluded-tickers/${id}`, data),
  remove: (id)        => _req('DELETE', `${BASE}/excluded-tickers/${id}`),
  activeList: ()      => _req('GET',    `${BASE}/excluded-tickers/active-list`),
}
