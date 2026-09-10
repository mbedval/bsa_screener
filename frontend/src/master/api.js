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
  list: (dataset)       => _req('GET',    `${BASE}/sectors${dataset ? '?dataset=' + dataset : ''}`),
  create: (data, dataset) => _req('POST', `${BASE}/sectors${dataset ? '?dataset=' + dataset : ''}`, data),
  update: (id, data, dataset) => _req('PUT', `${BASE}/sectors/${id}${dataset ? '?dataset=' + dataset : ''}`, data),
  remove: (id, dataset) => _req('DELETE', `${BASE}/sectors/${id}${dataset ? '?dataset=' + dataset : ''}`),
  tickers: (id, dataset) => _req('GET',   `${BASE}/sectors/${id}/tickers${dataset ? '?dataset=' + dataset : ''}`),
  summary: (dataset)    => _req('GET',    `${BASE}/sectors-summary${dataset ? '?dataset=' + dataset : ''}`),
  importFile: async (file, customSector, dataset) => {
    const fd = new FormData()
    fd.append('file', file)
    if (customSector) fd.append('custom_sector', customSector)
    const url = `${BASE}/sectors/import-file${dataset ? '?dataset=' + dataset : ''}`
    const r = await fetch(url, {
      method: 'POST',
      body: fd,
    })
    const ct = r.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      const text = await r.text()
      throw new Error(r.ok ? 'Invalid response format received from server.' : `HTTP ${r.status}: ${text.slice(0, 100)}`)
    }
    const json = await r.json()
    if (!r.ok) throw new Error(json.detail || r.statusText)
    return json
  },
}

// ── Tickers ───────────────────────────────────────────────────────────────────
export const tickers = {
  list: (params = {}, dataset) => {
    const q = new URLSearchParams()
    if (params.search)    q.set('search',    params.search)
    if (params.sector_id) q.set('sector_id', params.sector_id)
    if (params.is_fno !== undefined) q.set('is_fno', params.is_fno)
    if (params.limit)     q.set('limit',     params.limit)
    if (params.offset)    q.set('offset',    params.offset)
    if (dataset)          q.set('dataset',   dataset)
    const qs = q.toString()
    return _req('GET', `${BASE}/tickers${qs ? '?' + qs : ''}`)
  },
  create: (data, dataset) => _req('POST', `${BASE}/tickers${dataset ? '?dataset=' + dataset : ''}`, data),
  update: (ticker, data, dataset) => _req('PUT', `${BASE}/tickers/${ticker}${dataset ? '?dataset=' + dataset : ''}`, data),
  remove: (ticker, dataset) => _req('DELETE', `${BASE}/tickers/${ticker}${dataset ? '?dataset=' + dataset : ''}`),
  removeBatch: (tickers, dataset) => _req('POST', `${BASE}/tickers/batch-delete${dataset ? '?dataset=' + dataset : ''}`, { tickers }),
  setSectors: (ticker, ids, dataset) => _req('POST', `${BASE}/tickers/${ticker}/sectors${dataset ? '?dataset=' + dataset : ''}`, { sector_ids: ids }),
}

// ── Watchlists ────────────────────────────────────────────────────────────────
export const watchlists = {
  list: ()                 => _req('GET',    `${BASE}/watchlists`),
  create: (data)           => _req('POST',   `${BASE}/watchlists`,              data),
  update: (id, data)       => _req('PUT',    `${BASE}/watchlists/${id}`,        data),
  remove: (id)             => _req('DELETE', `${BASE}/watchlists/${id}`),
  removeBatch: (ids)       => _req('POST',   `${BASE}/watchlists/batch-delete`, { ids }),
  setTickers: (id, tickers) => _req('POST',  `${BASE}/watchlists/${id}/tickers`, { tickers }),
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const users = {
  list: ()              => _req('GET',    `${BASE}/users`),
  create: (data)        => _req('POST',   `${BASE}/users`,             data),
  update: (email, data) => _req('PUT',    `${BASE}/users/${email}`,    data),
  remove: (email)       => _req('DELETE', `${BASE}/users/${email}`),
  removeBatch: (emails) => _req('POST',   `${BASE}/users/batch-delete`, { emails }),
  sendNewsletter: (email) => _req('POST',  `${BASE}/users/${email}/newsletter-send`),
}

// ── Recommendations ───────────────────────────────────────────────────────────
export const recommendations = {
  removeBatch: (ids)    => _req('POST',   '/api/recommendations/batch-delete', { ids }),
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
