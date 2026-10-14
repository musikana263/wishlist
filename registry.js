const root = document.getElementById('root');
const WHATSAPP_DEFAULT = '0787749494';
let data = null;
let step = 'choose';          // 'choose' -> 'contact' -> 'done'
const cart = new Map();       // itemId -> qty
const contact = { name: '', phone: '', email: '', show: true };
let notice = '';              // message shown on the choose step (e.g. after a conflict)
let result = null;            // server reply after a successful pledge

const leftFor = (it) => itemStats(it).left;
const cartCount = () => [...cart.values()].reduce((a, b) => a + b, 0);
const toTop = () => window.scrollTo({ top: 0, behavior: 'auto' });

async function load() {
  try {
    data = await api('/api/registry');
    document.title = 'Wish list for ' + data.settings.home;
    clampCart();
    render();
  } catch (e) {
    root.textContent = '';
    root.appendChild(h('p', { class: 'error', text: 'The wish list could not load. Check your connection and refresh the page.' }));
  }
}

// Drop anything that was removed from the list after a refresh
function clampCart() {
  for (const id of [...cart.keys()]) if (!data.items.some((i) => i.id === id)) cart.delete(id);
}
const MAX_QTY = 999;

function waLink(text) {
  // Accepts 0787749494 or 263787749494; WhatsApp links need the country code
  let num = String(data.settings.whatsapp || WHATSAPP_DEFAULT).replace(/[^0-9]/g, '');
  if (num.startsWith('0')) num = '263' + num.slice(1);
  return num ? 'https://wa.me/' + num + '?text=' + encodeURIComponent(text) : null;
}

function headerBlock() {
  const s = data.settings;
  return h('header', null, logo(),
    h('h1', { text: 'Wish list for ' + s.home }),
    h('p', { class: 'intro', text: s.intro }),
    h('dl', { class: 'facts' },
      h('div', null, h('dt', { text: 'Visit' }), h('dd', { text: s.visitDate })),
      h('div', null, h('dt', { text: 'Drop off by' }), h('dd', { text: s.deadline }))));
}

/* ---------- Received vs pledged (whole campaign) ---------- */
function receivedBlock() {
  const r = receivedShare(data.items);
  if (!r.items) return h('p', { class: 'muted received-line', text: 'Received vs pledged: nothing pledged yet.' });
  return h('div', { class: 'received-block' },
    h('div', { class: 'received-head' }, h('h3', { text: r.pct + '% received' }), h('p', { class: 'muted', text: 'of everything pledged so far' })),
    progressBar(r.pct, 100, 'Received compared with pledged', 'big-bar received-bar'));
}

/* ---------- Countdown to the end of the campaign ---------- */
function countdown() {
  const end = data.settings.endDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end || '')) return null;
  const [y, m, d] = end.split('-').map(Number);
  const now = new Date(), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((Date.UTC(y, m - 1, d) - today) / 86400000);
  const text = days > 1 ? days + ' days to go' : days === 1 ? '1 day to go' : days === 0 ? 'Final day!' : 'Campaign closed';
  return h('p', { class: 'countdown', text });
}

/* ---------- Step 1: choose items ---------- */
// Select-only items (clothes, toys...): a simple on/off choice, no quantity
function chooser(it, li) {
  const btn = h('button', { class: 'btn choose', type: 'button', 'aria-pressed': String(cart.has(it.id)) });
  const sync = () => {
    const on = cart.has(it.id);
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '✓ Added' : 'I’ll give this';
    li.classList.toggle('selected', on);
    updateNextBar();
  };
  btn.addEventListener('click', () => { if (cart.has(it.id)) cart.delete(it.id); else cart.set(it.id, 1); sync(); });
  setTimeout(sync, 0);
  return btn;
}

function stepper(it, li) {
  const left = MAX_QTY;
  const input = h('input', { type: 'number', min: '0', max: String(MAX_QTY), inputmode: 'numeric', value: String(cart.get(it.id) || 0), 'aria-label': 'Quantity of ' + it.name });
  const eq = hasMeasure(it) ? h('span', { class: 'eq' }) : null;
  const showEq = (q) => { if (eq) eq.textContent = q ? '= ' + fmtAmt(it, amt(it, q)) : ''; };
  const set = (q) => {
    q = Math.max(0, Math.min(left, parseInt(q, 10) || 0));
    if (q) cart.set(it.id, q); else cart.delete(it.id);
    input.value = String(q);
    showEq(q);
    li.classList.toggle('selected', q > 0);
    minus.disabled = q <= 0; plus.disabled = q >= left;
    updateNextBar();
  };
  const minus = h('button', { class: 'step-btn', type: 'button', 'aria-label': 'One less ' + it.name, onclick: () => set((cart.get(it.id) || 0) - 1) }, '−');
  const plus = h('button', { class: 'step-btn', type: 'button', 'aria-label': 'One more ' + it.name, onclick: () => set((cart.get(it.id) || 0) + 1) }, '+');
  input.addEventListener('change', () => set(input.value));
  minus.disabled = !(cart.get(it.id) > 0); plus.disabled = (cart.get(it.id) || 0) >= left;
  showEq(cart.get(it.id) || 0);
  return h('div', { class: 'stepper' }, eq, minus, input, plus);
}

