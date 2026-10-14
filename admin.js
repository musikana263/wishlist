const root = document.getElementById('root');
const KEY = 'musikana-admin-key';
let key = sessionStorage.getItem(KEY) || '';
let data = null;
let status = '';

const adminApi = (path, opts = {}) => api('/api/admin' + path, { ...opts, headers: { 'x-admin-key': key, ...(opts.headers || {}) } });

function say(msg) { status = msg; const el = document.getElementById('status'); if (el) el.textContent = msg; }

async function load() {
  try {
    data = await adminApi('/data');
    render();
  } catch (e) {
    if (e.status === 401 || e.status === 503) { sessionStorage.removeItem(KEY); key = ''; loginView(e.message); }
    else { root.textContent = ''; root.appendChild(h('p', { class: 'error', text: e.message })); }
  }
}

function loginView(msg) {
  const pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true });
  root.textContent = '';
  root.appendChild(h('div', { class: 'login' }, logo(),
    h('h1', { style: 'font-size:2rem', text: 'Wish list admin' }),
    h('form', { onsubmit: (e) => { e.preventDefault(); key = pw.value; sessionStorage.setItem(KEY, key); load(); } },
      h('label', { for: 'pw', text: 'Admin password' }), pw,
      msg && key === '' && pw.value === '' ? h('p', { class: 'error', style: 'margin-top:.5rem', text: msg === 'Wrong password.' ? 'That password is wrong. Try again.' : msg }) : null,
      h('div', { class: 'row-actions' }, h('button', { class: 'btn', type: 'submit' }, 'Sign in')))));
  pw.focus();
}

function settingsPanel() {
  const s = { ...data.settings };
  const f = (label, k, textarea) => h('div', null, h('label', { text: label }),
    h(textarea ? 'textarea' : 'input', { value: s[k] || '', oninput: (e) => { s[k] = e.target.value; } }));
  return h('section', { class: 'panel' }, h('h2', { text: 'Visit details' }),
    h('div', { class: 'grid2' },
      f('Home name', 'home'), f('Visit date', 'visitDate'),
      f('Drop-off deadline', 'deadline'), f('WhatsApp number', 'whatsapp'),
      h('div', null, h('label', { text: 'Campaign end date (for the countdown)' }),
        h('input', { type: 'date', value: s.endDate || '', oninput: (e) => { s.endDate = e.target.value; } }))),
    h('div', { style: 'margin-top:.75rem' }, f('Intro text', 'intro', true)),
    h('div', { class: 'row-actions' }, h('button', { class: 'btn', type: 'button', onclick: async (e) => {
      e.target.disabled = true;
      try { await adminApi('/settings', { method: 'PUT', body: JSON.stringify(s) }); say('Visit details saved.'); await load(); }
      catch (ex) { say(ex.message); e.target.disabled = false; }
    } }, 'Save details')));
}

function trackerPanel() {
  const rows = data.items.map((it) => {
    const st = itemStats(it);
    const bar = trackBar(it, st);
    return h('tr', null,
      h('td', null, h('strong', { text: it.name }), h('div', { class: 'muted', style: 'font-size:.85rem', text: st.target ? 'Target ' + fmtAmt(it, st.target) : 'No target' })),
      h('td', { class: 'num', text: fmtAmt(it, st.pledged) }),
      h('td', { class: 'num', text: fmtAmt(it, st.received) }),
      h('td', { class: 'num' + (st.outstanding ? ' warn-text' : ''), text: st.outstanding ? fmtAmt(it, st.outstanding) : '–' }),
      h('td', { style: 'min-width:10rem' }, bar));
  });
  const open = data.pledges.filter((p) => p.status === 'pledged');
  const openDonors = new Set(open.map((p) => p.ref || p.name)).size;
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', { text: 'Received vs pledged' }),
      h('div', { class: 'legend' }, h('span', { class: 'key key-p' }, 'Pledged'), h('span', { class: 'key key-r' }, 'Received'), h('span', { class: 'key key-t' }, 'Target'))),
    h('p', { class: 'muted', style: 'margin:-.4rem 0 .75rem;font-size:.92rem',
      text: open.length ? open.length + ' pledged item lines from ' + openDonors + ' donor' + (openDonors === 1 ? '' : 's') + ' still to collect. Mark pledges as received below when items arrive.'
                        : 'Everything pledged has been received.' }),
    (() => { const r = receivedShare(data.items); return r.items ? h('div', { class: 'received-block', style: 'margin-top:0' },
      h('div', { class: 'received-head' }, h('h3', { text: r.pct + '% received' }), h('p', { class: 'muted', text: 'of everything pledged so far' })),
      progressBar(r.pct, 100, 'Received compared with pledged', 'big-bar received-bar')) : null; })(),
    h('div', { class: 'scroll' }, h('table', { class: 'tracker-table' },
      h('thead', null, h('tr', null, ['Item', 'Pledged', 'Received', 'Still to collect', ''].map((t) => h('th', { text: t })))),
      h('tbody', null, rows))));
}

