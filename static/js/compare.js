/* True Auto Zim — Compare (BeForward-style side-by-side) */
const Compare = {
  KEY: "trueauto_compare",
  MAX: 4,

  get() {
    try { return JSON.parse(localStorage.getItem(Compare.KEY) || "[]"); }
    catch (_) { return []; }
  },
  save(ids) { localStorage.setItem(Compare.KEY, JSON.stringify(ids)); },
  has(id) { return Compare.get().includes(Number(id)); },

  add(id) {
    const ids = Compare.get();
    if (ids.includes(Number(id))) return true;
    if (ids.length >= Compare.MAX) {
      showToast(`You can compare up to ${Compare.MAX} cars at once.`, "info", "Limit reached");
      return false;
    }
    ids.push(Number(id));
    Compare.save(ids);
    Compare.syncButtons();
    Compare.renderTray();
    showToast("Added to comparison.", "success");
    return true;
  },
  remove(id) {
    Compare.save(Compare.get().filter((x) => x !== Number(id)));
    Compare.syncButtons();
    Compare.renderTray();
    if (document.body.classList.contains("compare-page")) Compare.loadPage();
  },
  toggle(id, el) {
    if (Compare.has(id)) {
      Compare.remove(id);
      if (el) { el.classList.remove("active"); el.innerHTML = Compare.btnHTML(false); }
    } else if (Compare.add(id)) {
      if (el) { el.classList.add("active"); el.innerHTML = Compare.btnHTML(true); }
    }
  },

  btnHTML(on) {
    return on ? `<i class="bi bi-check-lg"></i> Comparing` : `<i class="bi bi-plus-lg"></i> Compare`;
  },

  syncButtons() {
    document.querySelectorAll("[data-compare]").forEach((btn) => {
      const id = Number(btn.dataset.compare);
      const on = Compare.has(id);
      btn.classList.toggle("active", on);
      btn.innerHTML = Compare.btnHTML(on);
    });
  },

  renderTray() {
    let tray = document.getElementById("compareTray");
    const ids = Compare.get();
    if (!ids.length) { if (tray) tray.remove(); return; }
    if (!tray) {
      tray = document.createElement("div");
      tray.id = "compareTray";
      tray.className = "compare-tray";
      document.body.appendChild(tray);
    }
    tray.innerHTML = `
      <div class="compare-tray-inner d-flex align-items-center gap-2">
        <span class="badge status-badge status-shipping">${ids.length}/${Compare.MAX} selected</span>
        <span class="text-muted small d-none d-md-inline">Compare specs & landed costs</span>
        <a href="/compare" class="btn btn-accent btn-sm rounded-pill ms-auto">Compare now <i class="bi bi-arrow-right"></i></a>
        <button class="btn btn-sm btn-outline-danger rounded-pill" onclick="Compare.removeAll()"><i class="bi bi-trash"></i></button>
      </div>`;
  },

  removeAll() {
    Compare.save([]);
    Compare.syncButtons();
    Compare.renderTray();
  },

  /* Comparison page loader */
  async loadPage() {
    document.body.classList.add("compare-page");
    const ids = Compare.get();
    const empty = document.getElementById("compareEmpty");
    const wrap = document.getElementById("compareWrap");
    if (!ids.length) {
      empty.classList.remove("d-none");
      wrap.classList.add("d-none");
      return;
    }
    empty.classList.add("d-none");
    wrap.classList.remove("d-none");

    const data = await apiFetch(`/api/vehicles/compare?ids=${ids.join(",")}`);
    const vs = data.vehicles;

    // Header cells
    document.getElementById("compareHead").innerHTML = vs.map((v) => `
      <div class="text-center">
        <div class="compare-img mb-2">
          <div class="vehicle-placeholder d-flex flex-column align-items-center justify-content-center" style="height:130px;">
            <i class="bi bi-car-front-fill" style="font-size:2rem;"></i>
          </div>
        </div>
        <strong>${v.year} ${escapeHtml(v.make)} ${escapeHtml(v.model)}</strong>
        <div class="d-flex justify-content-center gap-1 mt-1">
          <a href="/catalog/${v.slug}" class="btn btn-sm btn-outline-brand rounded-pill">View</a>
          <button class="btn btn-sm btn-outline-danger rounded-pill" onclick="Compare.remove(${v.id})"><i class="bi bi-x-lg"></i></button>
        </div>
      </div>`).join("");

    const specRows = [
      ["Year", (v) => v.year],
      ["Mileage", (v) => `${fmtNum(v.mileage_km)} km`],
      ["Transmission", (v) => v.transmission],
      ["Fuel", (v) => v.fuel],
      ["Engine", (v) => (v.engine_cc ? `${v.engine_cc} cc` : "—")],
      ["Auction grade", (v) => (v.auction_grade ? `${v.auction_grade} ★` : "—")],
      ["Auction location", (v) => v.auction_location || "Japan"],
      ["Japan FOB price", (v) => fmtMoney(v.fob_price_usd)],
      ["Landed in Harare", (v) => fmtMoney(v.landed.total)],
      ["Auction &amp; ship fee", (v) => fmtMoney(v.landed.commission)],
    ];

    document.getElementById("compareBody").innerHTML = specRows.map(([label, fn]) => `
      <tr>
        <td>${label}</td>
        ${vs.map((v) => `<td class="${label.includes("Landed") ? "fw-bold text-accent-dark" : ""}">${fn(v)}</td>`).join("")}
      </tr>`).join("");

    document.getElementById("clearCompare").addEventListener("click", () => {
      Compare.removeAll();
      Compare.loadPage();
    });
  },
};

window.Compare = Compare;
window.CompareToggle = (id, el) => Compare.toggle(id, el);

document.addEventListener("DOMContentLoaded", () => {
  Compare.renderTray();
  Compare.syncButtons();
  if (document.body.dataset.page === "compare") Compare.loadPage();
});