let nextBar = null;
function updateNextBar() {
  if (!nextBar) return;
  const n = cart.size;
  nextBar.querySelector('.nb-text').textContent = n ? n + ' item' + (n === 1 ? '' : 's') + ' selected' : 'Choose what you’d like to give';
  nextBar.querySelector('button').disabled = !n;
}

function chooseView() {
  const s = data.settings;
  const withTarget = data.items.filter((it) => it.qty > 0);
  const shares = withTarget.map((it) => Math.min(itemStats(it).pledged / it.qty, 1));
  const pct = shares.length ? Math.round((shares.reduce((x, y) => x + y, 0) / shares.length) * 100) : 0;
  const reached = shares.filter((x) => x >= 1).length;

  const items = data.items.map((it) => {
    const st = itemStats(it);
    const li = h('li', { class: 'item' + (cart.get(it.id) ? ' selected' : '') });
    const status = isChoice(it)
      ? (st.pledged ? fmtAmt(it, st.pledged) + ' giving this so far' : 'Give any amount you can')
      : !st.target
      ? (st.pledged ? fmtAmt(it, st.pledged) + ' pledged so far. Every bit helps.' : 'No target. Give as much as you like.')
      : st.left ? fmtAmt(it, st.left) + ' more to reach our target' : 'Target reached! More is still welcome.';
    li.append(
      h('div', null, h('h3', { text: it.name }), isChoice(it) ? h('p', { class: 'sub', text: 'Any amount' }) : ''),
      st.target ? h('div', { class: 'count' }, String(round1(st.pledged)), h('small', { text: ' / ' + fmtAmt(it, st.target) }))
                : h('div', { class: 'count' }, st.pledged && !isChoice(it) ? fmtAmt(it, st.pledged) : ''),
      st.target ? trackBar(it, st) : '',
      h('div', { class: 'act' },
        h('span', { class: st.target && !st.left ? 'done' : 'muted', text: status }),
        isChoice(it) ? chooser(it, li) : stepper(it, li)));
    return li;
  });

  const cashLink = waLink('Hi! I would like to donate to the Musikana Foundation visit to ' + s.home + '.');
  nextBar = h('div', { class: 'nextbar' },
    h('span', { class: 'nb-text' }),
    h('button', { class: 'btn', type: 'button', onclick: () => { notice = ''; step = 'contact'; render(); toTop(); } }, 'Next'));

  const frag = [
    headerBlock(),
    h('div', { class: 'overall' }, h('div', null, h('h2', { text: pct + '% of our targets' }), h('p', { text: reached + ' of ' + withTarget.length + ' targets reached' })), countdown()),
    progressBar(pct, 100, 'Overall progress toward targets', 'big-bar'),
    receivedBlock(),
    notice ? h('p', { class: 'flash warn', role: 'alert', text: notice }) : null,
    data.items.length
      ? [h('p', { class: 'steps', text: 'Step 1 of 2: choose items and how many, then tap Next. Our targets are preliminary, so give as much as you like.' }),
         h('div', { class: 'legend', style: 'margin-bottom:.75rem' }, h('span', { class: 'key key-p' }, 'Pledged'), h('span', { class: 'key key-r' }, 'Received'), h('span', { class: 'key key-t' }, 'Target')),
         h('ul', { class: 'items' }, items)]
      : h('p', { class: 'muted', text: 'The wish list is being prepared. Check back soon.' }),
    h('section', { class: 'block' }, h('h2', { text: 'Prefer to give money?' }),
      cashLink ? h('p', { style: 'margin:0' }, h('a', { class: 'btn', href: cashLink, target: '_blank', rel: 'noopener' }, 'Message us on WhatsApp')) : null),
    data.donors.length ? h('section', { class: 'block' }, h('h2', { text: 'Thank you to' }),
      h('ul', { class: 'thanks' }, data.donors.map((d) => h('li', { text: d })))) : null,
    h('footer', null, 'Musikana Foundation, Victoria Falls. Pledged items are delivered directly to ' + s.home + '.'),
    data.items.length ? nextBar : null,
  ];
  setTimeout(updateNextBar, 0);
  return frag;
}

/* ---------- Step 2: contact details ---------- */
function summaryList() {
  return h('ul', { class: 'summary' }, [...cart].map(([id, q]) => {
    const it = data.items.find((i) => i.id === id);
    if (!it) return null;
    if (isChoice(it)) return h('li', null, h('span', { text: it.name }), h('strong', { text: 'Any amount' }));
    return h('li', null, h('span', { text: it.name + ' (' + it.unit + ')' }), h('strong', { text: '× ' + q + (hasMeasure(it) ? ' = ' + fmtAmt(it, amt(it, q)) : '') }));
  }));
}

