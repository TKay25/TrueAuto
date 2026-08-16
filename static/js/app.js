/* ==========================================================================
   True Auto Zim — Single-Page App engine
   Zero page redirects: every view is swapped client-side via the JSON API.
   Views are addressed with URL hashes (#/dashboard, #/orders/3 …) so the
   back button still works — without any full page load.
   ========================================================================== */

const App = {
  config: null,
  me: null,
  view: null,
  params: {},
  orderTimer: null,
  wishlist: new Set(),
};

/* Portal mode: "client" (public /app) or "admin" (discreet /admin) */
const PORTAL = window.PORTAL || "client";
const homeView = () => (PORTAL === "admin" ? "admin_overview" : "dashboard");

const $ = (id) => document.getElementById(id);
const viewEl = () => $("appView");
const authRequired = (view) =>
  view !== "login" && view !== "catalog" && view !== "vehicle" &&
  view !== "track" && view !== "pricing";

/* ------------------------------------------------------------------ */
/* Small shared renderers                                              */
/* ------------------------------------------------------------------ */
function statusBadge(label, extra = "status-shipping") {
  return `<span class="badge status-badge ${extra}">${escapeHtml(label)}</span>`;
}

function spinner(text = "Loading…") {
  return `<div class="text-center py-5">
    <div class="spinner-border text-danger" role="status"></div>
    <p class="text-muted mt-3 mb-0">${escapeHtml(text)}</p></div>`;
}

function vehicleImageHTML(v, height = 200) {
  return `<div class="vehicle-placeholder d-flex flex-column align-items-center justify-content-center" style="height:${height}px;">
    <i class="bi bi-car-front-fill placeholder-car"></i>
    <span class="placeholder-text">${escapeHtml(v.make)} ${escapeHtml(v.model)}</span></div>`;
}

function costBreakdownHTML(c) {
  if (!c) return "";
  const rows = [
    ["Japan auction price (FOB)", c.fob],
    ["Freight (Japan → port)", c.freight],
    ["Insurance", c.insurance],
    ["Auction & export fees", c.auction_fees],
    ["Import duty", c.duty],
    ["Surtax", c.surtax],
    ["VAT (15%)", c.vat],
    ["Port handling", c.port_handling],
    ["Clearing & inspection", c.clearing + c.inspection],
    ["Transport to Harare", c.transport],
  ];
  let html = rows.map(([label, val]) =>
    `<div class="cost-row"><span>${label}</span><span class="fw-semibold">${fmtMoney(val)}</span></div>`).join("");
  html += `<div class="cost-row commission"><span>Auction &amp; shipping fee (fixed)</span><span class="fw-bold">${fmtMoney(c.commission)}</span></div>`;
  html += `<div class="cost-row total"><span>Total landed in Harare</span><span class="text-accent-dark">${fmtMoney(c.total)}</span></div>`;
  return `<div class="cost-breakdown">${html}</div>`;
}

function timelineHTML(pipeline, events, stageIndex) {
  const byStage = {};
  (events || []).forEach((e) => { if (!byStage[e.stage]) byStage[e.stage] = e; });
  return pipeline.map((s, i) => {
    const ev = byStage[s.key];
    const cls = ev ? (i < stageIndex ? "done" : "active") : "upcoming";
    return `
      <div class="tracking-step ${cls} mb-3">
        <div class="track-icon">${ev ? escapeHtml(ev.icon || "") : i + 1}</div>
        <div class="w-100">
          <div class="d-flex justify-content-between align-items-start flex-wrap">
            <span class="fw-semibold">${i + 1}. ${escapeHtml(s.label)}</span>
            ${ev && ev.created_at ? `<small class="text-muted">${escapeHtml(ev.created_at)}</small>` : ""}
          </div>
          ${ev && ev.note ? `<small class="text-muted d-block">${escapeHtml(ev.note)}</small>` : ""}
          ${ev && ev.evidence_url ? `<a href="${escapeHtml(ev.evidence_url)}" target="_blank" class="small text-accent">View evidence <i class="bi bi-box-arrow-up-right"></i></a>` : ""}
        </div>
      </div>`;
  }).join("");
}

function paymentsHTML(payments, opts = {}) {
  if (!payments.length) return `<p class="text-muted small mb-0">No payments yet.</p>`;
  return payments.map((p) => `
    <div class="d-flex justify-content-between align-items-center border rounded-3 px-3 py-2 small">
      <div>
        <strong>${escapeHtml(p.method_label || p.method)}</strong>
        <div class="text-muted">${escapeHtml(p.reference)}${p.note ? ` · ${escapeHtml(p.note)}` : ""}</div>
      </div>
      <div class="text-end">
        <div class="fw-bold">${fmtMoney(p.amount_usd)}</div>
        ${opts.canVerify
          ? `<button class="btn btn-sm btn-success rounded-pill mt-1" data-action="verify-payment" data-id="${p.id}">Verify</button>`
          : statusBadge(p.status, p.status === "verified" ? "status-verified" : "status-pending")}
      </div>
    </div>`).join("");
}

/* ------------------------------------------------------------------ */
/* View: LOGIN / REGISTER (no redirect — swaps inline)                 */
/* ------------------------------------------------------------------ */
async function viewLogin() {
  viewEl().innerHTML = `
  <div class="row justify-content-center">
    <div class="col-lg-6 col-xl-5">
      <div class="card auth-card mx-auto">
        <div class="card-body p-4 p-md-5">
          <div class="text-center mb-4">
            <div class="brand-badge mx-auto mb-3" style="width:56px;height:56px;font-size:1.6rem;"><i class="bi bi-car-front-fill"></i></div>
            <h3 class="fw-black mb-1">Welcome to the App</h3>
            <p class="text-muted small mb-0">Track cars, pay deposits & manage orders — all in one place, zero page reloads.</p>
          </div>
          <ul class="nav nav-pills nav-fill mb-4 gap-2" id="authTabs">
            <li class="nav-item flex-fill"><button class="nav-link active w-100 rounded-pill" data-auth-tab="login">Log in</button></li>
            <li class="nav-item flex-fill"><button class="nav-link w-100 rounded-pill" data-auth-tab="register">Create account</button></li>
          </ul>
          <form id="loginForm">
            <div class="mb-3"><label class="form-label fw-semibold">Email</label>
              <input type="email" class="form-control" id="loginEmail" placeholder="you@example.com" required></div>
            <div class="mb-4"><label class="form-label fw-semibold">Password</label>
              <input type="password" class="form-control" id="loginPassword" placeholder="••••••••" required></div>
            <div class="d-grid"><button type="submit" class="btn btn-accent btn-lg rounded-pill">Log in <i class="bi bi-box-arrow-in-right ms-1"></i></button></div>
          </form>
          <form id="registerForm" class="d-none">
            <div class="mb-2"><label class="form-label fw-semibold">Full name</label>
              <input type="text" class="form-control" id="regName" placeholder="Tendai Moyo" required></div>
            <div class="mb-2"><label class="form-label fw-semibold">Email</label>
              <input type="email" class="form-control" id="regEmail" placeholder="you@example.com" required></div>
            <div class="mb-2"><label class="form-label fw-semibold">Phone / WhatsApp</label>
              <input type="text" class="form-control" id="regPhone" placeholder="+263 7x xxx xxxx" required></div>
            <div class="row g-2 mb-4">
              <div class="col-md-6"><label class="form-label fw-semibold">Password</label>
                <input type="password" class="form-control" id="regPassword" placeholder="Min 6 characters" required></div>
              <div class="col-md-6"><label class="form-label fw-semibold">Confirm</label>
                <input type="password" class="form-control" id="regConfirm" placeholder="Repeat" required></div>
            </div>
            <div class="d-grid"><button type="submit" class="btn btn-accent btn-lg rounded-pill">Create account <i class="bi bi-person-check ms-1"></i></button></div>
          </form>
          <p class="text-center text-muted small mt-4 mb-0">Demo: <code>demo@trueautozim.co.zw / Demo123!</code></p>
        </div>
      </div>
    </div>
  </div>`;

  const tabBtn = (t) => viewEl().querySelector(`[data-auth-tab="${t}"]`);
  const switchTab = (t) => {
    tabBtn("login").classList.toggle("active", t === "login");
    tabBtn("register").classList.toggle("active", t === "register");
    $("loginForm").classList.toggle("d-none", t !== "login");
    $("registerForm").classList.toggle("d-none", t !== "register");
  };
  tabBtn("login").addEventListener("click", () => switchTab("login"));
  tabBtn("register").addEventListener("click", () => switchTab("register"));

  // Staff-only login on the admin portal (no public registration)
  if (PORTAL === "admin") {
    tabBtn("register").classList.add("d-none");
    $("registerForm").classList.add("d-none");
    const note = document.createElement("div");
    note.className = "alert alert-warning small py-2";
    note.textContent = "🔒 Authorized staff only.";
    $("loginForm").parentElement.insertBefore(note, $("loginForm"));
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: { email: $("loginEmail").value, password: $("loginPassword").value },
      });
      App.me = data.user;
      updateChip();
      renderNotifBell();
      Notifs.unread();
      Notifs.load();
      if (PORTAL === "admin" && !data.user.is_admin) {
        showToast("Staff access only.", "warning");
        location.href = "/app";
        return;
      }
      showToast(`Welcome back, ${data.user.name}!`, "success");
      goTo(homeView());
    } catch (err) { showToast(err.message, "danger", "Login failed"); }
  });

  $("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("regPassword").value !== $("regConfirm").value) {
      showToast("Passwords do not match.", "danger"); return;
    }
    try {
      const data = await apiFetch("/api/auth/register", {
        method: "POST",
        body: {
          name: $("regName").value, email: $("regEmail").value,
          phone: $("regPhone").value, password: $("regPassword").value,
        },
      });
      App.me = data.user;
      updateChip();
      renderNotifBell();
      Notifs.unread();
      Notifs.load();
      showToast(`Account created. Welcome, ${data.user.name}! 🎉`, "success");
      goTo(homeView());
    } catch (err) { showToast(err.message, "danger", "Registration failed"); }
  });
}

