const state = {
  apiBase: localStorage.getItem("kb_api_base") || "",
  token: localStorage.getItem("kb_token") || "",
  source: "",
  tag: "",
  title: "",
  flagged: false,
  q: "",
};

const els = {};

function $(id) { return document.getElementById(id); }

function apiUrl(path) {
  return state.apiBase.replace(/\/$/, "") + path;
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(apiUrl(path), {
    ...opts,
    headers: {
      "Authorization": "Bearer " + state.token,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

function needsSetup() {
  return !state.apiBase || !state.token;
}

function openSettings() {
  $("settings-base").value = state.apiBase;
  $("settings-token").value = state.token;
  $("settings-modal").style.display = "flex";
}

function closeSettings() {
  $("settings-modal").style.display = "none";
}

function saveSettings() {
  state.apiBase = $("settings-base").value.trim();
  state.token = $("settings-token").value.trim();
  localStorage.setItem("kb_api_base", state.apiBase);
  localStorage.setItem("kb_token", state.token);
  closeSettings();
  boot();
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function sourceLabel(s) {
  return { pdf: "PDF", epub: "EPUB", news: "News" }[s] || s;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function renderEntry(item, index) {
  const folio = String(index + 1).padStart(3, "0");
  const tags = (item.tags || []).map(
    (t) => `<span class="tag-chip" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`
  ).join("");

  return `
    <div class="entry" data-id="${item.id}">
      <div class="folio">${folio}</div>
      <div class="entry-body">
        <div class="top-row">
          <span class="badge ${item.source_type}">${sourceLabel(item.source_type)}</span>
          <span class="entry-title">${escapeHtml(item.title)}</span>
        </div>
        <div class="entry-meta">
          ${item.author_or_publication ? escapeHtml(item.author_or_publication) + " · " : ""}
          ${item.location_label ? escapeHtml(item.location_label) + " · " : ""}
          ${fmtDate(item.highlighted_at)}
        </div>
        ${item.highlighted_text ? `<div class="entry-text">${escapeHtml(item.highlighted_text)}</div>` : ""}
        ${item.note ? `<div class="entry-note">${escapeHtml(item.note)}</div>` : ""}
        <div class="entry-tags">${tags}</div>
        <div class="entry-actions">
          ${item.original_link ? `<a href="${escapeHtml(item.original_link)}" target="_blank" rel="noopener">উৎসে যাও</a>` : ""}
          <button class="flag-btn ${item.review_flag ? "flagged" : ""}" data-id="${item.id}">
            ${item.review_flag ? "★ ফ্ল্যাগড" : "☆ পরে লিখব"}
          </button>
          <button class="del-btn" data-id="${item.id}">মুছে ফেলো</button>
        </div>
      </div>
    </div>`;
}

async function loadEntries() {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.source) params.set("source", state.source);
  if (state.tag) params.set("tag", state.tag);
  if (state.title) params.set("title", state.title);
  if (state.flagged) params.set("flagged", "1");
  params.set("limit", "60");

  $("entries").innerHTML = `<div class="empty-state">লোড হচ্ছে...</div>`;
  try {
    const data = await apiFetch("/api/highlights?" + params.toString());
    if (!data.results.length) {
      $("entries").innerHTML = `<div class="empty-state"><div class="big">কিছু পাওয়া যায়নি</div>খোঁজ বা ফিল্টার পাল্টে দেখুন।</div>`;
      return;
    }
    $("entries").innerHTML = data.results.map(renderEntry).join("");
  } catch (e) {
    $("entries").innerHTML = `<div class="empty-state">লোড করতে সমস্যা হচ্ছে — সেটিংস চেক করুন।</div>`;
  }
}

async function loadTags() {
  try {
    const data = await apiFetch("/api/tags");
    $("tag-row").innerHTML = data.tags.map(
      (t) => `<span class="tag-chip ${state.tag === t ? "active" : ""}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`
    ).join("");
  } catch (e) { /* silent */ }
}

async function loadTitles(source) {
  const row = $("title-row");
  const select = $("title-select");
  if (!source) {
    row.style.display = "none";
    state.title = "";
    return;
  }
  try {
    const data = await apiFetch("/api/titles?source=" + encodeURIComponent(source));
    if (!data.titles.length) {
      row.style.display = "none";
      state.title = "";
      return;
    }
    row.style.display = "flex";
    select.innerHTML = `<option value="">— সব বই/ডকুমেন্ট (${data.titles.length}) —</option>` +
      data.titles.map((t) => `<option value="${escapeHtml(t.title)}">${escapeHtml(t.title)} (${t.c})</option>`).join("");
  } catch (e) {
    row.style.display = "none";
  }
}

async function loadResurface() {
  try {
    const data = await apiFetch("/api/random?n=3");
    if (!data.results.length) {
      $("resurface").style.display = "none";
      return;
    }
    $("resurface").style.display = "block";
    $("resurface-cards").innerHTML = data.results.map((item) => `
      <div class="resurface-card">
        <div class="src-title">${sourceLabel(item.source_type)} · ${escapeHtml(item.title)}</div>
        ${escapeHtml((item.highlighted_text || item.note || "").slice(0, 140))}
      </div>`).join("");
  } catch (e) {
    $("resurface").style.display = "none";
  }
}

function bindEvents() {
  $("search-input").addEventListener("input", debounce((e) => {
    state.q = e.target.value;
    loadEntries();
  }, 350));

  document.querySelectorAll(".source-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.source = chip.dataset.source;
      state.title = "";
      document.querySelectorAll(".source-chip").forEach((c) => c.classList.toggle("active", c === chip));
      loadTitles(state.source);
      loadEntries();
    });
  });

  $("title-select").addEventListener("change", (e) => {
    state.title = e.target.value;
    loadEntries();
  });

  $("flag-toggle").addEventListener("click", () => {
    state.flagged = !state.flagged;
    $("flag-toggle").classList.toggle("active", state.flagged);
    loadEntries();
  });

  $("tag-row").addEventListener("click", (e) => {
    const chip = e.target.closest(".tag-chip");
    if (!chip) return;
    const tag = chip.dataset.tag;
    state.tag = state.tag === tag ? "" : tag;
    document.querySelectorAll("#tag-row .tag-chip").forEach((c) => c.classList.toggle("active", c.dataset.tag === state.tag));
    loadEntries();
  });

  $("entries").addEventListener("click", async (e) => {
    const flagBtn = e.target.closest(".flag-btn");
    const delBtn = e.target.closest(".del-btn");
    if (flagBtn) {
      const id = flagBtn.dataset.id;
      const nowFlagged = !flagBtn.classList.contains("flagged");
      await apiFetch(`/api/highlights/${id}`, { method: "PATCH", body: JSON.stringify({ review_flag: nowFlagged }) });
      loadEntries();
    }
    if (delBtn) {
      if (!confirm("এই এন্ট্রি মুছে ফেলবেন?")) return;
      const id = delBtn.dataset.id;
      await apiFetch(`/api/highlights/${id}`, { method: "DELETE" });
      loadEntries();
    }
  });

  $("settings-btn").addEventListener("click", openSettings);
  $("settings-cancel").addEventListener("click", closeSettings);
  $("settings-save").addEventListener("click", saveSettings);
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

async function boot() {
  if (needsSetup()) {
    openSettings();
    return;
  }
  closeSettings();
  loadResurface();
  loadTags();
  loadEntries();
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  boot();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
