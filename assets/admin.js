(() => {
  const $ = id => document.getElementById(id);
  let token = '', refreshToken = '', renewal = null, authVersion = 0, otpSent = false, busy = false, view = 'overview', proofs = [];
  const money = value => Number(value).toLocaleString('en-PK');
  const labels = { overview: ['Workspace overview', 'A little clarity for your day. A better start for every hire.'], payments: ['Payment reviews', 'Check each transfer. Help the next job get started.'], reports: ['Venue reports', 'Listen to workers. Keep opportunities trustworthy.'] };
  const roleNames = { FAST_FOOD_COOK: 'Fast food cook', CONTINENTAL_COOK: 'Line cook', TANDOORCHI: 'Tandoorchi', WAITER: 'Waiter', DISHWASHER: 'Dishwasher', BARISTA: 'Barista', HELPER: 'Helper' };
  $('today').textContent = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Asia/Karachi' }).format(new Date());

  function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
  function signedOut() {
    authVersion++; token = ''; refreshToken = ''; renewal = null; proofs = []; $('payment-rows').replaceChildren(); $('report-list').replaceChildren();
    ['stat-count', 'stat-amount', 'stat-jobs'].forEach(id => { $(id).textContent = '—'; });
    $('stat-count-note').textContent = 'Sign in to see your review queue';
    $('account-label').textContent = 'Admin access'; $('logout').hidden = $('mobile-logout').hidden = true;
    updateView();
  }
  async function api(path, body, authenticated = true) {
    const version = authVersion, sentToken = token;
    const unchanged = () => { if (authenticated && version !== authVersion) throw new Error('Account badal gaya.'); };
    const once = credential => {
      const headers = {}; if (authenticated && credential) headers.authorization = 'Bearer ' + credential;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return fetch(path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), cache: 'no-store' });
    };
    let response = await once(sentToken); unchanged();
    if (authenticated && response.status === 401 && sentToken !== token) { response = await once(token); unchanged(); }
    if (authenticated && response.status === 401 && refreshToken) {
      const pending = renewal ||= (async () => {
        const current = refreshToken;
        const refreshed = await fetch('/api/auth/refresh', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({refresh_token:current}), signal:AbortSignal.timeout(15000), cache:'no-store' });
        unchanged();
        if (refreshed.status === 401) { signedOut(); throw new Error('Session khatam ho gayi. Dobara login karein.'); }
        if (!refreshed.ok) throw new Error('Connection nahi ho saka. Dobara koshish karein.');
        const credentials = await refreshed.json(); unchanged();
        if (!credentials.access_token || !credentials.refresh_token) throw new Error('Login ka jawab nahi mila.');
        token=credentials.access_token; refreshToken=credentials.refresh_token;
      })();
      try { await pending; unchanged(); response=await once(token); unchanged(); }
      finally { if(renewal===pending) renewal=null; }
    }
    let data; try { data = await response.json(); } catch { throw new Error('Server ka jawab nahi mila. Dobara koshish karein.'); }
    unchanged();
    if (!response.ok) {
      if (authenticated && response.status === 401) { signedOut(); $('login-error').textContent = 'Session khatam ho gayi. Dobara login karein.'; }
      throw new Error(data.sentence || 'Dobara koshish karein.');
    }
    return data;
  }
  const errorText = error => error.name === 'TimeoutError' || error.name === 'TypeError' ? 'Connection nahi ho saka. Dobara koshish karein.' : error.message;
  function updateView() {
    document.querySelectorAll('[data-view]').forEach(el => { if (el.dataset.view === view) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
    $('view-title').textContent = labels[view][0]; $('view-subtitle').textContent = labels[view][1];
    $('breadcrumb-label').textContent = view === 'reports' ? 'Venue reports' : view[0].toUpperCase() + view.slice(1);
    document.title = 'Kaam workspace — ' + $('breadcrumb-label').textContent;
    $('welcome').hidden = view !== 'overview'; $('stats').hidden = view === 'reports';
    $('signin-panel').hidden = Boolean(token); $('payments-panel').hidden = !token || view === 'reports'; $('reports-panel').hidden = !token || view !== 'reports';
  }
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { view = button.dataset.view; updateView(); if (view === 'reports' && token) loadReports(); }));
  function setLoginBusy(state, text) {
    busy = state; $('login').disabled = state; $('resend').disabled = state; $('change-phone').disabled = state;
    $('login').textContent = text || (otpSent ? 'Verify & sign in' : 'Send verification code');
  }
  async function sendCode() {
    const data = await api('/api/auth/phone/send-otp', { phone: $('phone').value.replace(/\s/g, '') }, false);
    otpSent = true; $('credentials-step').hidden = true; $('otp-step').hidden = false; $('otp-actions').hidden = false; $('code').required = true;
    $('otp-caption').textContent = 'Code sent to ' + $('phone').value + '. Valid for 5 minutes.';
    // A development code is returned only by the server's development SMS driver.
    $('login-status').textContent = data.dev_code ? 'Development SMS code: ' + data.dev_code : 'Code bhej diya gaya hai.';
    $('code').focus();
  }
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; $('login-error').textContent = ''; setLoginBusy(true, otpSent ? 'Signing in…' : 'Sending code…');
    try {
      if (!otpSent) await sendCode();
      else {
        const data = await api('/api/admin/login', { phone: $('phone').value.replace(/\s/g, ''), password: $('password').value, code: $('code').value }, false);
        token = data.access_token; if (!token) throw new Error('Dobara login karein.');
        authVersion++; refreshToken=data.refresh_token || ''; renewal=null;
        $('password').value = ''; $('code').value = ''; $('account-label').textContent = 'Admin workspace';
        $('logout').hidden = $('mobile-logout').hidden = false; $('login-status').textContent = ''; updateView();
        await loadPayments(); if (view === 'reports') await loadReports();
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
  function renderPayments() {
    const term = $('search').value.toLowerCase().trim();
    const filtered = proofs.filter(proof => [proof.brand_name, proof.transaction_ref, roleNames[proof.role]].join(' ').toLowerCase().includes(term));
    $('payment-rows').replaceChildren(); $('table-wrapper').hidden = !filtered.length; $('payment-empty').hidden = Boolean(filtered.length);
    $('empty-title').textContent = term ? 'No matching payments.' : 'You’re all caught up.';
    $('empty-message').textContent = term ? 'Try another venue name or transaction reference.' : 'No payments are waiting for review. New submissions will appear here.';
    for (const proof of filtered) {
      const tr = node('tr'); const venue = node('td'); venue.append(node('strong', proof.brand_name || 'Unnamed venue'), node('small', roleNames[proof.role] || proof.role));
      const ref = node('td', proof.transaction_ref, 'reference'); const amount = node('td', 'PKR ' + money(proof.amount_pkr));
      const date = proof.created_at && !Number.isNaN(Date.parse(proof.created_at)) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Karachi' }).format(new Date(proof.created_at)) : '—';
      const submitted = node('td', date); const actions = node('td'); const group = node('div', undefined, 'table-actions');
      const verify = node('button', 'Verify', 'button button-primary button-small'); const reject = node('button', 'Reject', 'button button-danger button-small');
      verify.setAttribute('aria-label', 'Verify payment for ' + proof.brand_name); reject.setAttribute('aria-label', 'Reject payment for ' + proof.brand_name);
      async function decide(decision) {
        verify.disabled = reject.disabled = true; $('queue-error').textContent = ''; $('queue-status').textContent = '';
        try {
          await api('/api/admin/verify-payment', { proof_id: proof.id, decision });
          $('queue-status').textContent = decision === 'VERIFIED' ? 'Payment verified. The job is now active.' : 'Payment rejected. The job stays pending.';
          await loadPayments();
        } catch (error) { $('queue-error').textContent = errorText(error); verify.disabled = reject.disabled = false; }
      }
      verify.addEventListener('click', () => decide('VERIFIED')); reject.addEventListener('click', () => decide('REJECTED'));
      group.append(verify, reject); actions.append(group); tr.append(venue, ref, amount, submitted, actions); $('payment-rows').append(tr);
    }
  }
  let paymentsLoading = false;
  async function loadPayments() {
    if (paymentsLoading || !token) return; paymentsLoading = true; $('refresh-payments').disabled = true; $('queue-error').textContent = '';
    try {
      const data = await api('/api/admin/pending-payments'); proofs = data.proofs || [];
      $('stat-count').textContent = money(proofs.length); $('stat-amount').textContent = money(proofs.reduce((sum, proof) => sum + Number(proof.amount_pkr), 0));
      $('stat-jobs').textContent = money(new Set(proofs.map(proof => proof.job_id)).size); $('stat-count-note').textContent = 'Live queue · Refresh to check for new transfers';
      $('queue-badge').textContent = proofs.length + ' pending'; renderPayments();
    } catch (error) { $('queue-error').textContent = errorText(error); }
    finally { paymentsLoading = false; $('refresh-payments').disabled = false; }
  }
  let reportsLoading = false;
  async function loadReports() {
    if (reportsLoading || !token) return; reportsLoading = true; $('refresh-reports').disabled = true; $('reports-error').textContent = '';
    try {
      const data = await api('/api/admin/reports'); const reports = data.reports || []; $('report-list').replaceChildren(); $('reports-empty').hidden = Boolean(reports.length);
      const reasons = { fee_asked: 'Asked the worker for money', salary_lie: 'Salary did not match', shift_changed: 'Shift changed', seat_filled: 'Seat already filled', theek: 'Worker reported a good experience' };
      for (const report of reports) {
        const card = node('article', undefined, 'report-card'); const description = node('div');
        description.append(node('strong', reasons[report.reason] || String(report.reason).replaceAll('_', ' ')), node('p', 'Venue ID: ' + report.employer_id), node('small', 'Report ' + report.id));
        const actions = node('div', undefined, 'table-actions'); const uphold = node('button', 'Uphold report', 'button button-primary button-small'); const dismiss = node('button', 'Dismiss', 'button button-secondary button-small');
        async function decide(decision) {
          uphold.disabled = dismiss.disabled = true;
          try { await api('/api/admin/reports/' + encodeURIComponent(report.id), { decision }); await loadReports(); }
          catch (error) { $('reports-error').textContent = errorText(error); uphold.disabled = dismiss.disabled = false; }
        }
        uphold.addEventListener('click', () => decide('UPHELD')); dismiss.addEventListener('click', () => decide('DISMISSED'));
        actions.append(uphold, dismiss); card.append(description, actions); $('report-list').append(card);
      }
    } catch (error) { $('reports-error').textContent = errorText(error); } finally { reportsLoading = false; $('refresh-reports').disabled = false; }
  }
  $('search').addEventListener('input', renderPayments); $('refresh-payments').addEventListener('click', loadPayments); $('refresh-reports').addEventListener('click', loadReports);
  async function logout() {
    if (busy) return; busy = true;
    try { await api('/api/auth/logout', {}); } catch { /* Local data is cleared even when the network is down. */ }
    finally { busy = false; signedOut(); $('change-phone').click(); }
  }
  $('logout').addEventListener('click', logout); $('mobile-logout').addEventListener('click', logout);
})();