/* ------------------------------------------------------------------ */
/* View: DASHBOARD (my orders)                                         */
/* ------------------------------------------------------------------ */
async function viewDashboard() {
  viewEl().innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4">
      <div><span class="section-kicker">Dashboard</span>
        <h1 class="fw-black mb-0">Hello, ${escapeHtml(App.me.name)} 👋</h1></div>
      <button class="btn btn-accent rounded-pill" data-action="go-catalog"><i class="bi bi-car-front me-1"></i> Find a car</button>
    </div>
    <div id="dashContent">${spinner("Loading your orders…")}</div>`;

  const data = await apiFetch("/api/orders");
  const box = $("dashContent");
  if (!data.orders.length) {
    box.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-car-front display-3 text-muted"></i>
        <h5 class="fw-bold mt-3">You don't have any orders yet</h5>
        <p class="text-muted">Browse the catalog and order your dream car — we'll import it with full transparency.</p>
        <button class="btn btn-accent rounded-pill mt-2" data-action="go-catalog">Browse cars <i class="bi bi-arrow-right"></i></button>
      </div>`;
    return;
  }
  box.innerHTML = `<div class="row g-4">` + data.orders.map((o) => {
    const pct = Math.round((o.stage_index / 10) * 100);
    return `
      <div class="col-md-6 col-lg-4">
        <div class="card h-100 border shadow-sm app-order-row" data-action="open-order" data-id="${o.id}">
          <div class="card-body p-4">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="fw-bold">#${escapeHtml(o.order_number)}</span>
              ${statusBadge(o.status_label)}
            </div>
            <h6 class="fw-bold mb-1">${escapeHtml(o.vehicle)}</h6>
            <small class="text-muted d-block mb-3">Placed ${escapeHtml(o.created_at)}</small>
            <div class="progress mb-2" style="height:8px;">
              <div class="progress-bar bg-success" style="width:${pct}%"></div>
            </div>
            <small class="text-muted">Stage ${o.stage_index + 1} of 10</small>
            <div class="d-flex justify-content-between mt-3 pt-3 border-top">
              <span class="text-muted small">Paid <strong>${fmtMoney(o.paid_total)}</strong></span>
              <span class="text-muted small">Total <strong>${fmtMoney(o.total_estimate)}</strong></span>
            </div>
          </div>
        </div>
      </div>`;
  }).join("") + `</div>`;
}

/* ------------------------------------------------------------------ */
/* View: ORDER (customer tracking detail + payments)                   */
/* ------------------------------------------------------------------ */
async function viewOrder(id) {
  viewEl().innerHTML = spinner("Loading your order…");
  const data = await apiFetch(`/api/orders/${id}`);

  const header = `
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
      <div>
        <button class="btn btn-sm btn-outline-brand rounded-pill mb-2" data-action="go-back"><i class="bi bi-arrow-left"></i> Back</button>
        <h2 class="fw-black mb-0">Order ${escapeHtml(data.order_number)}</h2>
        <small class="text-muted">${escapeHtml(data.vehicle.full_title)}</small>
      </div>
      <div class="d-flex gap-2">
        <a class="btn btn-outline-brand rounded-pill" href="/invoice/${data.id}" target="_blank"><i class="bi bi-receipt me-1"></i> Invoice</a>
        ${statusBadge(data.status_label, "status-shipping fs-6")}
      </div>
    </div>`;

  const timeline = `
    <div class="card border shadow-sm mb-4">
      <div class="card-body p-4">
        <h5 class="fw-bold mb-3"><i class="bi bi-signpost-2 text-accent me-2"></i>Live journey</h5>
        <div id="orderTimeline">${timelineHTML(data.pipeline, data.events, data.stage_index)}</div>
        <p class="small text-muted mt-2 mb-0"><i class="bi bi-arrow-repeat me-1"></i>Auto-refreshes every 30 seconds.</p>
      </div>
    </div>`;

  const costCard = `
    <div class="card border shadow-sm mb-4">
      <div class="card-body p-4">
        <h6 class="fw-bold mb-2"><i class="bi bi-receipt text-accent me-1"></i>Cost summary</h6>
        ${costBreakdownHTML(data.estimate)}
      </div>
    </div>`;

  // Review card — shown once the car is delivered
  let reviewCard = "";
  if (data.status === "delivered" && !data.reviewed) {
    reviewCard = `
      <div class="card border shadow-sm mt-4">
        <div class="card-body p-4">
          <h6 class="fw-bold mb-2"><i class="bi bi-star text-gold me-1"></i>How was your experience?</h6>
          <p class="text-muted small">Rate your purchase — it helps other Zimbabweans buy with confidence.</p>
          <div class="d-flex gap-1 mb-2" id="starPicker">
            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-btn" data-star="${n}"><i class="bi bi-star"></i></button>`).join("")}
          </div>
          <textarea id="reviewComment" class="form-control mb-2" rows="2" placeholder="Share your experience (optional)"></textarea>
          <button class="btn btn-brand btn-sm rounded-pill w-100" data-action="submit-review" data-order="${data.id}" data-rating="0"><i class="bi bi-send me-1"></i> Submit review</button>
        </div>
      </div>`;
  }

  const payCard = `
    <div class="card border shadow-sm">
      <div class="card-body p-4">
        <h6 class="fw-bold mb-3"><i class="bi bi-cash-coin text-accent me-1"></i>Payments</h6>
        <div class="d-flex justify-content-between mb-2"><span class="text-muted small">Paid</span><strong class="text-success">${fmtMoney(data.paid_total)}</strong></div>
        <div class="d-flex justify-content-between mb-3"><span class="text-muted small">Outstanding</span><strong class="text-accent-dark">${fmtMoney(data.outstanding)}</strong></div>
        <div id="paymentsList" class="vstack gap-2 mb-3">${paymentsHTML(data.payments)}</div>
        <h6 class="fw-bold mb-2">Submit a payment</h6>
        <form id="paymentForm">
          <div class="mb-2"><select class="form-select form-select-sm" id="payMethod">
            ${Object.entries(App.config.payment_methods).map(([k, m]) => `<option value="${k}">${escapeHtml(m.label)}</option>`).join("")}
          </select></div>
          <div class="mb-2"><input type="number" id="payAmount" class="form-control form-control-sm" placeholder="Amount (USD)" min="1" required></div>
          <div class="mb-2"><input type="text" id="payReference" class="form-control form-control-sm" placeholder="Transaction / deposit-slip reference" required></div>
          <div class="small text-muted mb-2" id="payHint">${escapeHtml(App.config.payment_methods[Object.keys(App.config.payment_methods)[0]].hint)}</div>
          <button type="submit" class="btn btn-brand btn-sm rounded-pill w-100"><i class="bi bi-check2-circle me-1"></i> Submit for verification</button>
        </form>
      </div>
    </div>`;

  viewEl().innerHTML = header + `<div class="row g-4"><div class="col-lg-7">${timeline}</div><div class="col-lg-5">${costCard}${payCard}${reviewCard}</div></div>`;

  // Star picker for the review
  const picker = $("starPicker");
  const submitBtn = viewEl().querySelector("[data-action='submit-review']");
  if (picker && submitBtn) {
    picker.querySelectorAll(".star-btn").forEach((b) => {
      b.addEventListener("click", () => {
        const val = Number(b.dataset.star);
        picker.querySelectorAll(".star-btn").forEach((x) => {
          const on = Number(x.dataset.star) <= val;
          x.classList.toggle("active", on);
          x.innerHTML = `<i class="bi ${on ? "bi-star-fill" : "bi-star"}"></i>`;
        });
        submitBtn.dataset.rating = val;
      });
    });
  }

  // Payment method hint
  const methodSel = $("payMethod");
  methodSel.addEventListener("change", () => {
    $("payHint").textContent = App.config.payment_methods[methodSel.value].hint || "";
  });

  $("paymentForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/orders/${data.id}/payments`, {
        method: "POST",
        body: { method: methodSel.value, amount: $("payAmount").value, reference: $("payReference").value },
      });
      showToast("Payment submitted — our team will verify it shortly.", "success");
      viewOrder(id); // refresh inline, no redirect
    } catch (err) { showToast(err.message, "danger", "Payment failed"); }
  });

  // Live refresh
  clearInterval(App.orderTimer);
  App.orderTimer = setInterval(async () => {
    try {
      const fresh = await apiFetch(`/api/orders/${id}`);
      const tl = $("orderTimeline");
      if (tl) tl.innerHTML = timelineHTML(fresh.pipeline, fresh.events, fresh.stage_index);
      const pl = $("paymentsList");
      if (pl) pl.innerHTML = paymentsHTML(fresh.payments);
    } catch (_) { /* ignore transient */ }
  }, 30000);
}

