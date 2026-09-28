const $ = (id) => document.getElementById(id);

async function call(method, path, body, headers = {}) {
  const started = performance.now();
  let status = 0;
  let data;
  try {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = res.status;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
  } catch (err) {
    data = String(err);
  }
  const ms = Math.round(performance.now() - started);
  log({ method, path, status, ms, data, headers });
  return { status, data, ms };
}

function log({ method, path, status, ms, data, headers }) {
  const entries = $('entries');
  entries.querySelector('.empty')?.remove();
  const entry = document.createElement('div');
  entry.className = 'entry';
  const key = headers['Idempotency-Key'] ? ` · key ${headers['Idempotency-Key'].slice(0, 8)}…` : '';
  entry.innerHTML = `
    <div class="meta">
      <strong class="s${String(status)[0]}">${status || 'ERR'}</strong>
      <span>${method} ${path}</span>
      <span class="elapsed">${ms} ms${key}</span>
    </div>
    <pre></pre>`;
  entry.querySelector('pre').textContent = JSON.stringify(data, null, 2);
  entries.prepend(entry);
}

async function busy(button, fn) {
  button.disabled = true;
  try { await fn(); } finally { button.disabled = false; }
}

const paymentBody = () => ({ amount: Number($('amount').value), currency: $('currency').value });
const paymentHeaders = () => ($('key').value ? { 'Idempotency-Key': $('key').value } : {});
const newKey = () => { $('key').value = crypto.randomUUID(); };

$('login').onclick = (e) => busy(e.target, async () => {
  const { status, data } = await call('POST', '/auth/login-integration', { token: $('jwt').value.trim() });
  if (status === 200) $('integrationToken').value = data.integrationToken;
});

$('redeem').onclick = (e) => busy(e.target, () =>
  call('POST', '/auth/redeem', { token: $('integrationToken').value.trim() }));

$('newKey').onclick = newKey;

$('pay').onclick = (e) => busy(e.target, () =>
  call('POST', '/payments', paymentBody(), paymentHeaders()));

$('payConcurrent').onclick = (e) => busy(e.target, async () => {
  const summary = $('summary');
  summary.style.display = 'block';
  summary.textContent = 'Enviando 3 requests en paralelo…';
  const started = performance.now();
  const results = await Promise.all([1, 2, 3].map(() =>
    call('POST', '/payments', paymentBody(), paymentHeaders())));
  const total = Math.round(performance.now() - started);
  const statuses = results.map((r) => r.status).join(', ');
  const refs = new Set(results.map((r) => r.data?.coreReference).filter(Boolean));
  summary.innerHTML = refs.size === 1
    ? `✅ Estados: ${statuses} · <strong>1 solo coreReference</strong> (${[...refs][0].slice(0, 8)}…) · ${total} ms en total`
    : `Estados: ${statuses} · coreReference distintos: ${refs.size} · ${total} ms`;
});

$('clear').onclick = () => { $('entries').innerHTML = '<p class="empty">Todavía no hay requests.</p>'; };

newKey();
