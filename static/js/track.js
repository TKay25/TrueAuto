/* True Auto Zim — public order tracking with live refresh */
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("trackResult");
  if (!container) return;
  const orderNumber = container.dataset.order || "";
  if (!orderNumber) return;

  const statusBadge = (label) =>
    `<span class="badge status-badge status-shipping fs-6">${escapeHtml(label)}</span>`;

  const timelineHTML = (data) => {
    const doneSet = new Set(data.events.map((e) => e.stage));
    let html = "";
    // Build ordered list from the event order; mark current active
    const ordered = [];
    for (const e of data.events) {
      if (!ordered.find((o) => o.stage === e.stage)) ordered.push(e);
    }
    for (let i = 0; i < data.total_stages; i++) {
      const ev = ordered[i];
      const isActive = ev && i === data.stage_index;
      const isDone = ev && i < data.stage_index;
      const cls = isDone ? "done" : isActive ? "active" : "upcoming";
      html += `
        <div class="tracking-step ${cls} mb-3">
          <div class="track-icon">${ev ? escapeHtml(ev.label).slice(0, 1) : i + 1}</div>
          <div class="w-100">
            <div class="d-flex justify-content-between align-items-start flex-wrap">
              <span class="fw-semibold">${i + 1}. ${escapeHtml(ev ? ev.label : "")}</span>
              ${ev ? `<small class="text-muted">${escapeHtml(ev.created_at)}</small>` : ""}
            </div>
            ${ev && ev.note ? `<small class="text-muted d-block">${escapeHtml(ev.note)}</small>` : ""}
            ${ev && ev.evidence_url ? `<a href="${escapeHtml(ev.evidence_url)}" target="_blank" class="small text-accent">View evidence <i class="bi bi-box-arrow-up-right"></i></a>` : ""}
          </div>
        </div>`;
    }
    return html;
  };

  const render = (data) => {
    if (!data.found) {
      container.innerHTML = `
        <div class="alert alert-warning text-center mx-auto" style="max-width: 560px;">
          <i class="bi bi-exclamation-triangle me-2"></i>
          We couldn't find order <strong>${escapeHtml(orderNumber)}</strong>.
          Double-check the number on your invoice.
        </div>`;
      return;
    }
    const v = data.vehicle;
    container.innerHTML = `
      <div class="row g-4 justify-content-center">
        <div class="col-lg-4">
          <div class="card border shadow-sm">
            <div class="vehicle-img rounded-top" style="height: 180px;">
              <div class="vehicle-placeholder d-flex flex-column align-items-center justify-content-center">
                <i class="bi bi-car-front-fill placeholder-car"></i>
                <span class="placeholder-text">${escapeHtml(v.make)} ${escapeHtml(v.model)}</span>
              </div>
            </div>
            <div class="card-body p-4">
              <h5 class="fw-bold mb-1">${v.year} ${escapeHtml(v.make)} ${escapeHtml(v.model)}</h5>
              <small class="text-muted d-block mb-3">Order ${escapeHtml(data.order_number)} · Placed ${escapeHtml(data.created_at)}</small>
              <div class="d-flex justify-content-between border-top pt-2">
                <span class="text-muted small">Paid</span><span class="fw-semibold">${fmtMoney(data.paid_total)}</span>
              </div>
              <div class="d-flex justify-content-between border-top pt-2">
                <span class="text-muted small">Total estimate</span><span class="fw-semibold">${fmtMoney(data.total_estimate)}</span>
              </div>
              <div class="d-flex justify-content-between border-top pt-2">
                <span class="text-muted small">Outstanding</span><span class="fw-semibold text-accent-dark">${fmtMoney(data.outstanding)}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="card border shadow-sm">
            <div class="card-body p-4">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="fw-bold mb-0"><i class="bi bi-signpost-2 text-accent me-2"></i>Journey</h5>
                ${statusBadge(data.status_label)}
              </div>
              ${timelineHTML(data)}
            </div>
          </div>
        </div>
      </div>`;
  };

  const load = async () => {
    try {
      const data = await apiFetch(`/api/orders/public/${encodeURIComponent(orderNumber)}`);
      render(data);
    } catch (e) {
      container.innerHTML = `
        <div class="alert alert-danger text-center mx-auto" style="max-width: 560px;">
          Could not load tracking. Please refresh.
        </div>`;
    }
  };

  load();
  setInterval(load, 30000); // live refresh every 30s
});