/* ------------------------------------------------------------------ */
/* View: CATALOG + VEHICLE detail (order inline)                       */
/* ------------------------------------------------------------------ */
async function viewCatalog() {
  viewEl().innerHTML = `
    <div class="mb-4">
      <span class="section-kicker">Catalog</span>
      <h1 class="fw-black mb-1">Cars For Sale 🇯🇵</h1>
      <p class="text-muted mb-0">Live inventory from Japanese auctions.</p>
    </div>
    <div class="row g-2 align-items-center mb-4">
      <div class="col-md-4">
        <div class="input-group">
          <span class="input-group-text bg-white border-end-0"><i class="bi bi-search text-muted"></i></span>
          <input type="text" id="catSearch" class="form-control border-start-0" placeholder="Search make, model, year…">
        </div>
      </div>
      <div class="col-md-3"><select id="catSort" class="form-select">
        <option value="newest">Newest first</option>
        <option value="price_asc">Price (low → high)</option>
        <option value="price_desc">Price (high → low)</option>
        <option value="year_desc">Year (newest)</option>
      </select></div>
    </div>
    <div id="catContent">${spinner("Loading cars…")}</div>`;

  const load = debounce(async () => {
    const params = new URLSearchParams({ status: "available", sort: $("catSort").value });
    const q = $("catSearch").value.trim();
    if (q) params.set("q", q);
    const data = await apiFetch("/api/vehicles?" + params.toString());
    const box = $("catContent");
    if (!data.vehicles.length) {
      box.innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-emoji-frown display-4"></i><p class="mt-3 mb-0">No cars match your search.</p></div>`;
      return;
    }
    const heartOn = (id) => App.wishlist.has(id);
    box.innerHTML = `<div class="row g-4">` + data.vehicles.map((v) => `
      <div class="col-md-6 col-lg-4">
        <div class="card h-100 vehicle-card">
          <div class="vehicle-img" data-action="open-vehicle" data-slug="${v.slug}" style="cursor:pointer;">${vehicleImageHTML(v)}
            ${App.me ? `<button class="wish-btn ${heartOn(v.id) ? "active" : ""}" data-action="wish" data-id="${v.id}" title="Save"><i class="bi ${heartOn(v.id) ? "bi-heart-fill" : "bi-heart"}"></i></button>` : ""}
            ${v.auction_grade ? `<span class="badge position-absolute top-0 end-0 m-2 grade-badge">${escapeHtml(v.auction_grade)} ★</span>` : ""}</div>
          <div class="card-body">
            <div class="d-flex justify-content-between">
              <h6 class="fw-bold mb-0">${v.year} ${escapeHtml(v.make)} ${escapeHtml(v.model)}</h6>
              <button class="cmp-btn align-self-start" data-compare="${v.id}" onclick="CompareToggle(${v.id}, this)">${Compare.btnHTML(Compare.has(v.id))}</button>
            </div>
            <small class="text-muted">${escapeHtml(v.transmission)} · ${escapeHtml(v.fuel)} · ${fmtNum(v.mileage_km)} km</small>
            <div class="d-flex justify-content-between align-items-end mt-3">
              <div><div class="text-muted small">Japan (FOB)</div><div class="fw-bold">${fmtMoney(v.fob_price_usd)}</div></div>
              <div class="text-end"><div class="text-muted small">Landed</div><div class="fw-bold text-accent-dark">${fmtMoney(v.landed.total)}</div></div>
            </div>
            <div class="d-grid mt-3">
              <button class="btn btn-outline-brand btn-sm rounded-pill" data-action="open-vehicle" data-slug="${v.slug}">View details <i class="bi bi-arrow-right"></i></button>
            </div>
          </div>
        </div>
      </div>`).join("") + `</div>`;
  }, 200);

  $("catSearch").addEventListener("input", load);
  $("catSort").addEventListener("change", load);
  load();
}

async function viewVehicle(slug) {
  viewEl().innerHTML = spinner("Loading vehicle…");
  const v = await apiFetch(`/api/vehicles/${slug}`);
  const est = v.landed;
  const loggedIn = !!App.me;

  viewEl().innerHTML = `
    <div class="mb-3"><button class="btn btn-sm btn-outline-brand rounded-pill" data-action="go-back"><i class="bi bi-arrow-left"></i> Back to catalog</button></div>
    <div class="row g-4">
      <div class="col-lg-7">
        <div class="card border-0 vehicle-card overflow-hidden">
          <div class="vehicle-img rounded-top" style="height:340px;">${vehicleImageHTML(v, 340)}
            <span class="badge position-absolute top-0 start-0 m-3 status-badge status-${v.status} fs-6">${v.status}</span>
          </div>
        </div>
        <div class="card border mt-4">
          <div class="card-body">
            <h5 class="fw-bold mb-3">Vehicle details</h5>
            <div class="row g-3">
              ${[["bi-calendar3", "Year", v.year], ["bi-speedometer2", "Mileage", `${fmtNum(v.mileage_km)} km`],
                  ["bi-gear", "Transmission", v.transmission], ["bi-fuel-pump", "Fuel", v.fuel],
                  ["bi-cpu", "Engine", v.engine_cc ? `${v.engine_cc} cc` : "—"], ["bi-geo-alt", "Auction", v.auction_location || "Japan"]]
                .map(([ic, l, val]) => `<div class="col-6 col-md-4 detail-chip"><i class="bi ${ic} text-accent"></i><div><small class="text-muted">${l}</small><div class="fw-semibold">${escapeHtml(String(val))}</div></div></div>`).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="col-lg-5">
        <div class="card border shadow-sm">
          <div class="card-body p-4">
            <h3 class="fw-black mb-1">${v.year} ${escapeHtml(v.make)} ${escapeHtml(v.model)}</h3>
            <div class="mb-3"><span class="text-muted">Japan FOB:</span> <strong>${fmtMoney(v.fob_price_usd)}</strong></div>
            <h6 class="fw-bold mb-2"><i class="bi bi-receipt text-accent me-1"></i>Full landed cost — no hidden fees</h6>
            ${costBreakdownHTML(est)}
            ${loggedIn
              ? `<div class="d-grid mt-4">
                  <label class="form-label fw-semibold mb-1">Deposit (USD)</label>
                  <input type="number" id="orderDeposit" class="form-control mb-2" value="${Math.round(v.fob_price_usd * 0.2)}" min="1">
                  <textarea id="orderNotes" class="form-control mb-3" rows="2" placeholder="Notes for our team (optional)"></textarea>
                  <button class="btn btn-accent btn-lg rounded-pill" data-action="create-order" data-slug="${v.slug}"><i class="bi bi-bag-check me-1"></i> Order this car</button>
                </div>`
              : `<div class="d-grid mt-4">
                  <button class="btn btn-accent btn-lg rounded-pill" data-action="prompt-login"><i class="bi bi-box-arrow-in-right me-1"></i> Log in to order</button>
                </div>`}
          </div>
        </div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* View: TRACK (public order lookup)                                   */
/* ------------------------------------------------------------------ */
async function viewTrack() {
  viewEl().innerHTML = `
    <div class="text-center mb-4">
      <span class="section-kicker">Live Tracking</span>
      <h1 class="fw-black">Track Your Car</h1>
      <p class="text-muted">Enter your order number — no login needed. Transparency for everyone.</p>
    </div>
    <div class="row justify-content-center">
      <div class="col-lg-6">
        <div class="input-group input-group-lg">
          <span class="input-group-text bg-white border-end-0"><i class="bi bi-upc-scan text-muted"></i></span>
          <input type="text" id="trackNum" class="form-control border-start-0" placeholder="TA-2026-0001">
          <button class="btn btn-accent rounded-pill px-4" data-action="track-search"><i class="bi bi-search me-1"></i>Track</button>
        </div>
      </div>
    </div>
    <div id="trackOut" class="mt-4"></div>`;
}

async function runTrackSearch() {
  const num = $("trackNum").value.trim();
  if (!num) return;
  const out = $("trackOut");
  out.innerHTML = spinner("Fetching live tracking…");
  try {
    const data = await apiFetch(`/api/orders/public/${encodeURIComponent(num)}`);
    if (!data.found) {
      out.innerHTML = `<div class="alert alert-warning text-center mx-auto" style="max-width:560px;">
        <i class="bi bi-exclamation-triangle me-2"></i>We couldn't find order <strong>${escapeHtml(num)}</strong>.</div>`;
      return;
    }
    const v = data.vehicle;
    out.innerHTML = `
      <div class="row g-4 justify-content-center">
        <div class="col-lg-4">
          <div class="card border shadow-sm">
            <div class="vehicle-img rounded-top" style="height:170px;">${vehicleImageHTML(v, 170)}</div>
            <div class="card-body p-4">
              <h5 class="fw-bold mb-1">${v.year} ${escapeHtml(v.make)} ${escapeHtml(v.model)}</h5>
              <small class="text-muted d-block mb-3">Order ${escapeHtml(data.order_number)} · ${escapeHtml(data.created_at)}</small>
              <div class="d-flex justify-content-between border-top pt-2"><span class="text-muted small">Paid</span><span class="fw-semibold">${fmtMoney(data.paid_total)}</span></div>
              <div class="d-flex justify-content-between border-top pt-2"><span class="text-muted small">Total</span><span class="fw-semibold">${fmtMoney(data.total_estimate)}</span></div>
              <div class="d-flex justify-content-between border-top pt-2"><span class="text-muted small">Outstanding</span><span class="fw-semibold text-accent-dark">${fmtMoney(data.outstanding)}</span></div>
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
              ${timelineHTML(data.pipeline || [], data.events, data.stage_index)}
            </div>
          </div>
        </div>
      </div>`;
  } catch (err) {
    out.innerHTML = `<div class="alert alert-danger text-center mx-auto" style="max-width:560px;">Could not load tracking: ${escapeHtml(err.message)}</div>`;
  }
}

