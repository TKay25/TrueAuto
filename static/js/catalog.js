/* True Auto Zim — catalog with BeForward-style filters, pagination,
   wishlist hearts, compare buttons and recently-viewed strip. */
document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("catalogGrid");
  const loading = document.getElementById("catalogLoading");
  const empty = document.getElementById("catalogEmpty");
  const searchInput = document.getElementById("searchInput");
  const makeSelect = document.getElementById("makeSelect");
  const sortSelect = document.getElementById("sortSelect");

  let page = 1;
  let loggedIn = false;
  let wishlistIds = new Set();

  window.chatOpen = () => {
    const panel = document.getElementById("chatPanel");
    if (panel) { panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); }
  };

  /* ---------- Recently viewed ---------- */
  const Recent = {
    KEY: "trueauto_recent",
    get() { try { return JSON.parse(localStorage.getItem(this.KEY) || "[]"); } catch { return []; } },
    save(arr) { localStorage.setItem(this.KEY, JSON.stringify(arr)); },
  };

  async function renderRecent() {
    const recent = Recent.get();
    if (!recent.length) return;
    try {
      const ids = recent.slice(0, 6).map((r) => r.id).join(",");
      const data = await apiFetch(`/api/vehicles/compare?ids=${ids}`);
      if (!data.vehicles.length) return;
      const wrap = document.createElement("div");
      wrap.className = "mb-4";
      wrap.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="section-kicker">Recently viewed</span>
        </div>
        <div class="recent-strip d-flex gap-3 overflow-auto pb-2">
          ${data.vehicles.map((v) => `
            <a href="/catalog/${v.slug}" class="recent-card d-flex align-items-center gap-2 text-decoration-none">
              <div class="vehicle-placeholder d-flex align-items-center justify-content-center" style="width:64px;height:48px;border-radius:10px;">
                <i class="bi bi-car-front-fill"></i>
              </div>
              <div>
                <div class="fw-semibold small text-dark">${v.year} ${escapeHtml(v.make)} ${escapeHtml(v.model)}</div>
                <small class="text-muted">${fmtMoney(v.fob_price_usd)} FOB</small>
              </div>
            </a>`).join("")}
        </div>`;
      grid.before(wrap);
    } catch (_) { /* ignore */ }
  }

  /* ---------- Wishlist ---------- */
  async function loadWishlist() {
    try {
      const me = await apiFetch("/api/me");
      loggedIn = !!me.user;
      if (loggedIn) {
        const d = await apiFetch("/api/wishlist/ids");
        wishlistIds = new Set(d.ids);
      }
    } catch (_) { loggedIn = false; }
  }

  async function toggleWish(id, btn) {
    if (!loggedIn) {
      showToast("Please log in to save cars to your list.", "info", "Login required");
      setTimeout(() => { location.href = "/app"; }, 1200);
      return;
    }
    try {
      if (wishlistIds.has(id)) {
        await apiFetch(`/api/wishlist/${id}`, { method: "DELETE" });
        wishlistIds.delete(id);
        btn.classList.remove("active");
        btn.innerHTML = '<i class="bi bi-heart"></i>';
        showToast("Removed from your list.", "info");
      } else {
        await apiFetch("/api/wishlist", { method: "POST", body: { vehicle_id: id } });
        wishlistIds.add(id);
        btn.classList.add("active");
        btn.innerHTML = '<i class="bi bi-heart-fill"></i>';
        showToast("Saved to your list! ❤️", "success");
      }
    } catch (err) { showToast(err.message, "danger"); }
  }

  /* ---------- Card renderer ---------- */
  const cardHTML = (v) => {
    const est = v.landed ? v.landed.total : v.fob_price_usd;
    const heart = `<button class="wish-btn ${wishlistIds.has(v.id) ? "active" : ""}" data-wish="${v.id}" title="Save to my list" aria-label="Save"><i class="bi ${wishlistIds.has(v.id) ? "bi-heart-fill" : "bi-heart"}"></i></button>`;
    const cmp = `<button class="cmp-btn" data-compare="${v.id}" onclick="CompareToggle(${v.id}, this)" title="Compare">${Compare.btnHTML(Compare.has(v.id))}</button>`;
    return `
      <div class="col">
        <div class="card h-100 vehicle-card">
          <div class="vehicle-img">
            ${heart}
            <a href="/catalog/${v.slug}">
              <div class="vehicle-placeholder d-flex flex-column align-items-center justify-content-center">
                <i class="bi bi-car-front-fill placeholder-car"></i>
                <span class="placeholder-text">${escapeHtml(v.make)} ${escapeHtml(v.model)}</span>
              </div>
            </a>
            <span class="badge position-absolute top-0 start-0 m-2 status-badge status-${v.status}">${v.status}</span>
            ${v.auction_grade ? `<span class="badge position-absolute bottom-0 start-0 m-2 grade-badge">${escapeHtml(v.auction_grade)} ★</span>` : ""}
          </div>
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <a href="/catalog/${v.slug}" class="text-decoration-none text-dark">
                <h6 class="fw-bold mb-0">${v.year} ${escapeHtml(v.make)} ${escapeHtml(v.model)}</h6>
              </a>
              <div class="ms-2">${cmp}</div>
            </div>
            <small class="text-muted">${escapeHtml(v.transmission)} · ${escapeHtml(v.fuel)} · ${fmtNum(v.mileage_km)} km</small>
            <div class="d-flex justify-content-between align-items-end mt-3">
              <div>
                <div class="text-muted small">Japan (FOB)</div>
                <div class="fw-bold price">${fmtMoney(v.fob_price_usd)}</div>
              </div>
              <div class="text-end">
                <div class="text-muted small">Landed in Harare</div>
                <div class="fw-bold text-accent-dark">${fmtMoney(est)}</div>
              </div>
            </div>
            <div class="d-grid mt-3">
              <a href="/catalog/${v.slug}" class="btn btn-outline-brand btn-sm rounded-pill">View Details <i class="bi bi-arrow-right"></i></a>
            </div>
          </div>
        </div>
      </div>`;
  };

  /* ---------- Load with filters + pagination ---------- */
  const load = debounce(async () => {
    grid.classList.add("d-none");
    loading.classList.remove("d-none");
    empty.classList.add("d-none");

    const params = new URLSearchParams({ status: "available", sort: sortSelect.value, page });
    const q = (searchInput.value || "").trim();
    if (q) params.set("q", q);
    if (makeSelect.value) params.set("make", makeSelect.value);

    const pf = (id) => document.getElementById(id)?.value || "";
    if (pf("fPriceMin")) params.set("price_min", pf("fPriceMin"));
    if (pf("fPriceMax")) params.set("price_max", pf("fPriceMax"));
    if (pf("fYearMin")) params.set("year_min", pf("fYearMin"));
    if (pf("fYearMax")) params.set("year_max", pf("fYearMax"));
    if (pf("fMileage")) params.set("mileage_max", pf("fMileage"));
    if (pf("fFuel")) params.set("fuel", pf("fFuel"));
    if (pf("fTrans")) params.set("transmission", pf("fTrans"));

    try {
      const data = await apiFetch("/api/vehicles?" + params.toString());
      grid.innerHTML = data.vehicles.map(cardHTML).join("");
      renderPagination(data.meta);
      empty.classList.toggle("d-none", data.vehicles.length > 0);
      grid.classList.remove("d-none");
      Compare.syncButtons();
    } catch (e) {
      empty.classList.remove("d-none");
      empty.querySelector("p").textContent = "Could not load vehicles. Please refresh.";
    } finally {
      loading.classList.add("d-none");
    }
  }, 200);

  function renderPagination(meta) {
    const p = document.getElementById("catalogPagination");
    const c = document.getElementById("catalogCount");
    if (meta.pages > 1) {
      p.innerHTML = `
        <button class="btn btn-sm btn-outline-brand rounded-pill" id="pgPrev" ${meta.page <= 1 ? "disabled" : ""}><i class="bi bi-chevron-left"></i> Prev</button>
        <span class="small text-muted fw-semibold">Page ${meta.page} of ${meta.pages}</span>
        <button class="btn btn-sm btn-outline-brand rounded-pill" id="pgNext" ${meta.page >= meta.pages ? "disabled" : ""}>Next <i class="bi bi-chevron-right"></i></button>`;
      p.querySelector("#pgPrev").addEventListener("click", () => { if (meta.page > 1) { page = meta.page - 1; load(); } });
      p.querySelector("#pgNext").addEventListener("click", () => { if (meta.page < meta.pages) { page = meta.page + 1; load(); } });
    } else {
      p.innerHTML = "";
    }
    c.textContent = `${meta.total} vehicle${meta.total === 1 ? "" : "s"} available`;
  }

  /* ---------- Events ---------- */
  searchInput.addEventListener("input", () => { page = 1; load(); });
  makeSelect.addEventListener("change", () => { page = 1; load(); });
  sortSelect.addEventListener("change", () => { page = 1; load(); });
  ["fPriceMin", "fPriceMax", "fYearMin", "fYearMax", "fMileage", "fFuel", "fTrans"]
    .forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => { page = 1; load(); });
    });

  document.getElementById("clearFilters").addEventListener("click", () => {
    searchInput.value = "";
    makeSelect.value = "";
    sortSelect.value = "newest";
    ["fPriceMin", "fPriceMax", "fYearMin", "fYearMax", "fMileage", "fFuel", "fTrans"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
    document.querySelectorAll("#makeChips .chip-filter").forEach((c) => c.classList.toggle("active", c.dataset.make === ""));
    page = 1;
    load();
  });
  document.getElementById("clearAdvanced")?.addEventListener("click", () => {
    ["fPriceMin", "fPriceMax", "fYearMin", "fYearMax", "fMileage", "fFuel", "fTrans"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
    page = 1; load();
  });

  // Make chips
  const chips = document.querySelectorAll("#makeChips .chip-filter");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      makeSelect.value = chip.dataset.make;
      page = 1;
      load();
    });
  });

  // Wishlist hearts (delegated)
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-wish]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    toggleWish(Number(btn.dataset.wish), btn);
  });

  /* ---------- Init ---------- */
  if (window.SELECTED_MAKE) {
    makeSelect.value = window.SELECTED_MAKE;
    chips.forEach((c) => c.classList.toggle("active", c.dataset.make === window.SELECTED_MAKE));
  }
  loadWishlist().then(() => {
    renderRecent();
    load();
  });
});