function contactView() {
  const err = h('p', { class: 'error', role: 'alert' });
  const bind = (k) => (e) => { contact[k] = e.target.value; };
  const name = h('input', { id: 'c-name', value: contact.name, maxlength: '60', autocomplete: 'name', required: true, oninput: bind('name') });
  const phone = h('input', { id: 'c-phone', type: 'tel', value: contact.phone, maxlength: '20', autocomplete: 'tel', oninput: bind('phone') });
  const email = h('input', { id: 'c-email', type: 'email', value: contact.email, maxlength: '120', autocomplete: 'email', oninput: bind('email') });
  const show = h('input', { type: 'checkbox', checked: contact.show, onchange: (e) => { contact.show = e.target.checked; } });
  const trap = h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Confirm pledge');

  const form = h('form', { class: 'contact', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    const n = contact.name.trim(), p = contact.phone.trim(), m = contact.email.trim();
    if (!n) { err.textContent = 'Enter your name.'; name.focus(); return; }
    if (!p && !m) { err.textContent = 'Give us a phone number or an email address so we can reach you.'; phone.focus(); return; }
    if (p && !/^[0-9+\s-]{7,20}$/.test(p)) { err.textContent = 'Check the phone number.'; phone.focus(); return; }
    if (m && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) { err.textContent = 'Check the email address.'; email.focus(); return; }
    submit.disabled = true; submit.textContent = 'Saving…';
    try {
      result = await api('/api/pledges', { method: 'POST', body: JSON.stringify({
        name: n, phone: p, email: m, showName: contact.show, website: trap.value,
        items: [...cart].map(([itemId, qty]) => ({ itemId, qty })) }) });
      step = 'done'; cart.clear();
      data = await api('/api/registry').catch(() => data);
      render(); toTop();
    } catch (ex) {
      if (ex.status === 409) {
        notice = ex.message;
        data = await api('/api/registry').catch(() => data);
        clampCart(); step = 'choose'; render(); toTop();
        return;
      }
      err.textContent = ex.message;
      submit.disabled = false; submit.textContent = 'Confirm pledge';
    }
  } },
    h('div', null, h('label', { for: 'c-name', text: 'Full name' }), name),
    h('div', { class: 'grid2' },
      h('div', null, h('label', { for: 'c-phone', text: 'Phone or WhatsApp' }), phone),
      h('div', null, h('label', { for: 'c-email', text: 'Email' }), email)),
    h('p', { class: 'muted', style: 'margin:0;font-size:.92rem', text: 'Give us at least one way to reach you. Only the Musikana Foundation team sees your contact details.' }),
    h('label', { class: 'check' }, show, 'Show my name on the thank-you list'),
    h('div', { class: 'hp', 'aria-hidden': 'true' }, trap),
    err,
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { step = 'choose'; render(); toTop(); } }, 'Back'),
      submit));

  setTimeout(() => name.focus({ preventScroll: true }), 0);
  return [
    h('header', null, logo(), h('p', { class: 'steps', style: 'margin-top:1.25rem', text: 'Step 2 of 2' }), h('h1', { text: 'Your contact details' }),
      h('p', { class: 'intro', text: 'Add your details so we know who is giving.' })),
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', { text: 'You’re pledging' }),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { step = 'choose'; render(); toTop(); } }, 'Change')),
      summaryList()),
    h('section', { class: 'panel' }, form),
  ];
}

/* ---------- Done ---------- */
function doneView() {
  const s = data.settings;
  return [
    h('header', null, logo(),
      h('h1', { text: 'Thank you, ' + contact.name.trim().split(/\s+/)[0] + '!' }),
      h('p', { class: 'intro', text: 'Your pledge is saved. Please drop off your items by ' + s.deadline + '.' })),
    h('section', { class: 'panel' }, h('h2', { text: 'Your pledge' }),
      h('ul', { class: 'summary' }, (result.items || []).map((it) => isChoice(it)
        ? h('li', null, h('span', { text: it.name }), h('strong', { text: 'Any amount' }))
        : h('li', null, h('span', { text: it.name + ' (' + it.unit + ')' }), h('strong', { text: '× ' + it.qty + (hasMeasure(it) ? ' = ' + fmtAmt(it, amt(it, it.qty)) : '') })))),
      result.ref ? h('p', { class: 'muted', style: 'margin:.75rem 0 0', text: 'Your reference: ' + result.ref }) : null),
    h('dl', { class: 'facts' },
      h('div', null, h('dt', { text: 'Drop off by' }), h('dd', { text: s.deadline }))),
    h('div', { class: 'row-actions', style: 'margin-top:2rem' },
      h('button', { class: 'btn', type: 'button', onclick: () => { step = 'choose'; result = null; render(); toTop(); } }, 'Back to the wish list')),
  ];
}

function render() {
  nextBar = null;
  root.textContent = '';
  root.classList.toggle('has-nextbar', step === 'choose');
  const view = step === 'contact' ? contactView() : step === 'done' ? doneView() : chooseView();
  root.append(...view.flat().filter(Boolean));
}

async function refreshQuietly() {
  if (step !== 'choose' || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
  try { data = await api('/api/registry'); clampCart(); const y = window.scrollY; render(); window.scrollTo(0, y); } catch { /* keep current view */ }
}

load();
setInterval(refreshQuietly, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshQuietly(); });