/* ------------------------------------------------------------------ */
/* View: PRICING calculator                                            */
/* ------------------------------------------------------------------ */
async function viewPricing() {
  const cm = App.config.cost_model;
  viewEl().innerHTML = `
    <div class="text-center mb-4">
      <span class="section-kicker">Pricing</span>
      <h1 class="fw-black">Landed Cost Calculator</h1>
      <p class="text-muted">Our only income is a fixed auction &amp; shipping assistance fee of <strong>${fmtMoney(cm.commission)}</strong>. Everything else is passed through at cost. Estimate any car instantly.</p>
    </div>
    <div class="row g-4 justify-content-center">
      <div class="col-md-6 col-lg-5">
        <div class="card border shadow-sm">
          <div class="card-body p-4">
            <label class="form-label fw-semibold">Japan auction price (FOB) — USD</label>
            <div class="input-group mb-3"><span class="input-group-text">$</span>
              <input type="number" id="calcFob" class="form-control" value="5500" min="0"></div>
            <label class="form-label fw-semibold">Freight — USD</label>
            <div class="input-group"><span class="input-group-text">$</span>
              <input type="number" id="calcFreight" class="form-control" value="${cm.freight}" min="0"></div>
          </div>
        </div>
      </div>
      <div class="col-md-6 col-lg-6">
        <div class="card border shadow-sm">
          <div class="card-body p-4">
            <div id="calcOut" style="background:var(--grey-50);border-radius:14px;padding:1rem;"></div>
          </div>
        </div>
      </div>
    </div>`;

  const recalc = () => {
    const fob = parseFloat($("calcFob").value) || 0;
    const freight = parseFloat($("calcFreight").value) || cm.freight;
    const cif = fob + freight;
    const insurance = cif * cm.insurance_rate;
    const duty = cif * cm.duty_rate;
    const surtax = cif * cm.surtax_rate;
    const vat = (cif + duty + surtax) * cm.vat_rate;
    const clearing = cm.clearing_fee + cm.inspection_fee;
    const total = cif + insurance + duty + surtax + vat + cm.auction_fees + cm.port_handling + clearing + cm.transport_to_hre + cm.commission;
    $("calcOut").innerHTML = costBreakdownHTML({
      fob, freight, insurance, auction_fees: cm.auction_fees, duty, surtax, vat,
      port_handling: cm.port_handling, clearing: cm.clearing_fee, inspection: cm.inspection_fee,
      transport: cm.transport_to_hre, commission: cm.commission, total,
    });
  };
  $("calcFob").addEventListener("input", recalc);
  $("calcFreight").addEventListener("input", recalc);
  recalc();
}