function itemsPanel() {
  const measureSel = (val, onchange, label) => h('select', { 'aria-label': label, onchange },
    [['unit', 'Units'], ['pack', 'Packs'], ['kg', 'kg'], ['L', 'litres'], ['choice', 'Choose only (no amount)']].map(([v, t]) => { const o = h('option', { value: v, text: t }); if (v === (val || 'unit')) o.selected = true; return o; }));
  const rows = data.items.map((it) => {
    const v = { name: it.name, unit: it.unit, qty: it.qty, received: it.received, size: it.size, measure: it.measure };
    const inp = (k, type, step) => h('input', { type: type || 'text', min: type ? '0' : null, step: step || null, value: v[k], 'aria-label': k + ' for ' + it.name,
      oninput: (e) => { v[k] = type ? (parseFloat(e.target.value) || 0) : e.target.value; } });
    const st = itemStats(it);
    return h('tr', null,
      h('td', null, inp('name')), h('td', null, inp('unit')),
      h('td', null, measureSel(v.measure, (e) => { v.measure = e.target.value; }, 'Measure for ' + it.name)),
      h('td', null, inp('size', 'number', '0.1')),
      h('td', null, inp('qty', 'number')),
      h('td', null, inp('received', 'number')),
      h('td', { class: 'num', text: fmtAmt(it, st.pledged) }),
      h('td', null, h('div', { class: 'row-actions', style: 'margin:0' },
        h('button', { class: 'btn small', type: 'button', onclick: async () => {
          const body = { ...v, qty: Math.round(v.qty), received: Math.round(v.received) };
          try { await adminApi('/items/' + it.id, { method: 'PUT', body: JSON.stringify(body) }); say(v.name + ' saved.'); await load(); }
          catch (ex) { say(ex.message); }
        } }, 'Save'),
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (!confirm('Remove ' + it.name + '? Its pledges will also be deleted.')) return;
          try { await adminApi('/items/' + it.id, { method: 'DELETE' }); say(it.name + ' removed.'); await load(); }
          catch (ex) { say(ex.message); }
        } }, 'Remove'))));
  });

  const n = { name: '', unit: 'each', qty: 0, size: 1, measure: 'unit' };
  const addRow = h('tr', null,
    h('td', null, h('input', { placeholder: 'New item, e.g. Rice', 'aria-label': 'New item name', oninput: (e) => { n.name = e.target.value; } })),
    h('td', null, h('input', { value: 'each', 'aria-label': 'New item unit', oninput: (e) => { n.unit = e.target.value; } })),
    h('td', null, measureSel('unit', (e) => { n.measure = e.target.value; }, 'New item measure')),
    h('td', null, h('input', { type: 'number', min: '0', step: '0.1', value: '1', 'aria-label': 'New item size', oninput: (e) => { n.size = parseFloat(e.target.value) || 1; } })),
    h('td', null, h('input', { type: 'number', min: '0', value: '0', 'aria-label': 'New item target', oninput: (e) => { n.qty = Math.round(parseFloat(e.target.value) || 0); } })),
    h('td', { text: '–' }), h('td', { text: '–' }),
    h('td', null, h('button', { class: 'btn small', type: 'button', onclick: async () => {
      try { await adminApi('/items', { method: 'POST', body: JSON.stringify(n) }); say(n.name + ' added.'); await load(); }
      catch (ex) { say(ex.message); }
    } }, 'Add item')));

  return h('section', { class: 'panel' }, h('h2', { text: 'Wish list items' }),
    h('p', { class: 'muted', style: 'margin:-.4rem 0 .75rem;font-size:.92rem',
      text: 'Measure: kg or litres sets the target by weight or volume, and Size is how much one unit holds (2 for a 2kg pack). Units and Packs are counts (soap bars, packs of pads). "Choose only" means donors just tick it, with no amount (clothes, toys). Target 0 means no target. "Extra received" is for donations that arrive without a pledge.' }),
    h('div', { class: 'scroll' }, h('table', { class: 'items-table' },
      h('thead', null, h('tr', null, ['Item', 'Unit name', 'Measure', 'Size', 'Target', 'Extra received', 'Pledged', ''].map((t) => h('th', { text: t })))),
      h('tbody', null, rows, addRow))));
}

