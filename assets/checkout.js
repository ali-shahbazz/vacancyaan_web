(() => {
  const $ = id => document.getElementById(id);
  const jobId = location.pathname.split('/').filter(Boolean).at(-1);
  const token = new URLSearchParams(location.search).get('token');
  let amount, submitting = false;
  const attempts = new Map();
  const humanError = error => ['TimeoutError', 'TypeError'].includes(error.name) ? 'Connection nahi ho saka. Dobara koshish karein.' : error.message;
  async function loadInvoice() {
    $('retry-invoice').disabled = true; $('invoice-error').hidden = true; $('checkout-fields').hidden = true; $('invoice').setAttribute('aria-busy', 'true'); $('invoice-state').textContent = 'Loading invoice';
    try {
      if (!token) throw new Error('Checkout link mukammal nahi hai. Kaam app se adaigi ka naya link kholein.');
      const response = await fetch('/api/payments/checkout/' + encodeURIComponent(jobId) + '?token=' + encodeURIComponent(token), { signal: AbortSignal.timeout(15000), cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.code) throw new Error(data.code === 'ERR_SESSION_DEAD' ? 'Link purana ho gaya hai. Kaam app mein Adaigi karein par tap kar ke naya link kholein.' : data.sentence || 'Link expire ho gaya hai. Kaam app se naya adaigi link kholein.');
      if (!data.job || !Number.isFinite(Number(data.amount_pkr)) || Number(data.amount_pkr) <= 0 || (!data.raast_id && !data.iban)) throw new Error('Invoice nahi mil saki. Kaam app se naya link kholein.');
      amount = Number(data.amount_pkr);
      const roles = { FAST_FOOD_COOK: 'Fast food cook', CONTINENTAL_COOK: 'Line cook', TANDOORCHI: 'Tandoorchi', WAITER: 'Waiter', DISHWASHER: 'Dishwasher', BARISTA: 'Barista', HELPER: 'Helper' };
      $('amount').textContent = amount.toLocaleString('en-PK'); $('brand').textContent = data.job.brand_name + ' · ' + (roles[data.job.role] || data.job.role);
      for (const [id, value] of [['raast', data.raast_id], ['iban', data.iban]]) { $(id).textContent = value || 'Available nahi'; document.querySelector('[data-copy="' + id + '"]').disabled = !value; }
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
    const payload = { job_id: jobId, token, transaction_ref: reference, amount_pkr: amount };
    const fingerprint = JSON.stringify(payload); if (!attempts.has(fingerprint)) attempts.set(fingerprint, crypto.randomUUID());
    submitting = true; $('send').disabled = true; $('ref').disabled = true; $('send').textContent = 'Bhej rahe hain…'; $('err').textContent = '';
    try {
      const response = await fetch('/api/payments/submit-proof', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': attempts.get(fingerprint) }, body: fingerprint, signal: AbortSignal.timeout(15000) });
      const data = await response.json(); if (!response.ok || data.code) throw new Error(data.sentence || 'Dobara koshish karein.');
      $('submitted-reference').textContent = 'Transaction ID: ' + reference; $('payment-content').hidden = true; $('payment-success').hidden = false;
      $('payment-success').setAttribute('tabindex', '-1'); $('payment-success').focus();
    } catch (error) { $('err').textContent = humanError(error); }
    finally { submitting = false; $('send').disabled = false; $('ref').disabled = false; $('send').textContent = 'Bhejein'; }
  });
  loadInvoice();
})();