/* ------------------------------------------------------------------ */
/* View: ADMIN                                                         */
/* ------------------------------------------------------------------ */
async function viewAdminOverview() {
  viewEl().innerHTML = spinner("Loading admin overview…");
  const s = await apiFetch("/api/admin/stats");
  const tiles = [
    ["vehicles", "bi-car-front", "Total vehicles", s.vehicles],
    ["available", "bi-check-circle", "Available", s.available],
    ["reserved", "bi-clock-history", "Reserved", s.reserved],
    ["sold", "bi-trophy", "Sold", s.sold],
    ["orders", "bi-bag", "Orders", s.orders],
    ["in_transit", "bi-truck", "In transit", s.in_transit],
    ["customers", "bi-people", "Customers", s.customers],
    ["pending_payments", "bi-hourglass-split", "Pending payments", s.pending_payments],
  ];
  viewEl().innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4">
      <div><span class="section-kicker">Admin</span><h1 class="fw-black mb-0">Overview</h1></div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-brand rounded-pill" data-action="go-admin-orders">Orders</button>
        <button class="btn btn-outline-brand rounded-pill" data-action="go-admin-vehicles">Vehicles</button>
      </div>
    </div>
    <div class="row g-3">
      ${tiles.map(([k, ic, label, val]) => `
        <div class="col-6 col-md-3">
          <div class="stat-tile p-3">
            <div class="stat-icon mb-2" style="background:rgba(192,16,46,0.1);color:var(--crimson);"><i class="bi ${ic}"></i></div>
            <div class="fw-black fs-4">${val}</div>
            <small class="text-muted">${label}</small>
          </div>
        </div>`).join("")}
    </div>
    <div class="card border shadow-sm mt-4">
      <div class="card-body p-4 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div><h6 class="fw-bold mb-1"><i class="bi bi-cash-stack text-accent me-1"></i>Verified revenue</h6>
          <span class="text-muted small">Total of all verified customer payments</span></div>
        <div class="fw-black fs-3 text-success">${fmtMoney(s.revenue_verified)}</div>
      </div>
    </div>`;
}

async function viewAdminOrders() {
  viewEl().innerHTML = spinner("Loading orders…");
  const data = await apiFetch("/api/admin/orders");
  viewEl().innerHTML = `
    <div class="mb-3"><button class="btn btn-sm btn-outline-brand rounded-pill" data-action="go-admin"><i class="bi bi-arrow-left"></i> Admin</button></div>
    <h2 class="fw-black mb-3">All Orders</h2>
    <div class="card border shadow-sm"><div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead><tr><th>Order</th><th>Customer</th><th>Vehicle</th><th>Status</th><th>Paid / Total</th><th></th></tr></thead>
        <tbody>
          ${data.orders.map((o) => `
            <tr class="app-order-row" data-action="open-admin-order" data-id="${o.id}">
              <td class="fw-semibold">#${escapeHtml(o.order_number)}</td>
              <td>${escapeHtml(o.customer)}<br><small class="text-muted">${escapeHtml(o.customer_phone)}</small></td>
              <td>${escapeHtml(o.vehicle)}</td>
              <td>${statusBadge(o.status_label)}</td>
              <td><strong>${fmtMoney(o.paid_total)}</strong> / ${fmtMoney(o.total_estimate)}</td>
              <td><i class="bi bi-chevron-right text-muted"></i></td>
            </tr>`).join("")}
        </tbody>
      </table></div></div>`;
}

async function viewAdminOrder(id) {
  viewEl().innerHTML = spinner("Loading order…");
  const d = await apiFetch(`/api/admin/orders/${id}`);
  viewEl().innerHTML = `
    <div class="mb-3"><button class="btn btn-sm btn-outline-brand rounded-pill" data-action="go-admin-orders"><i class="bi bi-arrow-left"></i> All orders</button></div>
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
      <div>
        <h2 class="fw-black mb-0">#${escapeHtml(d.order_number)}</h2>
        <small class="text-muted">${escapeHtml(d.customer.name)} · ${escapeHtml(d.customer.phone)} · ${escapeHtml(d.customer.email)}</small>
      </div>
      <div class="d-flex gap-2 align-items-center">
        <div>${statusBadge(d.status_label, "status-shipping fs-6")}</div>
        <span class="badge status-badge status-pending">${d.events.length} events</span>
      </div>
    </div>
    <div class="row g-4">
      <div class="col-lg-6">
        <div class="card border shadow-sm mb-4">
          <div class="card-body p-4">
            <h6 class="fw-bold mb-2"><i class="bi bi-arrow-repeat text-accent me-1"></i>Advance stage</h6>
            <select id="admStage" class="form-select mb-2">
              ${d.pipeline.map((s, i) => `<option value="${s.key}" ${i === d.stage_index ? "selected" : ""}>${i + 1}. ${escapeHtml(s.label)}</option>`).join("")}
            </select>
            <textarea id="admNote" class="form-control mb-2" rows="2" placeholder="Note shown to customer (e.g. vessel name, ETA)"></textarea>
            <input type="text" id="admEvidence" class="form-control mb-2" placeholder="Evidence URL (optional — receipt/photo)">
            <button class="btn btn-brand btn-sm rounded-pill w-100" data-action="advance-stage" data-id="${d.id}"><i class="bi bi-send me-1"></i> Post update</button>
          </div>
        </div>
        <div class="card border shadow-sm">
          <div class="card-body p-4">
            <h6 class="fw-bold mb-3"><i class="bi bi-credit-card text-accent me-1"></i>Payments (${fmtMoney(d.paid_total)} of ${fmtMoney(d.total_estimate)})</h6>
            <div class="vstack gap-2">${paymentsHTML(d.payments, { canVerify: true })}</div>
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card border shadow-sm">
          <div class="card-body p-4">
            <h6 class="fw-bold mb-3"><i class="bi bi-signpost-2 text-accent me-2"></i>Journey</h6>
            <div id="admTimeline">${timelineHTML(d.pipeline, d.events, d.stage_index)}</div>
          </div>
        </div>
      </div>
    </div>`;
}

async function viewAdminVehicles() {
  viewEl().innerHTML = spinner("Loading vehicles…");
  const data = await apiFetch("/api/admin/vehicles");
  viewEl().innerHTML = `
    <div class="mb-3"><button class="btn btn-sm btn-outline-brand rounded-pill" data-action="go-admin"><i class="bi bi-arrow-left"></i> Admin</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2 class="fw-black mb-0">Vehicles</h2>
      <button class="btn btn-accent rounded-pill" data-action="new-vehicle"><i class="bi bi-plus-lg me-1"></i> New vehicle</button>
    </div>
    <div class="card border shadow-sm"><div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead><tr><th>Vehicle</th><th>Year</th><th>FOB</th><th>Landed</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${data.vehicles.map((v) => `
            <tr>
              <td class="fw-semibold">${escapeHtml(v.make)} ${escapeHtml(v.model)}</td>
              <td>${v.year}</td>
              <td>${fmtMoney(v.fob_price_usd)}</td>
              <td>${fmtMoney(v.landed.total)}</td>
              <td>${statusBadge(v.status, v.status === "available" ? "status-available" : v.status === "sold" ? "status-sold" : "status-reserved")}</td>
              <td class="text-end">
                <button class="btn btn-sm btn-outline-brand rounded-pill" data-action="edit-vehicle" data-id="${v.id}">Edit</button>
                <button class="btn btn-sm btn-outline-danger rounded-pill" data-action="delete-vehicle" data-id="${v.id}"><i class="bi bi-trash"></i></button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table></div></div>`;
}

async function viewVehicleForm(id) {
  let v = null;
  let html = `
    <div class="mb-3"><button class="btn btn-sm btn-outline-brand rounded-pill" data-action="go-admin-vehicles"><i class="bi bi-arrow-left"></i> Vehicles</button></div>
    <h2 class="fw-black mb-3">${id ? "Edit vehicle" : "New vehicle"}</h2>
    <div class="row justify-content-center"><div class="col-lg-8">
    <div class="card border shadow-sm"><div class="card-body p-4">
      <form id="vehForm">`;
  if (id) {
    const data = await apiFetch(`/api/vehicles/${(await fetchVehicleSlug(id))}`);
    v = data;
    html += `<input type="hidden" id="vehId" value="${id}">`;
  }
  const fields = `
    <div class="row g-3">
      <div class="col-md-4"><label class="form-label fw-semibold">Make</label><input class="form-control" id="vehMake" value="${escapeHtml(v ? v.make : "")}" required></div>
      <div class="col-md-4"><label class="form-label fw-semibold">Model</label><input class="form-control" id="vehModel" value="${escapeHtml(v ? v.model : "")}" required></div>
      <div class="col-md-4"><label class="form-label fw-semibold">Year</label><input type="number" class="form-control" id="vehYear" value="${v ? v.year : 2016}" required></div>
      <div class="col-md-4"><label class="form-label fw-semibold">Mileage (km)</label><input type="number" class="form-control" id="vehMileage" value="${v ? v.mileage_km : 50000}" required></div>
      <div class="col-md-4"><label class="form-label fw-semibold">Transmission</label>
        <select class="form-select" id="vehTrans"><option ${!v || v.transmission === "Automatic" ? "selected" : ""}>Automatic</option><option ${v && v.transmission === "Manual" ? "selected" : ""}>Manual</option></select></div>
      <div class="col-md-4"><label class="form-label fw-semibold">Fuel</label>
        <select class="form-select" id="vehFuel"><option ${!v || v.fuel === "Petrol" ? "selected" : ""}>Petrol</option><option ${v && v.fuel === "Diesel" ? "selected" : ""}>Diesel</option><option ${v && v.fuel === "Hybrid" ? "selected" : ""}>Hybrid</option></select></div>
      <div class="col-md-4"><label class="form-label fw-semibold">Engine (cc)</label><input type="number" class="form-control" id="vehEngine" value="${v ? (v.engine_cc || "") : ""}"></div>
      <div class="col-md-4"><label class="form-label fw-semibold">Auction grade</label><input class="form-control" id="vehGrade" value="${escapeHtml(v ? (v.auction_grade || "") : "")}"></div>
      <div class="col-md-4"><label class="form-label fw-semibold">Auction location</label><input class="form-control" id="vehLocation" value="${escapeHtml(v ? (v.auction_location || "") : "")}"></div>
      <div class="col-md-6"><label class="form-label fw-semibold">FOB price (USD)</label><input type="number" class="form-control" id="vehFob" value="${v ? v.fob_price_usd : 5000}" required></div>
      <div class="col-md-6"><label class="form-label fw-semibold">Freight (USD)</label><input type="number" class="form-control" id="vehFreight" value="${v ? v.freight_usd : App.config.cost_model.freight}"></div>
      <div class="col-md-6"><label class="form-label fw-semibold">Status</label>
        <select class="form-select" id="vehStatus">
          ${["available", "reserved", "sold"].map((s) => `<option value="${s}" ${v && v.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select></div>
      <div class="col-md-6"><label class="form-label fw-semibold">Featured</label>
        <select class="form-select" id="vehFeatured"><option value="false" ${!v || !v.featured ? "selected" : ""}>No</option><option value="true" ${v && v.featured ? "selected" : ""}>Yes</option></select></div>
      <div class="col-12"><label class="form-label fw-semibold">Description</label><textarea class="form-control" id="vehDesc" rows="3">${escapeHtml(v ? (v.description || "") : "")}</textarea></div>
      <div class="col-12"><label class="form-label fw-semibold">Auction sheet URL</label><input class="form-control" id="vehSheet" value="${escapeHtml(v ? (v.auction_sheet || "") : "")}"></div>
      <div class="col-12"><label class="form-label fw-semibold">Photos (JSON array of URLs)</label><input class="form-control" id="vehPhotos" value="${escapeHtml(v ? v.photos : "[]")}"></div>
    </div>
    <div class="d-flex gap-2 mt-4">
      <button type="submit" class="btn btn-accent rounded-pill px-4">${id ? "Save changes" : "Add vehicle"}</button>
      <button type="button" class="btn btn-outline-brand rounded-pill" data-action="go-admin-vehicles">Cancel</button>
    </div>`;
  html += fields + `</form></div></div></div></div>`;
  viewEl().innerHTML = html;

  $("vehForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      make: $("vehMake").value, model: $("vehModel").value,
      year: $("vehYear").value, mileage_km: $("vehMileage").value,
      transmission: $("vehTrans").value, fuel: $("vehFuel").value,
      engine_cc: $("vehEngine").value, auction_grade: $("vehGrade").value,
      auction_location: $("vehLocation").value, fob_price_usd: $("vehFob").value,
      freight_usd: $("vehFreight").value, status: $("vehStatus").value,
      featured: $("vehFeatured").value === "true", description: $("vehDesc").value,
      auction_sheet: $("vehSheet").value,
      photos: (() => { try { return JSON.parse($("vehPhotos").value); } catch { return []; } })(),
    };
    try {
      if (id) {
        await apiFetch(`/api/admin/vehicles/${id}`, { method: "PUT", body: payload });
        showToast("Vehicle updated.", "success");
      } else {
        await apiFetch("/api/admin/vehicles", { method: "POST", body: payload });
        showToast("Vehicle added to catalog.", "success");
      }
      viewAdminVehicles();
    } catch (err) { showToast(err.message, "danger"); }
  });
}

async function fetchVehicleSlug(id) {
  const data = await apiFetch("/api/admin/vehicles");
  const v = data.vehicles.find((x) => x.id === Number(id));
  return v ? v.slug : "";
}

/* ------------------------------------------------------------------ */
/* View: SAVED (wishlist)                                              */
/* ------------------------------------------------------------------ */
function savedCardHTML(v) {
  return `
    <div class="col-md-6 col-lg-4">
      <div class="card h-100 vehicle-card">
        <div class="vehicle-img">
          <button class="wish-btn active" data-action="wish" data-id="${v.id}" title="Remove from list"><i class="bi bi-heart-fill"></i></button>
          ${vehicleImageHTML(v, 200)}
        </div>
        <div class="card-body">
          <div class="d-flex justify-content-between">
            <h6 class="fw-bold mb-0">${v.year} ${escapeHtml(v.make)} ${escapeHtml(v.model)}</h6>
            <button class="cmp-btn align-self-start" data-compare="${v.id}" onclick="CompareToggle(${v.id}, this)">${Compare.btnHTML(Compare.has(v.id))}</button>
          </div>
          <small class="text-muted">${escapeHtml(v.transmission)} · ${fmtNum(v.mileage_km)} km</small>
          <div class="d-flex justify-content-between mt-3">
            <div><div class="text-muted small">Landed</div><div class="fw-bold text-accent-dark">${fmtMoney(v.landed.total)}</div></div>
            <div class="text-end"><div class="text-muted small">FOB</div><div class="fw-bold">${fmtMoney(v.fob_price_usd)}</div></div>
          </div>
          <div class="d-grid mt-3"><a href="/catalog/${v.slug}" class="btn btn-outline-brand btn-sm rounded-pill">View details <i class="bi bi-arrow-right"></i></a></div>
        </div>
      </div>
    </div>`;
}

async function viewSaved() {
  viewEl().innerHTML = spinner("Loading your saved cars…");
  const data = await apiFetch("/api/wishlist");
  if (!data.vehicles.length) {
    viewEl().innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-heart display-3 text-muted"></i>
        <h5 class="fw-bold mt-3">No saved cars yet</h5>
        <p class="text-muted">Tap the ❤️ on any car to save it here for later.</p>
        <button class="btn btn-accent rounded-pill mt-2" data-action="go-catalog">Browse cars <i class="bi bi-arrow-right"></i></button>
      </div>`;
    return;
  }
  viewEl().innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div><span class="section-kicker">Saved</span><h1 class="fw-black mb-0">My List ❤️</h1></div>
      <button class="btn btn-accent rounded-pill" data-action="go-catalog"><i class="bi bi-plus-lg me-1"></i> Add cars</button>
    </div>
    <div class="row g-4">${data.vehicles.map(savedCardHTML).join("")}</div>`;
}

/* ------------------------------------------------------------------ */
/* View: ADMIN REQUESTS (source-on-demand)                             */
/* ------------------------------------------------------------------ */
async function viewAdminRequests() {
  viewEl().innerHTML = spinner("Loading requests…");
  const data = await apiFetch("/api/admin/requests");
  if (!data.requests.length) {
    viewEl().innerHTML = `
      <div class="mb-3"><button class="btn btn-sm btn-outline-brand rounded-pill" data-action="go-admin"><i class="bi bi-arrow-left"></i> Admin</button></div>
      <div class="text-center py-5"><i class="bi bi-search-heart display-3 text-muted"></i>
        <h5 class="fw-bold mt-3">No car requests yet</h5>
        <p class="text-muted">Customers can request any car on the site — requests land here.</p></div>`;
    return;
  }
  viewEl().innerHTML = `
    <div class="mb-3"><button class="btn btn-sm btn-outline-brand rounded-pill" data-action="go-admin"><i class="bi bi-arrow-left"></i> Admin</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h2 class="fw-black mb-0">Car Requests <span class="text-gold">· source-on-demand</span></h2>
      <a href="/request-a-car" target="_blank" class="btn btn-outline-brand btn-sm rounded-pill">View public form</a>
    </div>
    <div class="card border shadow-sm"><div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead><tr><th>Requested</th><th>Customer</th><th>Specs</th><th>Budget</th><th>Status</th></tr></thead>
        <tbody>
          ${data.requests.map((r) => `
            <tr>
              <td class="fw-semibold">${escapeHtml(r.title)}<br><small class="text-muted">${escapeHtml(r.created_at)}</small></td>
              <td>${escapeHtml(r.name)}<br><small class="text-muted">${escapeHtml(r.phone)}${r.email ? " · " + escapeHtml(r.email) : ""}</small></td>
              <td class="small text-muted">${r.fuel ? escapeHtml(r.fuel) + " · " : ""}${r.year_min || r.year_max ? (r.year_min || "?") + "–" + (r.year_max || "?") + " · " : ""}${escapeHtml(r.notes || "")}</td>
              <td class="fw-semibold">${r.budget_max_usd ? fmtMoney(r.budget_max_usd) : "—"}</td>
              <td>
                <select class="form-select form-select-sm d-inline-block w-auto" data-req-status="${r.id}">
                  ${["new", "sourcing", "sourced", "closed"].map((s) => `<option value="${s}" ${r.status === s ? "selected" : ""}>${s}</option>`).join("")}
                </select>
              </td>
            </tr>`).join("")}
        </tbody>
      </table></div></div>`;

  viewEl().querySelectorAll("[data-req-status]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      try {
        await apiFetch(`/api/admin/requests/${sel.dataset.reqStatus}/status`, { method: "POST", body: { status: sel.value } });
        showToast("Request status updated.", "success");
      } catch (err) { showToast(err.message, "danger"); }
    });
  });
}

/* ------------------------------------------------------------------ */
/* View: ADMIN INQUIRIES                                               */
/* ------------------------------------------------------------------ */
async function viewAdminInquiries() {
  viewEl().innerHTML = spinner("Loading enquiries…");
  const data = await apiFetch("/api/admin/inquiries");
  viewEl().innerHTML = `
    <div class="mb-3"><button class="btn btn-sm btn-outline-brand rounded-pill" data-action="go-admin"><i class="bi bi-arrow-left"></i> Admin</button></div>
    <h2 class="fw-black mb-3">Enquiries</h2>
    <div class="card border shadow-sm"><div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead><tr><th>Vehicle</th><th>Customer</th><th>Message</th><th>Source</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${data.inquiries.map((i) => `
            <tr>
              <td class="fw-semibold">${escapeHtml(i.vehicle)}</td>
              <td>${escapeHtml(i.name)}<br><small class="text-muted">${escapeHtml(i.phone)}${i.email ? " · " + escapeHtml(i.email) : ""}</small></td>
              <td class="small text-muted">${escapeHtml(i.message || "—")}</td>
              <td><span class="badge status-badge status-pending">${escapeHtml(i.source)}</span></td>
              <td>${statusBadge(i.status, i.status === "new" ? "status-pending" : i.status === "replied" ? "status-shipping" : "status-verified")}</td>
              <td class="text-end">
                <select class="form-select form-select-sm d-inline-block w-auto" data-inq-status="${i.id}">
                  <option value="new" ${i.status === "new" ? "selected" : ""}>New</option>
                  <option value="replied" ${i.status === "replied" ? "selected" : ""}>Replied</option>
                  <option value="closed" ${i.status === "closed" ? "selected" : ""}>Closed</option>
                </select>
              </td>
            </tr>`).join("")}
        </tbody>
      </table></div></div>`;

  viewEl().querySelectorAll("[data-inq-status]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      try {
        await apiFetch(`/api/admin/inquiries/${sel.dataset.inqStatus}/status`, {
          method: "POST", body: { status: sel.value },
        });
        showToast("Inquiry status updated.", "success");
      } catch (err) { showToast(err.message, "danger"); }
    });
  });
}

/* ------------------------------------------------------------------ */
/* Router (hash-based, zero page redirects)                            */
/* ------------------------------------------------------------------ */
function buildHash(view, params = {}) {
  switch (view) {
    case "order": return `#/orders/${params.id}`;
    case "vehicle": return `#/cars/${params.slug}`;
    case "admin_order": return `#/admin/orders/${params.id}`;
    case "admin_vehicle_form": return params.id ? `#/admin/vehicles/edit/${params.id}` : "#/admin/vehicles/new";
    case "admin_overview": return "#/admin";
    case "admin_orders": return "#/admin/orders";
    case "admin_vehicles": return "#/admin/vehicles";
    case "catalog": return "#/cars";
    case "track": return "#/track";
    case "pricing": return "#/pricing";
    case "login": return "#/login";
    case "saved": return "#/saved";
    case "admin_inquiries": return "#/admin/inquiries";
    case "admin_requests": return "#/admin/requests";
    default: return "#/dashboard";
  }
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean);
  switch (parts[0]) {
    case "orders": return { view: "order", params: { id: parts[1] } };
    case "cars":
      if (parts[1]) return { view: "vehicle", params: { slug: parts[1] } };
      return { view: "catalog", params: {} };
    case "track": return { view: "track", params: {} };
    case "pricing": return { view: "pricing", params: {} };
    case "login": return { view: "login", params: {} };
    case "saved": return { view: "saved", params: {} };
    case "admin":
      if (parts[1] === "requests") return { view: "admin_requests", params: {} };
      if (parts[1] === "inquiries") return { view: "admin_inquiries", params: {} };
      if (parts[1] === "orders" && parts[2]) return { view: "admin_order", params: { id: parts[2] } };
      if (parts[1] === "orders") return { view: "admin_orders", params: {} };
      if (parts[1] === "vehicles" && parts[2] === "edit") return { view: "admin_vehicle_form", params: { id: parts[3] } };
      if (parts[1] === "vehicles" && parts[2] === "new") return { view: "admin_vehicle_form", params: {} };
      if (parts[1] === "vehicles") return { view: "admin_vehicles", params: {} };
      return { view: "admin_overview", params: {} };
    default: return { view: "dashboard", params: {} };
  }
}

