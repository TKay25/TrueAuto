/* True Auto Zim — shared helpers for the SPA-style interactions */

function showToast(message, type = "success", title = "") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast align-items-center text-bg-${type === "danger" ? "danger" : type === "info" ? "primary" : "success"} border-0 show`;
  toast.setAttribute("role", "alert");
  const icon = type === "danger" ? "exclamation-triangle-fill" : type === "info" ? "info-circle-fill" : "check-circle-fill";
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <i class="bi bi-${icon} me-2"></i>
        ${title ? `<strong>${title}</strong><br>` : ""}
        ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

async function apiFetch(url, options = {}) {
  const opts = Object.assign({ headers: { "Content-Type": "application/json" } }, options);
  if (opts.body && typeof opts.body !== "string") opts.body = JSON.stringify(opts.body);
  const res = await fetch(url, opts);
  let data = {};
  try { data = await res.json(); } catch (_) { /* no body */ }
  if (!res.ok) {
    const err = new Error(data.error || data.message || "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

function fmtMoney(n) {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n, decimals = 2) {
  return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------- Scroll reveal ---------- */
function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!els.length) return;
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach((el) => io.observe(el));
}

/* ---------- Animated counters ---------- */
function animateCount(el, target, { duration = 1200, prefix = "", suffix = "" } = {}) {
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + Math.round(target * eased).toLocaleString("en-US") + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function initCounters() {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const target = Number(el.dataset.count || 0);
    animateCount(el, target, {
      prefix: el.dataset.prefix || "",
      suffix: el.dataset.suffix || "",
    });
  });
}

// Discreet admin entry: Ctrl+Shift+A opens the staff portal
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
    e.preventDefault();
    location.href = "/admin";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  initReveal();
  // Trigger counters once the hero is visible
  const counters = document.querySelectorAll("[data-count]");
  if (counters.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          animateCount(el, Number(el.dataset.count || 0), {
            prefix: el.dataset.prefix || "",
            suffix: el.dataset.suffix || "",
          });
          io.unobserve(el);
        }
      });
    }, { threshold: 0.4 });
    counters.forEach((el) => io.observe(el));
  } else {
    counters.forEach((el) => {
      el.textContent = (el.dataset.prefix || "") + Number(el.dataset.count || 0).toLocaleString() + (el.dataset.suffix || "");
    });
  }
});