function pledgesPanel() {
  const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const rows = data.pledges.map((p) => h('tr', null,
    h('td', { text: fmt.format(new Date(p.createdAt)) }),
    h('td', null, h('div', { text: p.name + (p.showName ? '' : ' (name hidden)') }),
      p.ref ? h('div', { class: 'muted', style: 'font-size:.85rem', text: 'Ref ' + p.ref }) : null),
    h('td', null,
      p.phone ? h('div', null, h('a', { href: 'tel:' + p.phone.replace(/[^0-9+]/g, ''), text: p.phone })) : null,
      p.email ? h('div', null, h('a', { href: 'mailto:' + p.email, text: p.email })) : null,
      !p.phone && !p.email ? '–' : null),
    h('td', { text: p.measure === 'choice' ? p.item + ' (any amount)' : p.qty + ' × ' + p.item + (p.measure === 'kg' || p.measure === 'L' ? ' (' + round1(p.qty * p.size) + ' ' + p.measure + ')' : '') }),
    h('td', null, h('select', { 'aria-label': 'Status for ' + p.name, onchange: async (e) => {
      try { await adminApi('/pledges/' + p.id, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }); say('Pledge marked ' + e.target.value + '.'); await load(); }
      catch (ex) { say(ex.message); }
    } }, ['pledged', 'received', 'cancelled'].map((s) => {
      const o = h('option', { value: s, text: s[0].toUpperCase() + s.slice(1) }); if (s === p.status) o.selected = true; return o;
    }))),
    h('td', null, h('button', { class: 'btn danger', type: 'button', onclick: async () => {
      if (!confirm('Delete this pledge from ' + p.name + '?')) return;
      try { await adminApi('/pledges/' + p.id, { method: 'DELETE' }); say('Pledge deleted.'); await load(); }
      catch (ex) { say(ex.message); }
    } }, 'Delete'))));

  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', { text: 'Pledges' }),
      h('button', { class: 'btn ghost small', type: 'button', onclick: exportCsv }, 'Download CSV')),
    data.pledges.length
      ? h('div', { class: 'scroll' }, h('table', { class: 'pledges-table' },
          h('thead', null, h('tr', null, ['When', 'Name', 'Contact', 'Pledge', 'Status', ''].map((t) => h('th', { text: t })))),
          h('tbody', null, rows)))
      : h('p', { class: 'muted', text: 'No pledges yet. Share the link to get started.' }));
}

async function exportCsv() {
  try {
    const res = await fetch('/api/admin/pledges.csv', { headers: { 'x-admin-key': key } });
    if (!res.ok) throw new Error('Could not download the CSV.');
    const url = URL.createObjectURL(await res.blob());
    const a = h('a', { href: url, download: 'musikana-pledges.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (ex) { say(ex.message); }
}

function render() {
  const withTarget = data.items.filter((it) => it.qty > 0);
  const reached = withTarget.filter((it) => itemStats(it).pledged >= it.qty).length;
  const active = data.pledges.filter((p) => p.status !== 'cancelled');
  const lines = active.length, got = active.filter((p) => p.status === 'received').length;
  const donors = new Set(active.map((p) => p.name.trim().toLowerCase())).size;

  root.textContent = '';
  root.append(
    h('header', { style: 'padding-bottom:0' },
      h('div', { class: 'panel-head' }, logo(),
        h('div', { class: 'row-actions', style: 'margin:0' },
          data.publicUrl ? h('a', { class: 'btn ghost small', href: data.publicUrl, target: '_blank', rel: 'noopener' }, 'View public page') : null,
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => { sessionStorage.removeItem(KEY); key = ''; loginView(); } }, 'Sign out'))),
      h('h1', { style: 'font-size:clamp(1.8rem,5vw,2.4rem)', text: 'Wish list admin' }),
      h('div', { class: 'stats' },
        h('div', null, reached + ' / ' + withTarget.length, h('small', { text: 'targets reached' })),
        h('div', null, got + ' / ' + lines, h('small', { text: 'pledges received' })),
        h('div', null, String(donors), h('small', { text: 'donors' }))),
      h('p', { id: 'status', class: 'status', role: 'status', 'aria-live': 'polite', text: status })),
    trackerPanel(), pledgesPanel(), itemsPanel(), settingsPanel());
}

if (key) load(); else loginView();