const RENDERERS = {
  login: viewLogin,
  dashboard: viewDashboard,
  order: viewOrder,
  catalog: viewCatalog,
  vehicle: viewVehicle,
  track: viewTrack,
  pricing: viewPricing,
  admin_overview: viewAdminOverview,
  admin_orders: viewAdminOrders,
  admin_order: viewAdminOrder,
  admin_vehicles: viewAdminVehicles,
  admin_vehicle_form: viewVehicleForm,
  saved: viewSaved,
  admin_inquiries: viewAdminInquiries,
  admin_requests: viewAdminRequests,
};

function goTo(view, params = {}) {
  const h = buildHash(view, params);
  if (location.hash !== h) location.hash = h;
  else setView(view, params);
}

async function setView(view, params = {}) {
  if (authRequired(view) && !App.me) { goTo("login"); return; }
  // Portal guards — admins use the admin portal, clients the client portal
  if (PORTAL === "admin") {
    if (!App.me || !App.me.is_admin) { goTo("login"); return; }
    if (!view.startsWith("admin")) { goTo("admin_overview"); return; }
  } else if (view.startsWith("admin")) {
    if (App.me && App.me.is_admin) { location.href = "/admin"; return; }
    goTo("dashboard"); return;
  }
  App.view = view;
  App.params = params;
  updateTabs();
  const renderer = RENDERERS[view] || viewDashboard;
  viewEl().classList.remove("app-view");
  void viewEl().offsetWidth; // restart animation
  viewEl().classList.add("app-view");
  try {
    await renderer(params.id || params.slug || params);
  } catch (err) {
    if (err.status === 401) { App.me = null; updateChip(); goTo("login"); }
    else viewEl().innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}

/* ------------------------------------------------------------------ */
/* Tabs + user chip                                                    */
/* ------------------------------------------------------------------ */
function updateTabs() {
  const tabs = [];
  if (PORTAL === "admin") {
    tabs.push(
      { key: "admin_overview", label: "Overview", icon: "bi-shield-lock", admin: true },
      { key: "admin_orders", label: "Orders", icon: "bi-bag", admin: true },
      { key: "admin_inquiries", label: "Enquiries", icon: "bi-envelope", admin: true },
      { key: "admin_requests", label: "Requests", icon: "bi-search-heart", admin: true },
      { key: "admin_vehicles", label: "Vehicles", icon: "bi-car-front", admin: true },
    );
  } else {
    tabs.push(
      { key: "dashboard", label: "Dashboard", icon: "bi-grid-1x2" },
      { key: "catalog", label: "Cars", icon: "bi-car-front" },
      { key: "saved", label: "Saved", icon: "bi-heart" },
      { key: "track", label: "Track", icon: "bi-geo-alt" },
      { key: "pricing", label: "Pricing", icon: "bi-calculator" },
    );
  }
  const active = App.view;
  const nav = $("appNav");
  if (!nav) return;
  nav.innerHTML = tabs.map((t) => `
    <button class="app-tab ${t.admin ? "admin-tab" : ""} ${active === t.key ? "active" : ""}"
            data-action="nav-${t.key}" title="${t.label}">
      <i class="bi ${t.icon}"></i>
      <span>${t.label}</span>
    </button>`).join("");
}

/* ------------------------------------------------------------------ */
/* Notification bell                                                    */
/* ------------------------------------------------------------------ */
const Notifs = {
  items: [],
  async load() {
    try { Notifs.items = (await apiFetch("/api/notifications")).notifications; }
    catch (_) { Notifs.items = []; }
    Notifs.renderList();
  },
  async unread() {
    if (!App.me) return;
    try {
      const d = await apiFetch("/api/notifications/unread-count");
      const badge = $("notifBadge");
      if (!badge) return;
      if (d.count > 0) {
        badge.textContent = d.count > 9 ? "9+" : d.count;
        badge.classList.remove("d-none");
      } else {
        badge.classList.add("d-none");
      }
    } catch (_) { /* ignore */ }
  },
  renderList() {
    const list = $("notifList");
    if (!list) return;
    if (!Notifs.items.length) {
      list.innerHTML = `<div class="notif-empty"><i class="bi bi-bell-slash"></i><span>No notifications yet</span></div>`;
      return;
    }
    list.innerHTML = Notifs.items.map((n) => `
      <button class="notif-item ${n.read ? "" : "unread"}" data-action="notif-open" data-order="${n.order_id || ""}">
        <div class="notif-dot"></div>
        <div class="flex-grow-1">
          <div class="notif-title">${escapeHtml(n.title)}</div>
          ${n.body ? `<div class="notif-body">${escapeHtml(n.body)}</div>` : ""}
          <div class="notif-time">${escapeHtml(n.created_at)}</div>
        </div>
      </button>`).join("");
  },
  async toggle() {
    const panel = $("notifPanel");
    if (!panel) return;
    const willOpen = panel.classList.contains("d-none");
    if (willOpen) {
      panel.classList.remove("d-none");
      Notifs.load();
    } else {
      panel.classList.add("d-none");
    }
  },
  async readAll() {
    try { await apiFetch("/api/notifications/read-all", { method: "POST" }); } catch (_) {}
    Notifs.items = Notifs.items.map((n) => ({ ...n, read: true }));
    Notifs.renderList();
    Notifs.unread();
    showToast("All notifications marked as read.", "info");
  },
};

function renderNotifBell() {
  const wrap = $("appNotif");
  if (!wrap) return;
  if (!App.me) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = `
    <div class="notif-wrap">
      <button class="notif-bell" data-action="notif-toggle" aria-label="Notifications">
        <i class="bi bi-bell-fill"></i>
        <span class="notif-badge d-none" id="notifBadge">0</span>
      </button>
      <div class="notif-panel d-none" id="notifPanel">
        <div class="notif-head d-flex justify-content-between align-items-center px-3 py-2">
          <strong><i class="bi bi-bell-fill me-1"></i>Notifications</strong>
          <button class="btn btn-sm btn-link p-0" data-action="notif-readall">Mark all read</button>
        </div>
        <div class="notif-list" id="notifList"></div>
      </div>
    </div>`;
  Notifs.unread();
}

function updateChip() {
  const chip = $("appUserChip");
  if (!chip) return;
  if (App.me) {
    chip.innerHTML = `
      <div class="user-chip">
        <i class="bi bi-person-circle fs-5"></i>
        <div class="lh-1"><div class="small fw-bold">${escapeHtml(App.me.name)}</div>
          <div class="text-white-50" style="font-size:0.7rem;">${App.me.is_admin ? "Administrator" : "Customer"}</div></div>
      </div>
      <button class="btn btn-sm btn-outline-light rounded-pill" data-action="logout"><i class="bi bi-box-arrow-right"></i></button>`;
  } else {
    chip.innerHTML = `<button class="btn btn-sm btn-accent rounded-pill" data-action="go-login">Log in / Register</button>`;
  }
}

/* ------------------------------------------------------------------ */
/* Global click delegation                                             */
/* ------------------------------------------------------------------ */
const Actions = {
  "nav-dashboard": () => goTo("dashboard"),
  "nav-catalog": () => goTo("catalog"),
  "nav-track": () => goTo("track"),
  "nav-pricing": () => goTo("pricing"),
  "nav-admin_overview": () => goTo("admin_overview"),
  "go-catalog": () => goTo("catalog"),
  "go-back": () => history.back(),
  "go-login": () => goTo("login"),
  "go-admin": () => goTo("admin_overview"),
  "go-admin-orders": () => goTo("admin_orders"),
  "go-admin-vehicles": () => goTo("admin_vehicles"),
  "open-order": (el) => goTo("order", { id: el.dataset.id }),
  "open-vehicle": (el) => goTo("vehicle", { slug: el.dataset.slug }),
  "open-admin-order": (el) => goTo("admin_order", { id: el.dataset.id }),
  "nav-saved": () => goTo("saved"),
  "nav-admin_inquiries": () => goTo("admin_inquiries"),
  "nav-admin_requests": () => goTo("admin_requests"),
  "nav-admin_orders": () => goTo("admin_orders"),
  "nav-admin_vehicles": () => goTo("admin_vehicles"),
  "submit-review": async (el) => {
    const rating = parseInt(el.dataset.rating || "0", 10);
    if (!rating) { showToast("Please pick a star rating.", "info"); return; }
    try {
      await apiFetch("/api/reviews", {
        method: "POST",
        body: { order_id: el.dataset.order, rating, comment: ($("reviewComment")?.value || "").trim() },
      });
      showToast("Thanks for your review! It will appear once approved. ⭐", "success");
      viewOrder(el.dataset.order);
    } catch (err) { showToast(err.message, "danger"); }
  },
  "wish": async (el) => {
    const id = Number(el.dataset.id);
    if (!App.me) { showToast("Log in to save cars.", "info"); return; }
    try {
      if (App.wishlist.has(id)) {
        await apiFetch(`/api/wishlist/${id}`, { method: "DELETE" });
        App.wishlist.delete(id);
        el.classList.remove("active");
        el.innerHTML = '<i class="bi bi-heart"></i>';
        if (App.view === "saved") viewSaved();
        else showToast("Removed from your list.", "info");
      } else {
        await apiFetch("/api/wishlist", { method: "POST", body: { vehicle_id: id } });
        App.wishlist.add(id);
        el.classList.add("active");
        el.innerHTML = '<i class="bi bi-heart-fill"></i>';
        showToast("Saved to your list! ❤️", "success");
      }
    } catch (err) { showToast(err.message, "danger"); }
  },
  "new-vehicle": () => goTo("admin_vehicle_form", {}),
  "edit-vehicle": (el) => goTo("admin_vehicle_form", { id: el.dataset.id }),
  "prompt-login": () => { showToast("Please log in to order this car.", "info", "Login required"); goTo("login"); },
  "track-search": () => runTrackSearch(),
  "notif-toggle": () => Notifs.toggle(),
  "notif-readall": () => Notifs.readAll(),
  "notif-open": (el) => {
    const orderId = el.dataset.order;
    const panel = $("notifPanel");
    if (panel) panel.classList.add("d-none");
    if (orderId && App.me) goTo("order", { id: orderId });
  },
  "logout": async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    App.me = null;
    clearInterval(App.orderTimer);
    updateChip();
    renderNotifBell();
    showToast("You've been logged out.", "info");
    goTo("login");
  },
  "create-order": async (el) => {
    const v = await apiFetch(`/api/vehicles/${el.dataset.slug}`);
    try {
      const data = await apiFetch("/api/orders", {
        method: "POST",
        body: { vehicle_id: v.id, deposit: $("orderDeposit")?.value, notes: $("orderNotes")?.value },
      });
      showToast(`Order ${data.order_number} created! Track it live.`, "success");
      goTo("order", { id: data.order_id });
    } catch (err) { showToast(err.message, "danger", "Could not order"); }
  },
  "advance-stage": async (el) => {
    const id = el.dataset.id;
    const stage = $("admStage").value;
    const note = $("admNote").value;
    const evidence = $("admEvidence").value;
    try {
      await apiFetch(`/api/admin/orders/${id}/advance`, {
        method: "POST",
        body: { stage, note, evidence_url: evidence },
      });
      showToast(`Stage updated to "${stage}". Customer notified on their tracker.`, "success");
      viewAdminOrder(id);
    } catch (err) { showToast(err.message, "danger"); }
  },
  "verify-payment": async (el) => {
    try {
      await apiFetch(`/api/admin/payments/${el.dataset.id}/verify`, { method: "POST" });
      showToast("Payment verified. It now counts toward the customer's paid total.", "success");
      const orderId = currentAdminOrderId();
      if (orderId) viewAdminOrder(orderId);
    } catch (err) { showToast(err.message, "danger"); }
  },
  "delete-vehicle": async (el) => {
    if (!confirm("Delete this vehicle permanently?")) return;
    try {
      await apiFetch(`/api/admin/vehicles/${el.dataset.id}`, { method: "DELETE" });
      showToast("Vehicle deleted.", "info");
      viewAdminVehicles();
    } catch (err) { showToast(err.message, "danger"); }
  },
};

