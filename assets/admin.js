(() => {
  const $ = id => document.getElementById(id);
  const STORE_KEY = 'kaam-admin-refresh';
  let token = '', refreshToken = '', renewal = null, authVersion = 0, otpSent = false, busy = false, view = 'overview';
  let proofs = [], auditPage = 0;
  const loaded = new Set();
  const views = {
    overview: ['Operations overview', 'What needs attention today, from live records.'],
    payments: ['Payment reviews', 'Match each transfer to the bank record before a job goes live.'],
    reports: ['Venue reports', 'Worker concerns about venues, fee requests first.'],
    disputes: ['Contact disputes', 'Employers who could not reach a consenting worker.'],
    users: ['People', 'Workers and venues, with their history and controls.'],
    jobs: ['Jobs', 'Every post, its payment and its applications.'],
    organisations: ['Head offices', 'Chains, their branches and their monthly plan.'],
    audit: ['Audit log', 'Who changed what, and why.'],
  };
  const roleNames = { FAST_FOOD_COOK: 'Fast food cook', CONTINENTAL_COOK: 'Line cook', TANDOORCHI: 'Tandoorchi', WAITER: 'Waiter', DISHWASHER: 'Dishwasher', BARISTA: 'Barista', HELPER: 'Helper', CASHIER: 'Cashier', SHELF_PACKER: 'Shelf packer', LOADER: 'Loader', DELIVERY_RIDER: 'Delivery rider', PHARMACY_ASSISTANT: 'Pharmacy assistant' };
  const reasons = { fee_asked: 'Asked the worker for money', salary_lie: 'Salary did not match', shift_changed: 'Shift changed', seat_filled: 'Seat already filled', theek: 'Worker reported a good experience' };
  const jobStates = { ACTIVE: ['Live', 'green'], PENDING_PAYMENT: ['Awaiting payment', 'amber'], PAUSED_PROBATION: ['Hired · probation', 'blue'], CLOSED: ['Closed', ''], EXPIRED: ['Expired', ''] };
  const workerStates = { ACTIVE: ['Available', 'green'], INACTIVE: ['Not seeking', ''], ONBOARDING: ['Onboarding', 'amber'], UNDER_REVIEW: ['Under review', 'amber'], BANNED: ['Suspended', 'red'], DELETED: ['Deleted', ''] };
  const money = value => Number(value || 0).toLocaleString('en-PK');
  const when = value => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Karachi' }).format(new Date(value)) : '—';
  $('today').dataset.localizedDate = new Date().toISOString();
  $('today').textContent = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Asia/Karachi' }).format(new Date());

  function node(tag, text, className, attributes = {}) {
    const el = document.createElement(tag);
    if (text !== undefined && text !== null) el.textContent = text;
    if (className) el.className = className;
    for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
    return el;
  }
  // Names, venues, references and phones are user data and must never be translated.
  const data = (tag, text, className) => { const el = node(tag, text, className); el.dataset.noTranslate = ''; return el; };
  const pill = (text, tone = '') => node('span', text, 'pill' + (tone ? ' pill-' + tone : ''));
  function button(label, kind, onClick, aria) {
    const el = node('button', label, 'button ops-button ' + (kind === 'primary' ? 'button-primary' : kind === 'danger' ? 'button-danger' : 'button-secondary'), { type: 'button' });
    if (aria) el.setAttribute('aria-label', aria);
    el.addEventListener('click', onClick);
    return el;
  }
  function empty(list, title, message) {
    const box = node('div', undefined, 'ops-empty'); box.append(node('strong', title), node('p', message)); list.replaceChildren(box);
  }
  function skeleton(list, rows = 3) { list.replaceChildren(...Array.from({ length: rows }, () => node('div', undefined, 'ops-skeleton', { 'aria-hidden': 'true' }))); list.setAttribute('aria-busy', 'true'); }
  function setStatus(text) { $('view-status').textContent = text || ''; }
  function setError(text) { $('view-error').textContent = text || ''; $('view-error').hidden = !text; }

  function remember() { try { refreshToken ? sessionStorage.setItem(STORE_KEY, refreshToken) : sessionStorage.removeItem(STORE_KEY); } catch { /* Private mode: the session simply ends on reload. */ } }
  function signedOut() {
    authVersion++; token = ''; refreshToken = ''; renewal = null; proofs = []; loaded.clear(); remember();
    $('account-label').textContent = 'Admin access'; $('logout').hidden = $('mobile-logout').hidden = true;
    document.querySelectorAll('[data-count]').forEach(el => { el.hidden = true; });
    render();
  }
  async function api(path, body, authenticated = true, method) {
    const version = authVersion, sentToken = token;
    const unchanged = () => { if (authenticated && version !== authVersion) throw new Error('Account changed.'); };
    const once = credential => {
      const headers = {}; if (authenticated && credential) headers.authorization = 'Bearer ' + credential;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return fetch(path, { method: method || (body === undefined ? 'GET' : 'POST'), headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), cache: 'no-store' });
    };
    let response = await once(sentToken); unchanged();
    if (authenticated && response.status === 401 && sentToken !== token) { response = await once(token); unchanged(); }
    if (authenticated && response.status === 401 && refreshToken) {
      await renew(); unchanged(); response = await once(token); unchanged();
    }
    if (response.status === 204) return {};
    let payload; try { payload = await response.json(); } catch { throw new Error('The server did not answer. Try again.'); }
    unchanged();
    if (!response.ok) {
      if (authenticated && response.status === 401) { signedOut(); $('login-error').textContent = 'Your session ended. Sign in again.'; }
      throw new Error(payload.sentence || 'Try again.');
    }
    return payload;
  }
  function renew() {
    return renewal ||= (async () => {
      try {
        const current = refreshToken;
        const refreshed = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: current }), signal: AbortSignal.timeout(15000), cache: 'no-store' });
        if (refreshed.status === 401) { signedOut(); throw new Error('Your session ended. Sign in again.'); }
        if (!refreshed.ok) throw new Error('Could not connect. Try again.');
        const credentials = await refreshed.json();
        if (!credentials.access_token || !credentials.refresh_token || credentials.role !== 'ADMIN') { signedOut(); throw new Error('Sign in again.'); }
        token = credentials.access_token; refreshToken = credentials.refresh_token; remember();
      } finally { renewal = null; }
    })();
  }
  const errorText = error => error.name === 'TimeoutError' || error.name === 'TypeError' ? 'Could not connect. Try again.' : error.message;

  // ---------- dialogs ----------
  function ask({ title, body, confirm = 'Confirm', danger = false, reason = false, reasonLabel = 'Reason', action }) {
    const dialog = $('ops-dialog');
    $('dialog-title').textContent = title;
    $('dialog-body').replaceChildren(...(Array.isArray(body) ? body : [node('p', body)]));
    $('dialog-reason-field').hidden = !reason; $('dialog-reason').value = ''; $('dialog-reason-label').textContent = reasonLabel; $('dialog-reason').required = reason;
    $('dialog-error').textContent = '';
    const confirmButton = $('dialog-confirm');
    confirmButton.textContent = confirm; confirmButton.className = 'button ops-button ' + (danger ? 'button-danger' : 'button-primary'); confirmButton.disabled = false;
    return new Promise(resolve => {
      const submit = async event => {
        event.preventDefault();
        const text = $('dialog-reason').value.trim();
        if (reason && text.length < 3) { $('dialog-error').textContent = 'Write a short reason (at least 3 characters).'; $('dialog-reason').focus(); return; }
        confirmButton.disabled = true; $('dialog-error').textContent = '';
        try { await action(text); cleanup(); dialog.close(); resolve(true); }
        catch (error) { $('dialog-error').textContent = errorText(error); confirmButton.disabled = false; }
      };
      const cancel = () => { cleanup(); dialog.close(); resolve(false); };
      const cleanup = () => { $('dialog-form').removeEventListener('submit', submit); $('dialog-cancel').removeEventListener('click', cancel); dialog.removeEventListener('cancel', cancel); };
      $('dialog-form').addEventListener('submit', submit); $('dialog-cancel').addEventListener('click', cancel); dialog.addEventListener('cancel', cancel);
      dialog.showModal(); (reason ? $('dialog-reason') : $('dialog-cancel')).focus();
    });
  }
  $('detail-close').addEventListener('click', () => $('detail-dialog').close());

  // ---------- views ----------
  function render() {
    const signedIn = Boolean(token);
    document.querySelectorAll('[data-view]').forEach(el => { if (el.dataset.view === view) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
    $('view-title').textContent = views[view][0]; $('view-subtitle').textContent = views[view][1];
    $('breadcrumb-label').textContent = views[view][0];
    document.title = 'Kaam operations — ' + views[view][0];
    $('signin-panel').hidden = signedIn; $('workspace-views').hidden = !signedIn;
    document.querySelectorAll('[data-panel]').forEach(el => { el.hidden = el.dataset.panel !== view; });
  }
  function go(next) {
    view = next; setStatus(''); setError(''); render();
    if (token && !loaded.has(view)) load(view);
  }
  document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => go(el.dataset.view)));
  document.querySelectorAll('[data-refresh]').forEach(el => el.addEventListener('click', () => { loaded.delete(view); load(view); }));

  const loaders = { overview: loadOverview, payments: loadPayments, reports: loadReports, disputes: loadDisputes, users: () => searchUsers(), jobs: () => searchJobs(), organisations: loadOrganisations, audit: () => loadAudit(true) };
  async function load(name) {
    const version = authVersion; setError('');
    try { await loaders[name](); loaded.add(name); }
    catch (error) { if (version === authVersion) setError(errorText(error)); }
  }

  async function loadOverview() {
    const grid = $('metrics'); grid.replaceChildren(...Array.from({ length: 8 }, () => node('div', undefined, 'ops-skeleton', { 'aria-hidden': 'true' })));
    const m = await api('/api/admin/metrics');
    document.querySelectorAll('[data-count]').forEach(el => { const n = Number(m[el.dataset.count] || 0); el.textContent = n; el.hidden = n === 0; });
    const cards = [
      ['Payments to review', money(m.pending_payments), 'PKR ' + money(m.pending_amount_pkr) + ' waiting', m.pending_payments > 0],
      ['Fee reports open', money(m.pending_fee_reports), money(m.pending_reports) + ' reports in total', m.pending_fee_reports > 0],
      ['Live jobs', money(m.live_jobs), money(m.jobs_posted_7d) + ' posted in 7 days'],
      ['Available workers', money(m.active_workers), money(m.new_workers_7d) + ' joined in 7 days'],
      ['Applications · 7 days', money(m.applications_7d), money(m.contacts_7d) + ' contacts with consent'],
      ['Hires · 30 days', money(m.hires_30d), money(m.verified_venues) + ' venues with verified payment'],
      ['Verified · 30 days', 'PKR ' + money(m.verified_amount_30d), m.payment_review_hours_avg == null ? 'No reviews yet' : 'Average review ' + m.payment_review_hours_avg + ' h'],
      ['Invite acceptance', m.invite_acceptance_pct == null ? '—' : m.invite_acceptance_pct + '%', m.report_hours_avg == null ? 'No resolved reports yet' : 'Reports resolved in ' + m.report_hours_avg + ' h'],
    ];
    grid.replaceChildren(...cards.map(([label, value, note, alert]) => {
      const card = node('dl', undefined, 'metric' + (alert ? ' is-alert' : ''));
      card.append(node('dt', label), data('dd', value), node('small', note)); return card;
    }));
    const items = [
      ['payments', 'Payments waiting for review', 'Employers are waiting to go live.', m.pending_payments],
      ['reports', 'Fee reports', 'These venues are hidden until reviewed.', m.pending_fee_reports],
      ['reports', 'Other venue reports', 'Salary, shift or seat concerns.', Math.max(0, m.pending_reports - m.pending_fee_reports)],
      ['disputes', 'Contact disputes', 'Refund or reject once the worker has answered or 48 hours pass.', m.open_disputes],
    ].filter(item => item[3] > 0);
    const list = $('attention');
    if (!items.length) { empty(list, 'Nothing is waiting.', 'Queues are clear. New items will appear here.'); return; }
    list.replaceChildren(...items.map(([target, title, note, count]) => {
      const row = node('button', undefined, 'attention-item', { type: 'button' });
      const text = node('div'); text.append(node('strong', title), node('span', note));
      row.append(text, data('span', money(count), 'count')); row.addEventListener('click', () => go(target)); return row;
    }));
  }

  async function loadPayments() {
    skeleton($('payment-list'));
    proofs = (await api('/api/admin/pending-payments')).proofs || [];
    renderPayments();
  }
  function renderPayments() {
    const list = $('payment-list'); list.removeAttribute('aria-busy');
    const term = $('payment-search').value.toLowerCase().trim();
    const rows = proofs.filter(p => [p.brand_name, p.business_name, p.transaction_ref, roleNames[p.role], p.city].join(' ').toLowerCase().includes(term));
    if (!rows.length) { empty(list, term ? 'No matching payments.' : 'You’re all caught up.', term ? 'Try another venue name or reference.' : 'No payments are waiting for review.'); return; }
    list.replaceChildren(...rows.map(proof => {
      const row = node('article', undefined, 'ops-row');
      const venue = node('div'); venue.append(data('h3', proof.brand_name || 'Unnamed venue'), data('p', [proof.business_name, proof.area_name, proof.city].filter(Boolean).join(' · ')));
      const history = node('div', undefined, 'pills');
      history.append(pill(proof.verified_before ? proof.verified_before + ' verified before' : 'First payment', proof.verified_before ? 'green' : 'amber'));
      if (proof.rejected_before) history.append(pill(proof.rejected_before + ' rejected before', 'red'));
      const isPack = proof.target_kind === 'PACKAGE', isInvoice = proof.target_kind === 'INVOICE';
      if (proof.job_status !== 'PENDING_PAYMENT') history.append(pill(isInvoice ? 'Invoice is no longer open' : (isPack ? 'Pack is ' : 'Job is ') + (jobStates[proof.job_status]?.[0] || proof.job_status).toLowerCase(), 'red'));
      venue.append(history);
      const pay = seat => 'PKR ' + money(seat.salary_min) + (seat.salary_max ? ' – ' + money(seat.salary_max) : '+') + ' / month';
      const job = node('div');
      if (isInvoice) job.append(node('h3', 'Monthly plan · ' + proof.organisation_name), data('p', proof.invoice_credits + ' contacts for ' + proof.invoice_period_days + ' days, shared by every branch'));
      else if (isPack) job.append(node('h3', 'Batch pack · ' + proof.seat_count + ' roles'), ...(proof.seats || []).map(seat => data('p', (roleNames[seat.role] || seat.role) + ' · ' + pay(seat))));
      else job.append(node('h3', roleNames[proof.role] || proof.role), data('p', pay(proof)));
      const ref = node('div'); ref.append(data('p', proof.transaction_ref, 'mono'), data('p', 'PKR ' + money(proof.amount_pkr), 'amount'), node('small', 'Submitted ' + when(proof.created_at)));
      const actions = node('div', undefined, 'table-actions');
      if (proof.has_receipt) actions.append(button('Receipt', 'secondary', () => openReceipt(proof), 'Open receipt for ' + proof.brand_name));
      if (proof.google_maps_url) { const map = node('a', 'Map', 'button button-secondary ops-button', { href: proof.google_maps_url, target: '_blank', rel: 'noopener noreferrer' }); actions.append(map); }
      actions.append(
        button('Verify', 'primary', () => ask({
          title: 'Verify this payment?',
          body: [data('p', proof.brand_name + ' · ' + proof.transaction_ref + ' · PKR ' + money(proof.amount_pkr)), node('p', isInvoice ? 'Only verify after this transfer appears in the bank record. The monthly plan starts now, or right after the current month.' : isPack ? 'Only verify after this transfer appears in the bank record. Every role in the pack goes live and nearby workers are notified.' : 'Only verify after this transfer appears in the bank record. The job goes live and nearby workers are notified.')],
          confirm: isInvoice ? 'Verify payment' : 'Verify and publish',
          action: async () => { await api('/api/admin/verify-payment', { proof_id: proof.id, decision: 'VERIFIED' }); setStatus(isInvoice ? 'Payment verified. The monthly plan is paid.' : isPack ? 'Payment verified. Every role in the pack is now live.' : 'Payment verified. The job is now live.'); loaded.delete('overview'); loaded.delete('organisations'); await loadPayments(); },
        }), 'Verify payment for ' + proof.brand_name),
        button('Reject', 'danger', () => ask({
          title: 'Reject this payment?',
          body: [data('p', proof.brand_name + ' · ' + proof.transaction_ref), node('p', 'The job stays unpublished. The employer sees your reason and can submit a corrected transfer.')],
          confirm: 'Reject payment', danger: true, reason: true, reasonLabel: 'Reason shown to the employer',
          action: async text => { await api('/api/admin/verify-payment', { proof_id: proof.id, decision: 'REJECTED', reason: text }); setStatus('Payment rejected. The employer has been told why.'); loaded.delete('overview'); loaded.delete('organisations'); await loadPayments(); },
        }), 'Reject payment for ' + proof.brand_name),
      );
      row.append(venue, job, ref, actions); return row;
    }));
  }
  async function openReceipt(proof) {
    try {
      let response = await fetch('/api/admin/payments/' + encodeURIComponent(proof.id) + '/receipt', { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' });
      if (response.status === 401 && refreshToken) { await renew(); response = await fetch('/api/admin/payments/' + encodeURIComponent(proof.id) + '/receipt', { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' }); }
      if (!response.ok) throw new Error('The receipt could not be opened.');
      const url = URL.createObjectURL(await response.blob());
      const image = node('img', undefined, undefined, { src: url, alt: 'Payment receipt for ' + proof.transaction_ref }); image.style.maxWidth = '100%'; image.style.borderRadius = '10px';
      $('detail-title').textContent = 'Receipt'; $('detail-body').replaceChildren(image); $('detail-dialog').showModal();
      $('detail-dialog').addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
    } catch (error) { setError(errorText(error)); }
  }
  $('payment-search').addEventListener('input', renderPayments);

  async function loadReports() {
    const list = $('report-list'); skeleton(list);
    const reports = (await api('/api/admin/reports')).reports || []; list.removeAttribute('aria-busy');
    if (!reports.length) { empty(list, 'No reports awaiting review.', 'Worker reports will appear here when they need your attention.'); return; }
    list.replaceChildren(...reports.map(report => {
      const fee = report.reason === 'fee_asked';
      const row = node('article', undefined, 'ops-row' + (fee ? ' is-priority' : ''));
      const what = node('div'); what.append(node('h3', reasons[report.reason] || String(report.reason).replaceAll('_', ' ')));
      const tags = node('div', undefined, 'pills');
      if (fee) tags.append(pill(report.hidden_at ? 'Venue hidden' : 'Venue visible', report.hidden_at ? 'red' : 'amber'));
      tags.append(pill(report.venue_report_count + ' reports on this venue', report.venue_report_count > 1 ? 'amber' : ''));
      if (report.venue_upheld_count) tags.append(pill(report.venue_upheld_count + ' upheld before', 'red'));
      what.append(tags);
      const venue = node('div'); venue.append(data('h3', report.brand_name || 'Venue'), data('p', [roleNames[report.role], report.area_name, report.city].filter(Boolean).join(' · ')));
      const who = node('div'); who.append(data('p', report.reporter ? 'Reported by ' + report.reporter : 'Reporter removed their account'), node('small', when(report.created_at)));
      if (report.note) who.append(data('p', '“' + report.note + '”'));
      const actions = node('div', undefined, 'table-actions');
      actions.append(
        button('Uphold', 'primary', () => ask({ title: 'Uphold this report?', body: fee ? 'The venue stays hidden from workers.' : 'The report is recorded against this venue.', confirm: 'Uphold report',
          action: async () => { await api('/api/admin/reports/' + encodeURIComponent(report.id), { decision: 'UPHELD' }); setStatus('Report upheld.'); loaded.delete('overview'); await loadReports(); } })),
        button('Dismiss', 'secondary', () => ask({ title: 'Dismiss this report?', body: fee ? 'If no other fee report is open or upheld, the venue becomes visible to workers again.' : 'The report is closed without action.', confirm: 'Dismiss report',
          action: async () => { const result = await api('/api/admin/reports/' + encodeURIComponent(report.id), { decision: 'DISMISSED' }); setStatus(result.unhidden ? 'Report dismissed. The venue is visible again.' : 'Report dismissed.'); loaded.delete('overview'); await loadReports(); } })),
      );
      row.append(what, venue, who, actions); return row;
    }));
  }

  async function loadDisputes() {
    const list = $('dispute-list'); skeleton(list);
    const disputes = (await api('/api/admin/disputes')).disputes || []; list.removeAttribute('aria-busy');
    $('resolve-silent').disabled = !disputes.some(d => d.silent_window_passed);
    if (!disputes.length) { empty(list, 'No open disputes.', 'Disputes appear when an employer reports no response from a consenting worker.'); return; }
    list.replaceChildren(...disputes.map(dispute => {
      const row = node('article', undefined, 'ops-row');
      const venue = node('div'); venue.append(data('h3', dispute.brand_name), node('p', roleNames[dispute.role] || dispute.role));
      const worker = node('div'); worker.append(data('h3', dispute.full_name || 'Worker'), node('small', 'Consented ' + when(dispute.consented_at)));
      const state = node('div'); state.append(node('small', 'Worker asked ' + when(dispute.dispute_probe_sent_at)), pill(dispute.silent_window_passed ? '48 hours passed' : 'Waiting for worker', dispute.silent_window_passed ? 'amber' : 'blue'));
      row.append(venue, worker, state, node('div')); return row;
    }));
  }
  $('resolve-silent').addEventListener('click', () => ask({
    title: 'Refund silent disputes?', body: 'Every dispute where the worker has not answered within 48 hours is refunded to the employer, and that worker is marked as not seeking work.', confirm: 'Refund silent disputes',
    action: async () => { const result = await api('/api/admin/disputes/resolve-silent', {}); setStatus(result.refunded + ' disputes refunded.'); loaded.delete('overview'); await loadDisputes(); },
  }));

  async function searchUsers() {
    const list = $('user-list'); skeleton(list);
    const result = await api('/api/admin/users?q=' + encodeURIComponent($('user-search').value.trim())); list.removeAttribute('aria-busy');
    const users = result.users || [];
    if (!users.length) { empty(list, 'Nobody found.', 'Search by worker name, venue, business or at least 4 phone digits.'); return; }
    list.replaceChildren(...users.map(user => {
      const row = node('article', undefined, 'ops-row');
      const who = node('div'); who.append(data('h3', user.full_name || user.brand_name || 'Account'), data('p', user.phone_e164 || 'Deleted account', 'mono'));
      const roles = node('div', undefined, 'pills');
      if (user.candidate_id) { const [label, tone] = workerStates[user.candidate_status] || [user.candidate_status, '']; roles.append(pill('Worker · ' + label, tone)); }
      if (user.employer_id) roles.append(pill('Venue · ' + (user.hidden_at ? 'hidden' : user.is_verified ? 'payment verified' : 'no verified payment'), user.hidden_at ? 'red' : user.is_verified ? 'green' : ''));
      if (user.venue_reports) roles.append(pill(user.venue_reports + ' reports', 'amber'));
      const venue = node('div'); if (user.brand_name) venue.append(data('p', [user.brand_name, user.business_name].filter(Boolean).join(' · '))); venue.append(node('small', 'Joined ' + when(user.created_at)));
      const actions = node('div', undefined, 'table-actions'); actions.append(button('Open', 'secondary', () => openUser(user.id), 'Open ' + (user.full_name || user.brand_name || 'account')));
      row.append(who, roles, venue, actions); return row;
    }));
  }
  $('user-search-form').addEventListener('submit', event => { event.preventDefault(); load('users'); });

  async function openUser(id) {
    $('detail-title').textContent = 'Account'; $('detail-body').replaceChildren(node('div', undefined, 'ops-skeleton', { 'aria-hidden': 'true' })); $('detail-dialog').showModal();
    try {
      const detail = await api('/api/admin/users/' + encodeURIComponent(id));
      const user = detail.user;
      $('detail-title').textContent = user.full_name || user.brand_name || 'Account';
      const facts = node('dl', undefined, 'detail-facts');
      const fact = (label, value) => { if (value === undefined || value === null || value === '') return; facts.append(node('dt', label), data('dd', String(value))); };
      fact('Phone', user.phone_e164 || 'Deleted'); fact('Joined', when(user.created_at));
      if (user.candidate_id) { fact('Worker status', (workerStates[user.candidate_status] || [user.candidate_status])[0]); fact('Role', roleNames[user.primary_role]); fact('Area', [user.candidate_area, user.candidate_city].filter(Boolean).join(', ')); fact('Expected salary', user.expected_salary && 'PKR ' + money(user.expected_salary)); }
      if (user.employer_id) { fact('Venue', user.brand_name); fact('Business', user.business_name); fact('Venue area', [user.venue_area, user.venue_city].filter(Boolean).join(', ')); fact('Visibility', user.hidden_at ? 'Hidden since ' + when(user.hidden_at) : 'Visible'); fact('Upheld disputes', user.dispute_upheld_count); }
      const sections = [facts];
      const actions = node('div', undefined, 'detail-actions');
      const refresh = async message => { setStatus(message); await openUser(id); loaded.delete('users'); loaded.delete('overview'); };
      if (user.candidate_id && user.candidate_status !== 'DELETED') {
        if (user.candidate_status !== 'BANNED') actions.append(button('Suspend worker', 'danger', () => ask({ title: 'Suspend this worker?', body: 'They are removed from matching, their open applications and invites are closed and refunded, and they are signed out.', confirm: 'Suspend', danger: true, reason: true,
          action: async text => { await api('/api/admin/candidates/' + user.candidate_id + '/status', { status: 'BANNED', reason: text }); await refresh('Worker suspended.'); } })));
        if (!['UNDER_REVIEW', 'BANNED'].includes(user.candidate_status)) actions.append(button('Put under review', 'secondary', () => ask({ title: 'Put this worker under review?', body: 'They stop appearing to employers until reinstated.', confirm: 'Put under review', reason: true,
          action: async text => { await api('/api/admin/candidates/' + user.candidate_id + '/status', { status: 'UNDER_REVIEW', reason: text }); await refresh('Worker placed under review.'); } })));
        if (['UNDER_REVIEW', 'BANNED'].includes(user.candidate_status)) actions.append(button('Reinstate worker', 'primary', () => ask({ title: 'Reinstate this worker?', body: 'They can sign in and turn availability back on themselves.', confirm: 'Reinstate', reason: true,
          action: async text => { await api('/api/admin/candidates/' + user.candidate_id + '/status', { status: 'ACTIVE', reason: text }); await refresh('Worker reinstated.'); } })));
      }
      if (user.employer_id) actions.append(button(user.hidden_at ? 'Show venue again' : 'Hide venue', user.hidden_at ? 'primary' : 'danger', () => ask({
        title: user.hidden_at ? 'Show this venue again?' : 'Hide this venue?', body: user.hidden_at ? 'Its live jobs become visible to workers again.' : 'Workers stop seeing its jobs and its open invites are refunded.', confirm: user.hidden_at ? 'Show venue' : 'Hide venue', danger: !user.hidden_at, reason: true,
        action: async text => { await api('/api/admin/employers/' + user.employer_id + '/visibility', { hidden: !user.hidden_at, reason: text }); await refresh(user.hidden_at ? 'Venue visible again.' : 'Venue hidden.'); } })));
      if (detail.sessions.length) actions.append(button('Sign out everywhere', 'secondary', () => ask({ title: 'Sign this account out?', body: 'All ' + detail.sessions.length + ' active sessions end. They can sign in again with an OTP.', confirm: 'Sign out',
        action: async () => { await api('/api/admin/users/' + user.id + '/revoke-sessions', {}); await refresh('Sessions ended.'); } })));
      if (actions.childElementCount) sections.push(actions);
      const list = (title, rows, line) => { if (!rows.length) return; const box = node('section', undefined, 'detail-section'); const ul = node('ul'); rows.forEach(row => ul.append(data('li', line(row)))); box.append(node('h3', title), ul); sections.push(box); };
      list('Job posts', detail.jobs, job => [roleNames[job.role], (jobStates[job.status] || [job.status])[0], 'PKR ' + money(job.salary_min), job.unlocks_used + '/' + job.max_unlocks + ' contacts', when(job.created_at)].join(' · '));
      list('Applications and invites', detail.applications, app => [app.brand_name, roleNames[app.role], app.status, when(app.pre_consented_at || app.invited_at)].join(' · '));
      list('Reports about this venue', detail.reports, report => [reasons[report.reason] || report.reason, report.status, report.reporter || '', when(report.created_at)].filter(Boolean).join(' · '));
      list('Recent audit events', detail.audit, event => [event.event_name.replaceAll('_', ' '), event.metadata?.reason || '', when(event.created_at)].filter(Boolean).join(' · '));
      $('detail-body').replaceChildren(...sections);
    } catch (error) { $('detail-body').replaceChildren(node('p', errorText(error), 'form-error')); }
  }

  async function searchJobs() {
    const list = $('job-list'); skeleton(list);
    const query = new URLSearchParams({ q: $('job-search').value.trim(), status: $('job-status').value });
    const jobs = (await api('/api/admin/jobs?' + query)).jobs || []; list.removeAttribute('aria-busy');
    if (!jobs.length) { empty(list, 'No jobs found.', 'Try another status or search.'); return; }
    list.replaceChildren(...jobs.map(job => {
      const row = node('article', undefined, 'ops-row');
      const what = node('div'); what.append(node('h3', roleNames[job.role] || job.role), data('p', [job.brand_name, job.area_name, job.city].filter(Boolean).join(' · ')));
      const [label, tone] = jobStates[job.status] || [job.status, ''];
      const state = node('div', undefined, 'pills'); state.append(pill(label, tone));
      if (job.payment_status) state.append(pill('Payment ' + job.payment_status.toLowerCase(), job.payment_status === 'VERIFIED' ? 'green' : job.payment_status === 'PENDING' ? 'amber' : 'red'));
      if (job.hidden_at) state.append(pill('Venue hidden', 'red'));
      const numbers = node('div'); numbers.append(node('p', job.applications + ' applications · ' + job.unlocks_used + '/' + job.max_unlocks + ' contacts'), node('small', 'Posted ' + when(job.created_at)));
      const actions = node('div', undefined, 'table-actions');
      actions.append(button('Venue', 'secondary', () => openUser(job.employer_user_id), 'Open venue for ' + job.brand_name));
      if (['ACTIVE', 'PENDING_PAYMENT'].includes(job.status)) actions.append(button('Close', 'danger', () => ask({
        title: 'Close this job?', body: 'Workers stop seeing it, open invites are refunded and pending applications end.', confirm: 'Close job', danger: true,
        action: async () => { await api('/api/admin/jobs/' + job.id + '/close', {}); setStatus('Job closed.'); loaded.delete('overview'); await searchJobs(); },
      }), 'Close ' + (roleNames[job.role] || 'job') + ' at ' + job.brand_name));
      row.append(what, state, numbers, actions); return row;
    }));
  }
  $('job-search-form').addEventListener('submit', event => { event.preventDefault(); load('jobs'); });

  const retainerStates = { ACTIVE: ['Monthly plan live', 'green'], PENDING_PAYMENT: ['Awaiting first payment', 'amber'], LAPSED: ['Plan lapsed', 'red'] };
  async function loadOrganisations() {
    const list = $('organisation-list'); skeleton(list);
    const organisations = (await api('/api/admin/organisations')).organisations || []; list.removeAttribute('aria-busy');
    if (!organisations.length) { empty(list, 'No head offices yet.', 'An owner sets one up from their venue profile in the app.'); return; }
    list.replaceChildren(...organisations.map(org => {
      const row = node('article', undefined, 'ops-row');
      const who = node('div'); who.append(data('h3', org.name), data('p', org.owner_phone + ' · ' + org.branches + (org.branches === 1 ? ' branch · ' : ' branches · ') + org.live_jobs + (org.live_jobs === 1 ? ' live job' : ' live jobs'), 'mono'));
      const state = node('div', undefined, 'pills');
      const [label, tone] = retainerStates[org.retainer_status] || ['Pays per job', ''];
      state.append(pill(label, tone));
      if (org.open_invoice) state.append(pill('Invoice open · PKR ' + money(org.open_invoice.price_pkr), 'amber'));
      if (org.queued_months) state.append(pill(org.queued_months + ' month paid ahead', 'blue'));
      const numbers = node('div');
      if (org.retainer_status === 'ACTIVE') numbers.append(node('p', money(org.available) + ' contacts left · ' + money(org.held) + ' waiting'), node('small', 'Month ends ' + when(org.period_ends_at)));
      else numbers.append(node('small', 'Set up ' + when(org.created_at)));
      const actions = node('div', undefined, 'table-actions');
      if (org.open_invoice) actions.append(button('Cancel invoice', 'danger', () => ask({
        title: 'Cancel this invoice?', body: 'The head office can no longer pay it. You can issue a new one.', confirm: 'Cancel invoice', danger: true,
        action: async () => { await api('/api/admin/invoices/' + org.open_invoice.id + '/cancel', {}); setStatus('Invoice cancelled.'); await loadOrganisations(); },
      }), 'Cancel the open invoice for ' + org.name));
      else actions.append(button('Issue monthly invoice', 'primary', () => ask({
        title: 'Issue a monthly invoice?', body: org.name + ' pays it from Head office in the app. Once you verify the transfer, the month starts (or follows the current one).', confirm: 'Issue invoice',
        action: async () => { await api('/api/admin/organisations/' + org.id + '/invoices', {}); setStatus('Invoice issued. The head office has been notified.'); await loadOrganisations(); },
      }), 'Issue a monthly invoice for ' + org.name));
      row.append(who, state, numbers, actions); return row;
    }));
  }

  async function loadAudit(reset) {
    const list = $('audit-list');
    if (reset) { auditPage = 0; skeleton(list); }
    const query = new URLSearchParams({ event: $('audit-event').value, page: String(auditPage) });
    const result = await api('/api/admin/audit?' + query); list.removeAttribute('aria-busy');
    const select = $('audit-event'); const chosen = select.value;
    select.replaceChildren(node('option', 'All events', undefined, { value: '' }), ...(result.event_names || []).map(name => node('option', name.replaceAll('_', ' '), undefined, { value: name })));
    select.value = chosen;
    const rows = (result.events || []).map(event => {
      const row = node('article', undefined, 'ops-row');
      const what = node('div'); what.append(node('h3', event.event_name.replaceAll('_', ' ')), node('small', when(event.created_at)));
      const actor = node('div'); actor.append(pill(event.actor_type, event.actor_type === 'ADMIN' ? 'blue' : ''));
      const meta = node('div'); const reason = event.metadata?.reason; if (reason) meta.append(data('p', '“' + reason + '”'));
      meta.append(data('small', Object.entries(event.metadata || {}).filter(([key]) => key !== 'reason').map(([key, value]) => key + ': ' + value).join(' · '), 'mono'));
      row.append(what, actor, meta, node('div')); return row;
    });
    if (reset) { if (!rows.length) empty(list, 'No events yet.', 'Decisions and moderation actions are recorded here.'); else list.replaceChildren(...rows); }
    else list.append(...rows);
    $('audit-more').hidden = !result.has_more;
  }
  $('audit-event').addEventListener('change', () => load('audit'));
  $('audit-more').addEventListener('click', async () => { auditPage++; try { await loadAudit(false); } catch (error) { setError(errorText(error)); } });

  // ---------- sign in ----------
  function setLoginBusy(state, text) {
    busy = state; $('login').disabled = state; $('resend').disabled = state; $('change-phone').disabled = state;
    $('login').textContent = text || (otpSent ? 'Verify & sign in' : 'Send verification code');
  }
  async function sendCode() {
    const result = await api('/api/auth/phone/send-otp', { phone: $('phone').value.replace(/\s/g, '') }, false);
    otpSent = true; $('credentials-step').hidden = true; $('otp-step').hidden = false; $('otp-actions').hidden = false; $('code').required = true;
    $('otp-caption').textContent = 'Code sent to ' + $('phone').value + '. Valid for 5 minutes.';
    // A development code is returned only by the server's development SMS driver.
    $('login-status').textContent = result.dev_code ? 'Development SMS code: ' + result.dev_code : 'Code sent.';
    $('code').focus();
  }
  function enter() {
    $('account-label').textContent = 'Admin workspace'; $('logout').hidden = $('mobile-logout').hidden = false; $('login-status').textContent = '';
    render(); load('overview'); if (view !== 'overview') load(view);
  }
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; $('login-error').textContent = ''; setLoginBusy(true, otpSent ? 'Signing in…' : 'Sending code…');
    try {
      if (!otpSent) await sendCode();
      else {
        const result = await api('/api/admin/login', { phone: $('phone').value.replace(/\s/g, ''), password: $('password').value, code: $('code').value }, false);
        token = result.access_token; if (!token) throw new Error('Sign in again.');
        authVersion++; refreshToken = result.refresh_token || ''; renewal = null; remember();
        $('password').value = ''; $('code').value = ''; enter();
      }
    } catch (error) { $('login-error').textContent = errorText(error); }
    finally { setLoginBusy(false); }
  });
  $('change-phone').addEventListener('click', () => {
    otpSent = false; $('credentials-step').hidden = false; $('otp-step').hidden = $('otp-actions').hidden = true;
    $('code').required = false; $('code').value = ''; $('login-status').textContent = $('login-error').textContent = ''; setLoginBusy(false); $('phone').focus();
  });
  $('resend').addEventListener('click', async () => {
    if (busy) return; setLoginBusy(true, 'Sending code…'); $('login-error').textContent = '';
    try { $('code').value = ''; await sendCode(); } catch (error) { $('login-error').textContent = errorText(error); } finally { setLoginBusy(false); }
  });
  async function logout() {
    if (busy) return; busy = true;
    try { await api('/api/auth/logout', {}); } catch { /* Local data is cleared even when the network is down. */ }
    finally { busy = false; signedOut(); $('change-phone').click(); }
  }
  $('logout').addEventListener('click', logout); $('mobile-logout').addEventListener('click', logout);

  // A refresh in the same tab restores the session; closing the tab ends it.
  (async () => {
    render();
    try { refreshToken = sessionStorage.getItem(STORE_KEY) || ''; } catch { refreshToken = ''; }
    if (!refreshToken) return;
    try { await renew(); enter(); } catch { signedOut(); }
  })();
})();
