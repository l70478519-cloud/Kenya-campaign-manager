(function () {
  "use strict";
  var C = window.SITE_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ── Branding and contact details from site-config.js ──────────────────────
  $$("[data-brand]").forEach(function (el) { el.textContent = C.brand || "Command Centre"; });
  $$("[data-tagline]").forEach(function (el) { el.textContent = C.tagline || ""; });
  $$("[data-app-url]").forEach(function (el) { el.setAttribute("href", C.appUrl || "/login"); });
  [["phone", function (v) { return "tel:" + v.replace(/\s/g, ""); }], ["email", function (v) { return "mailto:" + v; }], ["address", null], ["company", null]].forEach(function (pair) {
    var key = pair[0], href = pair[1], v = (C[key] || "").trim();
    $$("[data-contact='" + key + "']").forEach(function (el) {
      if (!v) { el.hidden = true; return; }
      var target = el.querySelector("[data-value]") || el;
      target.textContent = v;
      if (href && target.tagName === "A") target.setAttribute("href", href(v));
    });
  });
  var wa = $(".wa");
  if (wa) {
    var n = (C.whatsapp || "").replace(/\D/g, "");
    if (n) { wa.href = "https://wa.me/" + n; wa.hidden = false; } else wa.hidden = true;
  }
  $$("[data-price]").forEach(function (el) {
    var v = (C.prices || {})[el.getAttribute("data-price")];
    el.textContent = v ? "KES " + v : "Get a quote";
    var per = el.nextElementSibling;
    if (per && per.classList.contains("per")) per.hidden = !v;
  });
  $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  // ── Navigation ────────────────────────────────────────────────────────────
  var nav = $(".nav"), btn = $(".menu-btn");
  if (nav && btn) {
    btn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "✕" : "☰";
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && nav.classList.contains("open")) btn.click(); });
  }
  var page = document.body.getAttribute("data-page");
  $$(".nav-links a").forEach(function (a) { if (a.getAttribute("data-page") === page) a.setAttribute("aria-current", "page"); });

  // ── Reveal on scroll ──────────────────────────────────────────────────────
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -40px 0px" });
    $$(".reveal").forEach(function (el) { io.observe(el); });
  } else $$(".reveal").forEach(function (el) { el.classList.add("in"); });

  // ── Electoral data (47 counties / 290 constituencies / 1,450 wards) ───────
  var unitsPromise = null;
  function units() {
    if (!unitsPromise) unitsPromise = fetch(new URL("assets/kenya-units.json", document.baseURI)).then(function (r) { if (!r.ok) throw new Error("data"); return r.json(); });
    return unitsPromise;
  }
  function fillCounties(select) {
    units().then(function (counties) {
      counties.forEach(function (c) { var o = document.createElement("option"); o.value = c.name; o.textContent = c.code + " · " + c.name; select.appendChild(o); });
    }).catch(function () {});
  }
  $$("select[data-counties]").forEach(fillCounties);

  // County explorer on the Seats page
  var ex = $("#explorer");
  if (ex) {
    var sel = $("#explorer-county"), q = $("#explorer-search"), out = $("#explorer-body"), sum = $("#explorer-summary");
    fillCounties(sel);
    var render = function (counties) {
      var term = (q.value || "").trim().toLowerCase();
      var list = counties.filter(function (c) { return !sel.value || c.name === sel.value; });
      var rows = [], nc = 0, nw = 0;
      list.forEach(function (c) {
        c.constituencies.forEach(function (k) {
          var match = !term || k.name.toLowerCase().indexOf(term) > -1 || c.name.toLowerCase().indexOf(term) > -1 || k.wards.some(function (w) { return w.toLowerCase().indexOf(term) > -1; });
          if (!match) return;
          nc++; nw += k.wards.length;
          rows.push("<tr><td>" + c.code + " · " + esc(c.name) + "</td><td><strong>" + esc(k.name) + "</strong></td><td>" + k.wards.length + "</td><td class=\"small muted\">" + k.wards.map(esc).join(", ") + "</td></tr>");
        });
      });
      out.innerHTML = rows.join("") || "<tr><td colspan=\"4\" class=\"muted\">No match. Try another county, constituency or ward name.</td></tr>";
      sum.textContent = nc + " constituenc" + (nc === 1 ? "y" : "ies") + " · " + nw.toLocaleString() + " wards shown";
    };
    units().then(function (counties) {
      render(counties);
      sel.addEventListener("change", function () { render(counties); });
      q.addEventListener("input", function () { render(counties); });
    }).catch(function () { out.innerHTML = "<tr><td colspan=\"4\">Could not load the electoral data.</td></tr>"; });
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }

  // ── Demo request form ─────────────────────────────────────────────────────
  $$("form[data-demo]").forEach(function (form) {
    var status = form.querySelector(".form-status");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = {}; new FormData(form).forEach(function (v, k) { data[k] = String(v); });
      data.sourcePage = page || "";
      if (!data.phone && !data.email) { status.className = "form-status err"; status.textContent = "Give a phone number or an email so we can reach you."; return; }
      var submit = form.querySelector("[type=submit]"); submit.disabled = true; status.className = "form-status"; status.textContent = "Sending…";
      fetch((C.apiBase || "") + "/api/public/demo-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error || "Could not send"); }); })
        .then(function () { form.reset(); status.className = "form-status ok"; status.textContent = "Thank you — we’ll contact you within one working day."; })
        .catch(function (err) {
          status.className = "form-status err";
          status.textContent = err.message + (C.email ? " You can also email " + C.email + "." : "");
        })
        .then(function () { submit.disabled = false; });
    });
  });
})();