let _currentAdminOrderId = null;
function currentAdminOrderId() { return _currentAdminOrderId; }

// Delegated clicks — bound to document so tabs (in #appTabs) and the user
// chip (top bar) work too, not just elements inside #appView.
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const fn = Actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el); }
});

// Track current admin order id (set inside viewAdminOrder)
const origViewAdminOrder = viewAdminOrder;
viewAdminOrder = async (id) => { _currentAdminOrderId = id; await origViewAdminOrder(id); };

window.addEventListener("hashchange", () => {
  const { view, params } = parseHash();
  setView(view, params);
});

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */
(async function init() {
  try {
    App.config = await apiFetch("/api/config");
  } catch (_) {
    viewEl().innerHTML = `<div class="alert alert-danger">Could not load app config. Is the server running?</div>`;
    return;
  }
  try {
    const me = await apiFetch("/api/me");
    App.me = me.user;
  } catch (_) { App.me = null; }

  if (App.me) {
    try {
      const w = await apiFetch("/api/wishlist/ids");
      App.wishlist = new Set(w.ids);
    } catch (_) { App.wishlist = new Set(); }
  }

  updateChip();
  renderNotifBell();
  Notifs.load();

  // Poll for new notifications while the app is open
  setInterval(() => Notifs.unread(), 45000);

  // Close the notification panel when clicking anywhere else
  document.addEventListener("click", (e) => {
    const panel = $("notifPanel");
    if (panel && !panel.classList.contains("d-none") && !e.target.closest(".notif-wrap")) {
      panel.classList.add("d-none");
    }
  });

  if (location.hash && location.hash.length > 1) {
    const { view, params } = parseHash();
    setView(view, params);
  } else {
    goTo(App.me ? homeView() : "login");
  }
})();
