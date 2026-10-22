(() => {
  const $ = id => document.getElementById(id);
  // /checkout/:jobId pays for one job; /checkout/package/:id pays for a batch pack of 3 to 5 roles.
  const path = location.pathname.split('/').filter(Boolean);
  // /checkout/invoice/:id pays a head office's monthly plan.
  const kind = ['package', 'invoice'].includes(path.at(-2)) ? path.at(-2) : 'job';
  const targetId = path.at(-1);
  const target = { [kind + '_id']: targetId };
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  let amount, submitting = false, returnTarget = '/';
  const attempts = new Map(), uploads = new Map();
  const humanError = error => ['TimeoutError', 'TypeError'].includes(error.name) ? 'Connection nahi ho saka. Dobara koshish karein.' : error.message;
  async function loadInvoice() {
    $('retry-invoice').disabled = true; $('invoice-error').hidden = true; $('checkout-fields').hidden = true; $('invoice').setAttribute('aria-busy', 'true'); $('invoice-state').textContent = 'Loading invoice';
    try {
      if (!token) throw new Error('Checkout link mukammal nahi hai. Kaam app se adaigi ka naya link kholein.');
      let requestedReturn = params.get('return_to');
      if (!requestedReturn && document.referrer) {
        try { requestedReturn = new URL(document.referrer).origin + '/'; } catch { /* Use the server home fallback. */ }
      }
      const query = new URLSearchParams({ token });
      if (requestedReturn) query.set('return_to', requestedReturn);
      const response = await fetch('/api/payments/checkout/' + (kind === 'job' ? '' : kind + '/') + encodeURIComponent(targetId) + '?' + query, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.code) throw new Error(data.code === 'ERR_SESSION_DEAD' ? 'Link purana ho gaya hai. Kaam app mein Adaigi karein par tap kar ke naya link kholein.' : data.sentence || 'Link expire ho gaya hai. Kaam app se naya adaigi link kholein.');
      const subject = data.job || data.package || data.invoice;
      if (!subject || !Number.isFinite(Number(data.amount_pkr)) || Number(data.amount_pkr) <= 0 || (!data.raast_id && !data.iban)) throw new Error('Invoice nahi mil saki. Kaam app se naya link kholein.');
      amount = Number(data.amount_pkr);
      returnTarget = data.return_to || '/';
      const roles = { FAST_FOOD_COOK: 'Fast food cook', CONTINENTAL_COOK: 'Line cook', TANDOORCHI: 'Tandoorchi', WAITER: 'Waiter', DISHWASHER: 'Dishwasher', BARISTA: 'Barista', HELPER: 'Helper', CASHIER: 'Cashier', SHELF_PACKER: 'Shelf packer', LOADER: 'Loader', DELIVERY_RIDER: 'Delivery rider', PHARMACY_ASSISTANT: 'Pharmacy assistant' };
      $('amount').textContent = amount.toLocaleString('en-PK');
      const venue = document.createElement('span'); venue.dataset.noTranslate = ''; venue.textContent = subject.brand_name;
      const role = document.createElement('span');
      if (data.package) {
        const count = (data.package.seats || []).length;
        role.textContent = count + ' roles';
        $('invoice-kind').textContent = 'Batch pack · ' + count + ' roles';
        const pay = seat => 'PKR ' + Number(seat.salary_min).toLocaleString('en-PK') + (seat.salary_max ? ' – ' + Number(seat.salary_max).toLocaleString('en-PK') : '+');
        $('seat-list').replaceChildren(...data.package.seats.map(seat => {
          const item = document.createElement('li');
          const name = document.createElement('span'); name.textContent = roles[seat.role] || seat.role;
          const detail = document.createElement('span'); detail.dataset.noTranslate = ''; detail.textContent = [seat.area_name, pay(seat)].filter(Boolean).join(' · ');
          item.append(name, detail); return item;
        }));
        $('seat-list').hidden = false;
        $('pack-note').textContent = data.package.credits + ' contacts shared by these roles · live for ' + data.package.visibility_days + ' days';
        $('pack-note').hidden = false;
        $('intro-title').textContent = 'Let’s get your roles ready.';
        $('intro-text').textContent = 'Transfer the pack fee once, then send the transaction ID. Kaam checks the transfer before every role goes live.';
      } else if (data.invoice) {
        role.textContent = 'Monthly plan';
        $('invoice-kind').textContent = 'Monthly plan · ' + data.invoice.period_days + ' days';
        $('pack-note').textContent = data.invoice.credits + ' contacts shared by every branch · unused contacts end with the month';
        $('pack-note').hidden = false;
        $('intro-title').textContent = 'Let’s start your month.';
        $('intro-text').textContent = 'Transfer the monthly fee, then send the transaction ID. Kaam checks the transfer before the month starts.';
      } else role.textContent = roles[subject.role] || subject.role;
      $('brand').replaceChildren(venue, document.createTextNode(' · '), role);
      for (const [id, value] of [['raast', data.raast_id], ['iban', data.iban]]) { $(id).textContent = value || 'Available nahi'; if (value) $(id).dataset.noTranslate = ''; document.querySelector('[data-copy="' + id + '"]').disabled = !value; }
      $('invoice-state').textContent = 'Awaiting transfer'; $('checkout-fields').hidden = false;
    } catch (error) {
      amount = undefined; $('invoice-state').textContent = 'Invoice unavailable'; $('brand').textContent = 'Kaam app se apni job ka checkout kholein.'; $('amount').textContent = '—';
      $('invoice-error-text').textContent = humanError(error); $('invoice-error').hidden = false; $('retry-invoice').hidden = !token;
    } finally { $('invoice').setAttribute('aria-busy', 'false'); $('retry-invoice').disabled = false; }
  }
  $('retry-invoice').addEventListener('click', loadInvoice);
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($(button.dataset.copy).textContent); $('copy-status').textContent = (button.dataset.copy === 'iban' ? 'IBAN' : 'Raast ID') + ' copy ho gaya.'; }
    catch { $('copy-status').textContent = 'Number select kar ke copy karein.'; }
  }));
  $('payment-form').addEventListener('submit', async event => {
    event.preventDefault(); if (submitting || amount === undefined) return;
    const reference = $('ref').value.trim(); if (!reference) { $('err').textContent = 'Transaction ID darj karein.'; $('ref').focus(); return; }
    const file = $('receipt').files[0];
    if (file && (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024)) { $('err').textContent = 'Choose a JPEG or PNG receipt smaller than 2 MB.'; $('receipt').focus(); return; }
    submitting = true; $('send').disabled = true; $('ref').disabled = true; $('receipt').disabled = true; $('send').textContent = 'Bhej rahe hain…'; $('err').textContent = '';
    try {
      // The receipt is optional; it is uploaded once per chosen file and reused on retry.
      let receiptKey;
      if (file) {
        const fileId = [file.name, file.size, file.lastModified].join(':');
        if (!uploads.has(fileId)) {
          const issued = await fetch('/api/payments/receipt-upload-url', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...target, token, content_type: file.type }), signal: AbortSignal.timeout(15000) });
          const meta = await issued.json(); if (!issued.ok || meta.code) throw new Error(meta.sentence || 'Receipt upload nahi hui. Dobara koshish karein.');
          const put = await fetch(new URL(meta.upload_url).pathname + new URL(meta.upload_url).search, { method: 'PUT', headers: { 'content-type': file.type }, body: file, signal: AbortSignal.timeout(30000) });
          if (!put.ok) throw new Error('Receipt upload nahi hui. Dobara koshish karein.');
          uploads.set(fileId, meta.key);
        }
        receiptKey = uploads.get(fileId);
      }
      const payload = { ...target, token, transaction_ref: reference, amount_pkr: amount, ...(receiptKey ? { receipt_key: receiptKey } : {}) };
      const fingerprint = JSON.stringify(payload); if (!attempts.has(fingerprint)) attempts.set(fingerprint, crypto.randomUUID());
      const response = await fetch('/api/payments/submit-proof', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': attempts.get(fingerprint) }, body: fingerprint, signal: AbortSignal.timeout(15000) });
      const data = await response.json(); if (!response.ok || data.code) throw new Error(data.sentence || 'Dobara koshish karein.');
      // A successful checkout returns home directly; no intermediate receipt
      // or "job published" page. Only the server's successful write triggers it.
      if (params.get('return_mode') === 'tab' && window.opener) {
        try {
          window.opener.postMessage({ type: 'kaam-payment-complete', ...target }, new URL(returnTarget, location.href).origin);
          window.opener.focus();
          window.close();
          setTimeout(() => location.replace(returnTarget), 150);
        } catch { location.replace(returnTarget); }
      } else {
        // Opened outside the app: confirm what happens next instead of jumping away.
        $('checkout-fields').hidden = true; $('invoice-state').textContent = 'Under review';
        $('back-to-app').href = returnTarget; $('sent-panel').hidden = false; $('sent-panel').focus();
      }
    } catch (error) { $('err').textContent = humanError(error); }
    finally { submitting = false; $('send').disabled = false; $('ref').disabled = false; $('receipt').disabled = false; $('send').textContent = 'Bhejein'; }
  });
  loadInvoice();
})();
