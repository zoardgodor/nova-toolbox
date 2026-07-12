/* ============================================================
   Nova Toolbox — script.js
   App shell (navigation, search, favorites, language) plus
   every individual tool's logic. No frameworks, no build step.
   ============================================================ */

"use strict";

/* ---------------------------------------------------------
   Tool registry — metadata only. Rendering logic lives in
   the RENDERERS object further down, keyed by tool id.
   --------------------------------------------------------- */
const TOOLS = [
  { id: "password", category: "generators", icon: "🔑" },
  { id: "names", category: "generators", icon: "🧑‍🤝‍🧑" },
  { id: "uuid", category: "generators", icon: "🆔" },
  { id: "hash", category: "generators", icon: "#️⃣" },

  { id: "jsonFormat", category: "converters", icon: "{ }" },
  { id: "jsonMin", category: "converters", icon: "🗜️" },
  { id: "b64encode", category: "converters", icon: "⇢64" },
  { id: "b64decode", category: "converters", icon: "64⇢" },
  { id: "timestamp", category: "converters", icon: "🕒" },
  { id: "binary", category: "converters", icon: "01" },
  { id: "morse", category: "converters", icon: "•—•" },

  { id: "colorPicker", category: "design", icon: "🎨" },
  { id: "colorConvert", category: "design", icon: "🔁" },
  { id: "gradient", category: "design", icon: "🌈" },
  { id: "shadow", category: "design", icon: "🔲" },
  { id: "fonts", category: "design", icon: "🔤" },

  { id: "imgResize", category: "image", icon: "🖼️" },
  { id: "imgCompress", category: "image", icon: "📉" },
  { id: "imgB64", category: "image", icon: "🖼️" },
  { id: "favicon", category: "image", icon: "⭐" },

  { id: "markdown", category: "text", icon: "📝" },
  { id: "wordCount", category: "text", icon: "🔢" },
  { id: "charCount", category: "text", icon: "🔠" },
  { id: "lorem", category: "text", icon: "📄" },
  { id: "textCase", category: "text", icon: "Aa" },
  { id: "findReplace", category: "text", icon: "🔍" },

  { id: "htmlEscape", category: "dev", icon: "</>" },
  { id: "cssMin", category: "dev", icon: "🎯" },
  { id: "jsFormat", category: "dev", icon: "{ }" },
  { id: "regex", category: "dev", icon: ".*" },
  { id: "apiTester", category: "dev", icon: "🌐" }
];

const CATEGORIES = ["generators", "converters", "design", "image", "text", "dev"];

/* ---------------------------------------------------------
   State
   --------------------------------------------------------- */
const state = {
  lang: localStorage.getItem("nova_language") || "en",
  favorites: new Set(JSON.parse(localStorage.getItem("nova_favorites") || "[]")),
  activeCategory: "all",
  query: "",
  openToolId: null
};

/* ---------------------------------------------------------
   i18n helpers
   --------------------------------------------------------- */
function t(key, params) {
  const dict = TRANSLATIONS[state.lang] || TRANSLATIONS.en;
  let str = dict[key] ?? TRANSLATIONS.en[key] ?? key;
  if (params) {
    Object.keys(params).forEach((p) => {
      str = str.replace(`{${p}}`, params[p]);
    });
  }
  return str;
}

function applyTranslations(root) {
  const scope = root || document;
  scope.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
  scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  scope.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  });
}

function setLanguage(lang) {
  state.lang = lang;
  localStorage.setItem("nova_language", lang);
  document.documentElement.lang = lang;
  document.getElementById("langButton").textContent = lang.toUpperCase();
  document.querySelectorAll(".language-button[data-lang]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
  });
  applyTranslations();
  renderSidebarCategories();
  renderCategoryChips();
  renderGrid();
  renderFavorites();
  if (state.openToolId) openTool(state.openToolId, true);
  toast(t("toast.langChanged"));
}

/* ---------------------------------------------------------
   Toast
   --------------------------------------------------------- */
let toastTimer = null;
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------------------------------------------------------
   Small utilities
   --------------------------------------------------------- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t("toast.copied"));
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast(t("toast.copied"));
    } catch (err) {
      toast(t("toast.copyFailed"));
    }
  }
}

function downloadFile(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(t("toast.downloaded"));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function addCopyHandler(container, buttonSelector, getText) {
  const btn = container.querySelector(buttonSelector);
  if (btn) btn.addEventListener("click", () => copyToClipboard(getText()));
}

/* ===========================================================
   NAVIGATION: sidebar, chips, search, grid, favorites
   =========================================================== */

function renderSidebarCategories() {
  CATEGORIES.forEach((cat) => {
    const nav = document.querySelector(`.category-list[data-category="${cat}"]`);
    if (!nav) return;
    nav.innerHTML = "";
    TOOLS.filter((tl) => tl.category === cat).forEach((tl) => {
      const btn = document.createElement("button");
      btn.innerHTML = `<span class="tool-icon">${tl.icon}</span><span>${t(`tool.${tl.id}.title`)}</span>`;
      btn.addEventListener("click", () => {
        closeSidebar();
        openTool(tl.id);
      });
      nav.appendChild(btn);
    });
  });
}

function renderCategoryChips() {
  const wrap = document.getElementById("categoryChips");
  wrap.innerHTML = "";
  const all = document.createElement("button");
  all.className = "chip" + (state.activeCategory === "all" ? " active" : "");
  all.textContent = t("nav.allTools");
  all.addEventListener("click", () => {
    state.activeCategory = "all";
    renderCategoryChips();
    renderGrid();
  });
  wrap.appendChild(all);

  CATEGORIES.forEach((cat) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (state.activeCategory === cat ? " active" : "");
    chip.textContent = t(`category.${cat}`);
    chip.addEventListener("click", () => {
      state.activeCategory = cat;
      renderCategoryChips();
      renderGrid();
    });
    wrap.appendChild(chip);
  });
}

function toolMatchesQuery(tool, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const title = t(`tool.${tool.id}.title`).toLowerCase();
  const desc = t(`tool.${tool.id}.desc`).toLowerCase();
  return title.includes(q) || desc.includes(q);
}

function buildToolCard(tool) {
  const card = document.createElement("button");
  card.className = "tool-card";
  card.setAttribute("data-tool", tool.id);
  const isFav = state.favorites.has(tool.id);
  card.innerHTML = `
    <div class="tool-card-icon">${tool.icon}</div>
    <h3>${t(`tool.${tool.id}.title`)}</h3>
    <p>${t(`tool.${tool.id}.desc`)}</p>
    <button class="favorite-button ${isFav ? "active" : ""}" data-fav="${tool.id}" aria-label="${t(isFav ? "favorites.remove" : "favorites.add")}">★</button>
  `;
  card.addEventListener("click", (e) => {
    if (e.target.closest("[data-fav]")) return;
    openTool(tool.id);
  });
  card.querySelector("[data-fav]").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite(tool.id);
  });
  return card;
}

function renderGrid() {
  const grid = document.getElementById("toolGrid");
  const heading = document.getElementById("resultsHeading");
  const countEl = document.getElementById("resultsCount");
  const noResults = document.getElementById("noResults");
  grid.innerHTML = "";

  const filtered = TOOLS.filter(
    (tl) => (state.activeCategory === "all" || tl.category === state.activeCategory) && toolMatchesQuery(tl, state.query)
  );

  heading.textContent = state.activeCategory === "all" ? t("nav.allTools") : t(`category.${state.activeCategory}`);
  countEl.textContent = t("search.resultsCount", { count: filtered.length });

  if (filtered.length === 0) {
    noResults.textContent = t("search.noResults", { query: state.query });
    noResults.classList.remove("hidden");
  } else {
    noResults.classList.add("hidden");
    filtered.forEach((tl) => grid.appendChild(buildToolCard(tl)));
  }
}

function renderFavorites() {
  const section = document.getElementById("favoritesSection");
  const grid = document.getElementById("favoritesGrid");
  const empty = document.getElementById("favoritesEmpty");
  grid.innerHTML = "";

  if (state.favorites.size === 0) {
    empty.classList.remove("hidden");
    section.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  section.classList.remove("hidden");
  TOOLS.filter((tl) => state.favorites.has(tl.id)).forEach((tl) => grid.appendChild(buildToolCard(tl)));
}

function toggleFavorite(toolId) {
  const wasFav = state.favorites.has(toolId);
  if (wasFav) {
    state.favorites.delete(toolId);
  } else {
    state.favorites.add(toolId);
  }
  localStorage.setItem("nova_favorites", JSON.stringify([...state.favorites]));
  toast(t(wasFav ? "toast.favoriteRemoved" : "toast.favoriteAdded"));
  renderGrid();
  renderFavorites();
  if (state.openToolId === toolId) {
    const favBtn = document.getElementById("toolPanelFavorite");
    favBtn.classList.toggle("active", !wasFav);
  }
}

/* ---------------------------------------------------------
   Sidebar open/close
   --------------------------------------------------------- */
function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("overlay").classList.add("show");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  if (!state.openToolId) document.getElementById("overlay").classList.remove("show");
}

/* ---------------------------------------------------------
   Tool panel open/close
   --------------------------------------------------------- */
function openTool(toolId, silentRerender) {
  const tool = TOOLS.find((tl) => tl.id === toolId);
  if (!tool) return;
  state.openToolId = toolId;

  document.getElementById("toolPanelIcon").textContent = tool.icon;
  document.getElementById("toolPanelTitle").textContent = t(`tool.${toolId}.title`);
  document.getElementById("toolPanelDesc").textContent = t(`tool.${toolId}.desc`);

  const favBtn = document.getElementById("toolPanelFavorite");
  const isFav = state.favorites.has(toolId);
  favBtn.classList.toggle("active", isFav);
  favBtn.setAttribute("aria-label", t(isFav ? "favorites.remove" : "favorites.add"));
  favBtn.onclick = () => toggleFavorite(toolId);

  const body = document.getElementById("toolPanelBody");
  body.innerHTML = "";
  const renderer = RENDERERS[toolId];
  if (renderer) renderer(body);

  if (!silentRerender) {
    document.getElementById("toolPanel").classList.add("open");
    document.getElementById("toolPanel").setAttribute("aria-hidden", "false");
    document.getElementById("overlay").classList.add("show");
  }
}

function closeTool() {
  state.openToolId = null;
  document.getElementById("toolPanel").classList.remove("open");
  document.getElementById("toolPanel").setAttribute("aria-hidden", "true");
  if (!document.getElementById("sidebar").classList.contains("open")) {
    document.getElementById("overlay").classList.remove("show");
  }
}

/* ===========================================================
   TOOL RENDERERS
   =========================================================== */
const RENDERERS = {};

/* ---------- 1. Password Generator ---------- */
RENDERERS.password = (c) => {
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.password.length")}</label>
      <div class="range-row">
        <input type="range" id="pwLength" min="4" max="64" value="16" />
        <span class="range-value" id="pwLengthVal">16</span>
      </div>
    </div>
    <div class="checkbox-row"><input type="checkbox" id="pwUpper" checked /><label for="pwUpper">${t("tool.password.uppercase")}</label></div>
    <div class="checkbox-row"><input type="checkbox" id="pwLower" checked /><label for="pwLower">${t("tool.password.lowercase")}</label></div>
    <div class="checkbox-row"><input type="checkbox" id="pwNumbers" checked /><label for="pwNumbers">${t("tool.password.numbers")}</label></div>
    <div class="checkbox-row"><input type="checkbox" id="pwSymbols" /><label for="pwSymbols">${t("tool.password.symbols")}</label></div>
    <div class="checkbox-row"><input type="checkbox" id="pwAmbiguous" /><label for="pwAmbiguous">${t("tool.password.excludeAmbiguous")}</label></div>
    <div class="field">
      <label>${t("action.generate")}</label>
      <div class="output-box" id="pwOutput" tabindex="0"></div>
    </div>
    <div class="field">
      <label>${t("tool.password.strength")}</label>
      <div class="strength-bar"><div class="strength-bar-fill" id="pwStrengthFill"></div></div>
      <span class="badge info" id="pwStrengthLabel"></span>
    </div>
    <div class="btn-row">
      <button class="btn primary" id="pwGenerate">${t("action.generate")}</button>
      <button class="btn" id="pwCopy">${t("action.copy")}</button>
    </div>
  `;

  const AMBIGUOUS = "l1IO0";
  const SETS = {
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lower: "abcdefghijklmnopqrstuvwxyz",
    numbers: "0123456789",
    symbols: "!@#$%^&*()-_=+[]{};:,.<>?/"
  };

  function generate() {
    const len = +c.querySelector("#pwLength").value;
    const useUpper = c.querySelector("#pwUpper").checked;
    const useLower = c.querySelector("#pwLower").checked;
    const useNumbers = c.querySelector("#pwNumbers").checked;
    const useSymbols = c.querySelector("#pwSymbols").checked;
    const excludeAmbiguous = c.querySelector("#pwAmbiguous").checked;

    let pool = "";
    if (useUpper) pool += SETS.upper;
    if (useLower) pool += SETS.lower;
    if (useNumbers) pool += SETS.numbers;
    if (useSymbols) pool += SETS.symbols;
    if (excludeAmbiguous) {
      pool = pool.split("").filter((ch) => !AMBIGUOUS.includes(ch)).join("");
    }

    const output = c.querySelector("#pwOutput");
    if (!pool) {
      output.textContent = "";
      toast(t("tool.password.needOneType"));
      return;
    }

    const bytes = new Uint32Array(len);
    crypto.getRandomValues(bytes);
    let pass = "";
    for (let i = 0; i < len; i++) pass += pool[bytes[i] % pool.length];
    output.textContent = pass;
    scoreStrength(pass, useUpper, useLower, useNumbers, useSymbols);
  }

  function scoreStrength(pass, u, l, n, s) {
    const variety = [u, l, n, s].filter(Boolean).length;
    let score = Math.min(4, Math.floor((pass.length / 6) * (variety / 2)));
    const fill = c.querySelector("#pwStrengthFill");
    const label = c.querySelector("#pwStrengthLabel");
    const levels = [
      { pct: 25, color: "var(--danger)", key: "tool.password.strength.weak", cls: "danger" },
      { pct: 50, color: "var(--warning)", key: "tool.password.strength.fair", cls: "warning" },
      { pct: 75, color: "var(--accent)", key: "tool.password.strength.strong", cls: "info" },
      { pct: 100, color: "var(--success)", key: "tool.password.strength.veryStrong", cls: "success" }
    ];
    const lvl = levels[Math.min(3, score)];
    fill.style.width = lvl.pct + "%";
    fill.style.background = lvl.color;
    label.textContent = t(lvl.key);
    label.className = "badge " + lvl.cls;
  }

  c.querySelector("#pwLength").addEventListener("input", (e) => {
    c.querySelector("#pwLengthVal").textContent = e.target.value;
  });
  c.querySelector("#pwGenerate").addEventListener("click", generate);
  ["pwUpper", "pwLower", "pwNumbers", "pwSymbols", "pwAmbiguous", "pwLength"].forEach((id) =>
    c.querySelector(`#${id}`).addEventListener("change", generate)
  );
  addCopyHandler(c, "#pwCopy", () => c.querySelector("#pwOutput").textContent);
  generate();
};

/* ---------- 2. Random Name Generator ---------- */
RENDERERS.names = (c) => {
  const FIRST_F = ["Emma", "Olivia", "Ava", "Sophia", "Isabella", "Mia", "Amelia", "Luna", "Aria", "Zoe", "Nora", "Hazel", "Elena", "Nova", "Ivy"];
  const FIRST_M = ["Liam", "Noah", "Oliver", "Elijah", "James", "Lucas", "Henry", "Leo", "Owen", "Ethan", "Gabriel", "Julian", "Milo", "Dean", "Axel"];
  const LAST = ["Bennett", "Carter", "Diaz", "Ellis", "Foster", "Grant", "Hayes", "Irwin", "Jensen", "Kovacs", "Larsen", "Morgan", "Nguyen", "Ortiz", "Parker", "Reyes", "Silva", "Turner", "Voss", "Walsh"];

  c.innerHTML = `
    <div class="field">
      <label>${t("tool.names.count")}</label>
      <input type="number" id="nameCount" min="1" max="50" value="5" />
    </div>
    <div class="field">
      <label>${t("tool.names.gender")}</label>
      <select id="nameGender">
        <option value="any">${t("tool.names.gender.any")}</option>
        <option value="feminine">${t("tool.names.gender.feminine")}</option>
        <option value="masculine">${t("tool.names.gender.masculine")}</option>
      </select>
    </div>
    <div class="output-box" id="nameOutput"></div>
    <div class="btn-row">
      <button class="btn primary" id="nameGenerate">${t("action.generate")}</button>
      <button class="btn" id="nameCopy">${t("action.copy")}</button>
    </div>
  `;

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function generate() {
    const count = Math.max(1, Math.min(50, +c.querySelector("#nameCount").value || 1));
    const gender = c.querySelector("#nameGender").value;
    const names = [];
    for (let i = 0; i < count; i++) {
      let firstPool = FIRST_F.concat(FIRST_M);
      if (gender === "feminine") firstPool = FIRST_F;
      if (gender === "masculine") firstPool = FIRST_M;
      names.push(`${pick(firstPool)} ${pick(LAST)}`);
    }
    c.querySelector("#nameOutput").textContent = names.join("\n");
  }

  c.querySelector("#nameGenerate").addEventListener("click", generate);
  addCopyHandler(c, "#nameCopy", () => c.querySelector("#nameOutput").textContent);
  generate();
};

/* ---------- 3. UUID Generator ---------- */
RENDERERS.uuid = (c) => {
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.uuid.count")}</label>
      <input type="number" id="uuidCount" min="1" max="100" value="5" />
    </div>
    <div class="checkbox-row"><input type="checkbox" id="uuidUpper" /><label for="uuidUpper">${t("tool.uuid.uppercase")}</label></div>
    <div class="checkbox-row"><input type="checkbox" id="uuidHyphens" checked /><label for="uuidHyphens">${t("tool.uuid.hyphens")}</label></div>
    <div class="output-box" id="uuidOutput"></div>
    <div class="btn-row">
      <button class="btn primary" id="uuidGenerate">${t("action.generate")}</button>
      <button class="btn" id="uuidCopy">${t("action.copy")}</button>
    </div>
  `;

  function uuidV4() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }

  function generate() {
    const count = Math.max(1, Math.min(100, +c.querySelector("#uuidCount").value || 1));
    const upper = c.querySelector("#uuidUpper").checked;
    const hyphens = c.querySelector("#uuidHyphens").checked;
    const list = [];
    for (let i = 0; i < count; i++) {
      let id = uuidV4();
      if (!hyphens) id = id.replace(/-/g, "");
      if (upper) id = id.toUpperCase();
      list.push(id);
    }
    c.querySelector("#uuidOutput").textContent = list.join("\n");
  }

  c.querySelector("#uuidGenerate").addEventListener("click", generate);
  addCopyHandler(c, "#uuidCopy", () => c.querySelector("#uuidOutput").textContent);
  generate();
};

/* ---------- 4. Hash Generator ---------- */
RENDERERS.hash = (c) => {
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.hash.input")}</label>
      <textarea id="hashInput" placeholder="…"></textarea>
    </div>
    <div class="field">
      <label>${t("tool.hash.algorithm")}</label>
      <select id="hashAlgo">
        <option value="SHA-1">SHA-1</option>
        <option value="SHA-256" selected>SHA-256</option>
        <option value="SHA-512">SHA-512</option>
      </select>
    </div>
    <div class="output-box" id="hashOutput"></div>
    <div class="btn-row">
      <button class="btn" id="hashCopy">${t("action.copy")}</button>
    </div>
  `;

  async function compute() {
    const text = c.querySelector("#hashInput").value;
    const algo = c.querySelector("#hashAlgo").value;
    const output = c.querySelector("#hashOutput");
    if (!text) {
      output.textContent = "";
      return;
    }
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest(algo, data);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    output.textContent = hex;
  }

  c.querySelector("#hashInput").addEventListener("input", debounce(compute, 150));
  c.querySelector("#hashAlgo").addEventListener("change", compute);
  addCopyHandler(c, "#hashCopy", () => c.querySelector("#hashOutput").textContent);
};

/* ---------- 5. JSON Formatter ---------- */
RENDERERS.jsonFormat = (c) => {
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.jsonFormat.input")}</label>
      <textarea id="jfInput" placeholder='{"hello":"world"}'></textarea>
    </div>
    <div class="field">
      <label>${t("tool.jsonFormat.indent")}</label>
      <select id="jfIndent">
        <option value="2">2</option>
        <option value="4">4</option>
        <option value="tab">Tab</option>
      </select>
    </div>
    <div id="jfStatus"></div>
    <div class="field">
      <label>${t("tool.jsonFormat.output")}</label>
      <div class="output-box" id="jfOutput"></div>
    </div>
    <div class="btn-row">
      <button class="btn primary" id="jfFormat">${t("action.format")}</button>
      <button class="btn" id="jfCopy">${t("action.copy")}</button>
    </div>
  `;

  function run() {
    const raw = c.querySelector("#jfInput").value;
    const indentVal = c.querySelector("#jfIndent").value;
    const indent = indentVal === "tab" ? "\t" : Number(indentVal);
    const status = c.querySelector("#jfStatus");
    const output = c.querySelector("#jfOutput");
    if (!raw.trim()) {
      status.innerHTML = "";
      output.textContent = "";
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      output.textContent = JSON.stringify(parsed, null, indent);
      output.classList.remove("error");
      status.innerHTML = `<span class="badge success">${t("tool.jsonFormat.valid")}</span>`;
    } catch (err) {
      output.textContent = "";
      status.innerHTML = `<span class="badge danger">${t("tool.jsonFormat.invalid", { error: err.message })}</span>`;
    }
  }

  c.querySelector("#jfInput").addEventListener("input", debounce(run, 200));
  c.querySelector("#jfIndent").addEventListener("change", run);
  c.querySelector("#jfFormat").addEventListener("click", run);
  addCopyHandler(c, "#jfCopy", () => c.querySelector("#jfOutput").textContent);
};

/* ---------- 6. JSON Minifier ---------- */
RENDERERS.jsonMin = (c) => {
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.jsonMin.input")}</label>
      <textarea id="jmInput" placeholder='{"hello": "world"}'></textarea>
    </div>
    <div class="field">
      <label>${t("tool.jsonMin.output")}</label>
      <div class="output-box" id="jmOutput"></div>
    </div>
    <p class="hint" id="jmSavings"></p>
    <div class="btn-row">
      <button class="btn primary" id="jmRun">${t("action.minify")}</button>
      <button class="btn" id="jmCopy">${t("action.copy")}</button>
    </div>
  `;

  function run() {
    const raw = c.querySelector("#jmInput").value;
    const output = c.querySelector("#jmOutput");
    const savings = c.querySelector("#jmSavings");
    if (!raw.trim()) {
      output.textContent = "";
      savings.textContent = "";
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const min = JSON.stringify(parsed);
      output.textContent = min;
      output.classList.remove("error");
      const before = new Blob([raw]).size;
      const after = new Blob([min]).size;
      const pct = before ? Math.round((1 - after / before) * 100) : 0;
      savings.textContent = t("tool.jsonMin.savings", { percent: pct, before, after });
    } catch (err) {
      output.textContent = "";
      output.classList.add("error");
      toast(t("toast.invalidJson"));
    }
  }

  c.querySelector("#jmInput").addEventListener("input", debounce(run, 200));
  c.querySelector("#jmRun").addEventListener("click", run);
  addCopyHandler(c, "#jmCopy", () => c.querySelector("#jmOutput").textContent);
};

/* ---------- 7 & 8. Base64 Encode / Decode ---------- */
function base64Renderer(mode) {
  return (c) => {
    const encoding = mode === "encode";
    c.innerHTML = `
      <div class="field">
        <label>${t("tool.b64.input")}</label>
        <textarea id="b64Input"></textarea>
      </div>
      <div class="field">
        <label>${t("tool.b64.output")}</label>
        <div class="output-box" id="b64Output"></div>
      </div>
      <div class="btn-row">
        <button class="btn primary" id="b64Run">${t(encoding ? "action.encode" : "action.decode")}</button>
        <button class="btn" id="b64Copy">${t("action.copy")}</button>
      </div>
    `;

    function run() {
      const input = c.querySelector("#b64Input").value;
      const output = c.querySelector("#b64Output");
      if (!input) {
        output.textContent = "";
        output.classList.remove("error");
        return;
      }
      try {
        if (encoding) {
          const bytes = new TextEncoder().encode(input);
          let bin = "";
          bytes.forEach((b) => (bin += String.fromCharCode(b)));
          output.textContent = btoa(bin);
        } else {
          const bin = atob(input.trim());
          const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
          output.textContent = new TextDecoder().decode(bytes);
        }
        output.classList.remove("error");
      } catch (e) {
        output.textContent = t("tool.b64.invalid");
        output.classList.add("error");
      }
    }

    c.querySelector("#b64Input").addEventListener("input", debounce(run, 150));
    c.querySelector("#b64Run").addEventListener("click", run);
    addCopyHandler(c, "#b64Copy", () => c.querySelector("#b64Output").textContent);
  };
}
RENDERERS.b64encode = base64Renderer("encode");
RENDERERS.b64decode = base64Renderer("decode");

/* ---------- 9. Unix Timestamp Converter ---------- */
RENDERERS.timestamp = (c) => {
  const now = Date.now();
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.timestamp.now")}</label>
      <div class="output-box" id="tsNow">${Math.floor(now / 1000)}</div>
    </div>
    <div class="field">
      <label>${t("tool.timestamp.toDate")}</label>
      <div class="field-row">
        <input type="number" id="tsInput" value="${Math.floor(now / 1000)}" />
        <select id="tsUnit">
          <option value="s">${t("tool.timestamp.seconds")}</option>
          <option value="ms">${t("tool.timestamp.milliseconds")}</option>
        </select>
      </div>
      <div class="output-box" id="tsDateOut"></div>
    </div>
    <div class="field">
      <label>${t("tool.timestamp.toUnix")}</label>
      <input type="datetime-local" id="tsDateInput" />
      <div class="output-box" id="tsUnixOut"></div>
    </div>
    <div class="btn-row">
      <button class="btn" id="tsUseNow">${t("tool.timestamp.useNow")}</button>
      <button class="btn" id="tsCopy">${t("action.copy")}</button>
    </div>
  `;

  function toDate() {
    const val = +c.querySelector("#tsInput").value;
    const unit = c.querySelector("#tsUnit").value;
    const ms = unit === "s" ? val * 1000 : val;
    const d = new Date(ms);
    const out = c.querySelector("#tsDateOut");
    if (isNaN(d.getTime())) {
      out.textContent = "—";
      return;
    }
    out.innerHTML = `${t("tool.timestamp.localTime")}: ${d.toLocaleString()}<br>${t("tool.timestamp.utcTime")}: ${d.toUTCString()}`;
  }

  function toUnix() {
    const val = c.querySelector("#tsDateInput").value;
    const out = c.querySelector("#tsUnixOut");
    if (!val) {
      out.textContent = "";
      return;
    }
    const d = new Date(val);
    out.textContent = `${Math.floor(d.getTime() / 1000)} s / ${d.getTime()} ms`;
  }

  c.querySelector("#tsInput").addEventListener("input", toDate);
  c.querySelector("#tsUnit").addEventListener("change", toDate);
  c.querySelector("#tsDateInput").addEventListener("input", toUnix);
  c.querySelector("#tsUseNow").addEventListener("click", () => {
    const n = Date.now();
    c.querySelector("#tsInput").value = Math.floor(n / 1000);
    c.querySelector("#tsUnit").value = "s";
    toDate();
  });
  addCopyHandler(c, "#tsCopy", () => c.querySelector("#tsDateOut").textContent || c.querySelector("#tsUnixOut").textContent);
  toDate();
};

/* ---------- 10. Text to Binary ---------- */
RENDERERS.binary = (c) => {
  c.innerHTML = `
    <div class="tabs" id="binTabs">
      <button class="active" data-dir="toBinary">${t("tool.binary.direction.toBinary")}</button>
      <button data-dir="toText">${t("tool.binary.direction.toText")}</button>
    </div>
    <div class="field">
      <label id="binInputLabel">${t("tool.binary.text")}</label>
      <textarea id="binInput"></textarea>
    </div>
    <div class="field">
      <label id="binOutputLabel">${t("tool.binary.binary")}</label>
      <div class="output-box" id="binOutput"></div>
    </div>
    <div class="btn-row">
      <button class="btn primary" id="binConvert">${t("action.convert")}</button>
      <button class="btn" id="binCopy">${t("action.copy")}</button>
    </div>
  `;

  let dir = "toBinary";

  function updateLabels() {
    c.querySelector("#binInputLabel").textContent = dir === "toBinary" ? t("tool.binary.text") : t("tool.binary.binary");
    c.querySelector("#binOutputLabel").textContent = dir === "toBinary" ? t("tool.binary.binary") : t("tool.binary.text");
  }

  function run() {
    const input = c.querySelector("#binInput").value;
    const output = c.querySelector("#binOutput");
    try {
      if (dir === "toBinary") {
        output.textContent = [...new TextEncoder().encode(input)].map((b) => b.toString(2).padStart(8, "0")).join(" ");
      } else {
        const bytes = input.trim().split(/\s+/).filter(Boolean).map((b) => parseInt(b, 2));
        if (bytes.some((b) => isNaN(b))) throw new Error("invalid");
        output.textContent = new TextDecoder().decode(new Uint8Array(bytes));
      }
      output.classList.remove("error");
    } catch (e) {
      output.textContent = t("toast.invalidInput");
      output.classList.add("error");
    }
  }

  c.querySelectorAll("#binTabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      dir = btn.getAttribute("data-dir");
      c.querySelectorAll("#binTabs button").forEach((b) => b.classList.toggle("active", b === btn));
      c.querySelector("#binInput").value = "";
      c.querySelector("#binOutput").textContent = "";
      updateLabels();
    });
  });

  c.querySelector("#binInput").addEventListener("input", debounce(run, 150));
  c.querySelector("#binConvert").addEventListener("click", run);
  addCopyHandler(c, "#binCopy", () => c.querySelector("#binOutput").textContent);
};

/* ---------- 11. Text to Morse ---------- */
const MORSE_MAP = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....",
  I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.",
  Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..", 0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-",
  5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.", ".": ".-.-.-",
  ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--", "/": "-..-.",
  "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...", ";": "-.-.-.",
  "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-", '"': ".-..-.",
  "$": "...-..-", "@": ".--.-."
};
const MORSE_REVERSE = Object.fromEntries(Object.entries(MORSE_MAP).map(([k, v]) => [v, k]));

RENDERERS.morse = (c) => {
  c.innerHTML = `
    <div class="tabs" id="morseTabs">
      <button class="active" data-dir="toMorse">${t("tool.morse.direction.toMorse")}</button>
      <button data-dir="toText">${t("tool.morse.direction.toText")}</button>
    </div>
    <div class="field">
      <label id="morseInputLabel">${t("tool.morse.text")}</label>
      <textarea id="morseInput"></textarea>
    </div>
    <div class="field">
      <label id="morseOutputLabel">${t("tool.morse.morse")}</label>
      <div class="output-box" id="morseOutput"></div>
    </div>
    <div class="btn-row">
      <button class="btn primary" id="morseConvert">${t("action.convert")}</button>
      <button class="btn" id="morsePlay">${t("tool.morse.playSound")}</button>
      <button class="btn" id="morseCopy">${t("action.copy")}</button>
    </div>
  `;

  let dir = "toMorse";

  function updateLabels() {
    c.querySelector("#morseInputLabel").textContent = dir === "toMorse" ? t("tool.morse.text") : t("tool.morse.morse");
    c.querySelector("#morseOutputLabel").textContent = dir === "toMorse" ? t("tool.morse.morse") : t("tool.morse.text");
  }

  function run() {
    const input = c.querySelector("#morseInput").value;
    const output = c.querySelector("#morseOutput");
    if (dir === "toMorse") {
      output.textContent = input
        .toUpperCase()
        .split("")
        .map((ch) => (ch === " " ? "/" : MORSE_MAP[ch] || ""))
        .filter((x) => x !== "")
        .join(" ");
    } else {
      output.textContent = input
        .trim()
        .split(" ")
        .map((code) => (code === "/" ? " " : MORSE_REVERSE[code] || ""))
        .join("");
    }
  }

  function playSound() {
    const morse = dir === "toMorse" ? c.querySelector("#morseOutput").textContent : c.querySelector("#morseInput").value;
    if (!morse) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const unit = 0.08;
    let t0 = ctx.currentTime;
    morse.split("").forEach((symbol) => {
      if (symbol === "." || symbol === "-") {
        const dur = symbol === "." ? unit : unit * 3;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 600;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.2, t0);
        osc.start(t0);
        osc.stop(t0 + dur);
        t0 += dur + unit;
      } else if (symbol === " ") {
        t0 += unit * 2;
      } else if (symbol === "/") {
        t0 += unit * 4;
      }
    });
  }

  c.querySelectorAll("#morseTabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      dir = btn.getAttribute("data-dir");
      c.querySelectorAll("#morseTabs button").forEach((b) => b.classList.toggle("active", b === btn));
      c.querySelector("#morseInput").value = "";
      c.querySelector("#morseOutput").textContent = "";
      updateLabels();
    });
  });

  c.querySelector("#morseInput").addEventListener("input", debounce(run, 150));
  c.querySelector("#morseConvert").addEventListener("click", run);
  c.querySelector("#morsePlay").addEventListener("click", playSound);
  addCopyHandler(c, "#morseCopy", () => c.querySelector("#morseOutput").textContent);
};

/* ---------- 12. Color Picker ---------- */
RENDERERS.colorPicker = (c) => {
  const recent = JSON.parse(localStorage.getItem("nova_recent_colors") || "[]");
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.colorPicker.pick")}</label>
      <input type="color" id="cpInput" value="${recent[0] || "#53d5ff"}" style="height:48px;padding:4px;" />
    </div>
    <div class="color-preview" id="cpPreview"></div>
    <div class="field"><label>HEX</label><div class="output-box" id="cpHex"></div></div>
    <div class="field"><label>RGB</label><div class="output-box" id="cpRgb"></div></div>
    <div class="field"><label>HSL</label><div class="output-box" id="cpHsl"></div></div>
    <div class="field">
      <label>${t("tool.colorPicker.recent")}</label>
      <div class="swatch-row" id="cpRecent"></div>
    </div>
  `;

  function hexToRgb(hex) {
    const v = hex.replace("#", "");
    const num = parseInt(v, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function renderRecent() {
    const list = JSON.parse(localStorage.getItem("nova_recent_colors") || "[]");
    const wrap = c.querySelector("#cpRecent");
    wrap.innerHTML = "";
    list.forEach((hex) => {
      const sw = document.createElement("button");
      sw.className = "swatch";
      sw.style.background = hex;
      sw.title = hex;
      sw.addEventListener("click", () => {
        c.querySelector("#cpInput").value = hex;
        update(false);
      });
      wrap.appendChild(sw);
    });
  }

  function update(saveRecent = true) {
    const hex = c.querySelector("#cpInput").value;
    const { r, g, b } = hexToRgb(hex);
    const hsl = rgbToHsl(r, g, b);
    c.querySelector("#cpPreview").style.background = hex;
    c.querySelector("#cpHex").textContent = hex.toUpperCase();
    c.querySelector("#cpRgb").textContent = `rgb(${r}, ${g}, ${b})`;
    c.querySelector("#cpHsl").textContent = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    if (saveRecent) {
      let list = JSON.parse(localStorage.getItem("nova_recent_colors") || "[]");
      list = [hex, ...list.filter((x) => x !== hex)].slice(0, 10);
      localStorage.setItem("nova_recent_colors", JSON.stringify(list));
      renderRecent();
    }
  }

  c.querySelector("#cpInput").addEventListener("input", () => update(true));
  ["#cpHex", "#cpRgb", "#cpHsl"].forEach((sel) => {
    c.querySelector(sel).addEventListener("click", () => copyToClipboard(c.querySelector(sel).textContent));
  });
  renderRecent();
  update(false);
};

/* ---------- 13. HEX/RGB/HSL Converter ---------- */
RENDERERS.colorConvert = (c) => {
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.colorConvert.hex")}</label>
      <input type="text" id="ccHex" placeholder="#53d5ff" />
    </div>
    <div class="field">
      <label>${t("tool.colorConvert.rgb")}</label>
      <input type="text" id="ccRgb" placeholder="rgb(83, 213, 255)" />
    </div>
    <div class="field">
      <label>${t("tool.colorConvert.hsl")}</label>
      <input type="text" id="ccHsl" placeholder="hsl(196, 100%, 66%)" />
    </div>
    <div class="color-preview" id="ccPreview"></div>
  `;

  function hexToRgb(hex) {
    hex = hex.replace("#", "").trim();
    if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
  }
  function parseRgbStr(str) {
    const m = str.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3] };
  }
  function parseHslStr(str) {
    const m = str.match(/(\d+)[,\s]+(\d+)%?[,\s]+(\d+)%?/);
    if (!m) return null;
    return { h: +m[1], s: +m[2], l: +m[3] };
  }

  function apply(rgb) {
    if (!rgb) {
      toast(t("tool.colorConvert.invalid"));
      return;
    }
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    c.querySelector("#ccHex").value = hex;
    c.querySelector("#ccRgb").value = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    c.querySelector("#ccHsl").value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    c.querySelector("#ccPreview").style.background = hex;
  }

  c.querySelector("#ccHex").addEventListener("input", (e) => {
    const rgb = hexToRgb(e.target.value);
    if (rgb) apply(rgb);
  });
  c.querySelector("#ccRgb").addEventListener("input", (e) => {
    const rgb = parseRgbStr(e.target.value);
    if (rgb) apply(rgb);
  });
  c.querySelector("#ccHsl").addEventListener("input", (e) => {
    const hsl = parseHslStr(e.target.value);
    if (hsl) apply(hslToRgb(hsl.h, hsl.s, hsl.l));
  });

  apply({ r: 83, g: 213, b: 255 });
};

/* ---------- 14. CSS Gradient Generator ---------- */
RENDERERS.gradient = (c) => {
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.gradient.type")}</label>
      <select id="grType">
        <option value="linear">${t("tool.gradient.type.linear")}</option>
        <option value="radial">${t("tool.gradient.type.radial")}</option>
      </select>
    </div>
    <div class="field" id="grAngleField">
      <label>${t("tool.gradient.angle")}</label>
      <div class="range-row">
        <input type="range" id="grAngle" min="0" max="360" value="135" />
        <span class="range-value" id="grAngleVal">135°</span>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>${t("tool.gradient.colorStart")}</label><input type="color" id="grStart" value="#53d5ff" /></div>
      <div class="field"><label>${t("tool.gradient.colorEnd")}</label><input type="color" id="grEnd" value="#8e6dff" /></div>
    </div>
    <div class="gradient-preview" id="grPreview"></div>
    <div class="field">
      <label>${t("tool.gradient.css")}</label>
      <div class="output-box" id="grOutput"></div>
    </div>
    <div class="btn-row">
      <button class="btn" id="grCopy">${t("action.copy")}</button>
    </div>
  `;

  function run() {
    const type = c.querySelector("#grType").value;
    const angle = c.querySelector("#grAngle").value;
    const start = c.querySelector("#grStart").value;
    const end = c.querySelector("#grEnd").value;
    c.querySelector("#grAngleField").style.display = type === "linear" ? "flex" : "none";
    c.querySelector("#grAngleField").style.flexDirection = "column";
    c.querySelector("#grAngleVal").textContent = angle + "°";

    const css = type === "linear"
      ? `linear-gradient(${angle}deg, ${start}, ${end})`
      : `radial-gradient(circle, ${start}, ${end})`;

    c.querySelector("#grPreview").style.background = css;
    c.querySelector("#grOutput").textContent = `background: ${css};`;
  }

  c.querySelectorAll("#grType, #grAngle, #grStart, #grEnd").forEach((el) => el.addEventListener("input", run));
  addCopyHandler(c, "#grCopy", () => c.querySelector("#grOutput").textContent);
  run();
};

/* ---------- 15. CSS Box Shadow Generator ---------- */
RENDERERS.shadow = (c) => {
  c.innerHTML = `
    <div class="shadow-preview-wrap"><div class="shadow-preview-box" id="shBox"></div></div>
    <div class="field-row">
      <div class="field"><label>${t("tool.shadow.offsetX")}</label><input type="range" id="shX" min="-50" max="50" value="0" /></div>
      <div class="field"><label>${t("tool.shadow.offsetY")}</label><input type="range" id="shY" min="-50" max="50" value="10" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>${t("tool.shadow.blur")}</label><input type="range" id="shBlur" min="0" max="100" value="24" /></div>
      <div class="field"><label>${t("tool.shadow.spread")}</label><input type="range" id="shSpread" min="-30" max="30" value="0" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>${t("tool.shadow.color")}</label><input type="color" id="shColor" value="#53d5ff" /></div>
      <div class="checkbox-row" style="align-self:flex-end;"><input type="checkbox" id="shInset" /><label for="shInset">${t("tool.shadow.inset")}</label></div>
    </div>
    <div class="field">
      <label>${t("tool.shadow.css")}</label>
      <div class="output-box" id="shOutput"></div>
    </div>
    <div class="btn-row"><button class="btn" id="shCopy">${t("action.copy")}</button></div>
  `;

  function hexToRgba(hex, alpha) {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function run() {
    const x = c.querySelector("#shX").value;
    const y = c.querySelector("#shY").value;
    const blur = c.querySelector("#shBlur").value;
    const spread = c.querySelector("#shSpread").value;
    const color = hexToRgba(c.querySelector("#shColor").value, 0.55);
    const inset = c.querySelector("#shInset").checked ? "inset " : "";
    const css = `${inset}${x}px ${y}px ${blur}px ${spread}px ${color}`;
    c.querySelector("#shBox").style.boxShadow = css;
    c.querySelector("#shOutput").textContent = `box-shadow: ${css};`;
  }

  c.querySelectorAll("#shX,#shY,#shBlur,#shSpread,#shColor,#shInset").forEach((el) => el.addEventListener("input", run));
  addCopyHandler(c, "#shCopy", () => c.querySelector("#shOutput").textContent);
  run();
};

/* ---------- 16. Font Pairing Tool ---------- */
RENDERERS.fonts = (c) => {
  const PAIRS = [
    { heading: "Georgia, 'Times New Roman', serif", body: "Verdana, Arial, sans-serif", name: "Georgia + Verdana" },
    { heading: "'Trebuchet MS', sans-serif", body: "Georgia, serif", name: "Trebuchet MS + Georgia" },
    { heading: "'Courier New', monospace", body: "Arial, sans-serif", name: "Courier New + Arial" },
    { heading: "'Palatino Linotype', Palatino, serif", body: "Tahoma, Geneva, sans-serif", name: "Palatino + Tahoma" },
    { heading: "Impact, 'Arial Black', sans-serif", body: "'Segoe UI', Arial, sans-serif", name: "Impact + Segoe UI" },
    { heading: "'Book Antiqua', Palatino, serif", body: "'Lucida Sans Unicode', sans-serif", name: "Book Antiqua + Lucida Sans" }
  ];
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.fonts.title")}</label>
      <select id="fpSelect">
        ${PAIRS.map((p, i) => `<option value="${i}">${p.name}</option>`).join("")}
      </select>
    </div>
    <div class="font-preview" id="fpPreview">
      <h4 id="fpHeading">${t("tool.fonts.previewHeading")}</h4>
      <p id="fpBody">${t("tool.fonts.previewBody")}</p>
    </div>
    <div class="field">
      <label>${t("tool.fonts.css")}</label>
      <div class="output-box" id="fpOutput"></div>
    </div>
    <div class="btn-row"><button class="btn" id="fpCopy">${t("action.copy")}</button></div>
  `;

  function run() {
    const pair = PAIRS[+c.querySelector("#fpSelect").value];
    c.querySelector("#fpHeading").style.fontFamily = pair.heading;
    c.querySelector("#fpBody").style.fontFamily = pair.body;
    c.querySelector("#fpOutput").textContent = `h1, h2, h3 { font-family: ${pair.heading}; }\nbody, p { font-family: ${pair.body}; }`;
  }

  c.querySelector("#fpSelect").addEventListener("change", run);
  addCopyHandler(c, "#fpCopy", () => c.querySelector("#fpOutput").textContent);
  run();
};

/* ---------- Shared: image upload helper ---------- */
function buildImageUploader(c, onLoad, dropZoneLabel) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="drop-zone" id="dz">${dropZoneLabel}</div>
    <input type="file" accept="image/*" id="dzInput" class="hidden" />
  `;
  const dz = wrap.querySelector("#dz");
  const input = wrap.querySelector("#dzInput");
  dz.addEventListener("click", () => input.click());
  dz.addEventListener("dragover", (e) => e.preventDefault());
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  input.addEventListener("change", () => {
    if (input.files[0]) handleFile(input.files[0]);
  });
  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = () => onLoad(reader.result, file);
    reader.readAsDataURL(file);
  }
  return wrap;
}

/* ---------- 17. Image Resize Tool ---------- */
RENDERERS.imgResize = (c) => {
  c.innerHTML = `
    <div id="irUploaderSlot"></div>
    <p class="hint hidden" id="irEmptyHint">${t("tool.imgResize.noImage")}</p>
    <div id="irWorkArea" class="hidden">
      <img class="image-preview" id="irPreview" />
      <div class="field-row" style="margin-top:12px;">
        <div class="field"><label>${t("tool.imgResize.width")}</label><input type="number" id="irWidth" /></div>
        <div class="field"><label>${t("tool.imgResize.height")}</label><input type="number" id="irHeight" /></div>
      </div>
      <div class="checkbox-row"><input type="checkbox" id="irRatio" checked /><label for="irRatio">${t("tool.imgResize.keepRatio")}</label></div>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn primary" id="irDownload">${t("action.download")}</button>
      </div>
    </div>
  `;

  let img = new Image();
  let ratio = 1;

  const uploader = buildImageUploader(c, (dataUrl) => {
    img = new Image();
    img.onload = () => {
      ratio = img.width / img.height;
      c.querySelector("#irPreview").src = dataUrl;
      c.querySelector("#irWidth").value = img.width;
      c.querySelector("#irHeight").value = img.height;
      c.querySelector("#irWorkArea").classList.remove("hidden");
      c.querySelector("#irEmptyHint").classList.add("hidden");
    };
    img.src = dataUrl;
  }, t("action.upload"));
  c.querySelector("#irUploaderSlot").appendChild(uploader);
  c.querySelector("#irEmptyHint").classList.remove("hidden");

  c.querySelector("#irWidth").addEventListener("input", (e) => {
    if (c.querySelector("#irRatio").checked) {
      c.querySelector("#irHeight").value = Math.round(+e.target.value / ratio);
    }
  });
  c.querySelector("#irHeight").addEventListener("input", (e) => {
    if (c.querySelector("#irRatio").checked) {
      c.querySelector("#irWidth").value = Math.round(+e.target.value * ratio);
    }
  });

  c.querySelector("#irDownload").addEventListener("click", () => {
    const w = +c.querySelector("#irWidth").value;
    const h = +c.querySelector("#irHeight").value;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    canvas.toBlob((blob) => downloadFile("resized.png", blob, "image/png"));
  });
};

/* ---------- 18. Image Compressor ---------- */
RENDERERS.imgCompress = (c) => {
  c.innerHTML = `
    <div id="icUploaderSlot"></div>
    <div id="icWorkArea" class="hidden">
      <img class="image-preview" id="icPreview" />
      <div class="field" style="margin-top:12px;">
        <label>${t("tool.imgCompress.quality")}</label>
        <div class="range-row">
          <input type="range" id="icQuality" min="10" max="100" value="80" />
          <span class="range-value" id="icQualityVal">80%</span>
        </div>
      </div>
      <p class="hint" id="icOriginalSize"></p>
      <p class="hint" id="icCompressedSize"></p>
      <div class="btn-row" style="margin-top:6px;">
        <button class="btn primary" id="icDownload">${t("action.download")}</button>
      </div>
    </div>
  `;

  let img = new Image();
  let originalSize = 0;

  const uploader = buildImageUploader(c, (dataUrl, file) => {
    originalSize = file.size;
    img = new Image();
    img.onload = () => {
      c.querySelector("#icPreview").src = dataUrl;
      c.querySelector("#icWorkArea").classList.remove("hidden");
      c.querySelector("#icOriginalSize").textContent = t("tool.imgCompress.originalSize", { size: formatBytes(originalSize) });
      run();
    };
    img.src = dataUrl;
  }, t("action.upload"));
  c.querySelector("#icUploaderSlot").appendChild(uploader);

  function run() {
    const q = +c.querySelector("#icQuality").value / 100;
    c.querySelector("#icQualityVal").textContent = Math.round(q * 100) + "%";
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0);
    canvas.toBlob(
      (blob) => {
        c.querySelector("#icCompressedSize").textContent = t("tool.imgCompress.compressedSize", { size: formatBytes(blob.size) });
        c.querySelector("#icDownload").onclick = () => downloadFile("compressed.jpg", blob, "image/jpeg");
      },
      "image/jpeg",
      q
    );
  }

  c.querySelector("#icQuality").addEventListener("input", debounce(run, 150));
};

/* ---------- 19. Image to Base64 ---------- */
RENDERERS.imgB64 = (c) => {
  c.innerHTML = `
    <div id="ibUploaderSlot"></div>
    <div id="ibWorkArea" class="hidden">
      <img class="image-preview" id="ibPreview" />
      <div class="field" style="margin-top:12px;">
        <label>${t("tool.imgB64.output")}</label>
        <div class="output-box" id="ibOutput"></div>
      </div>
      <div class="btn-row"><button class="btn" id="ibCopy">${t("action.copy")}</button></div>
    </div>
  `;
  const uploader = buildImageUploader(c, (dataUrl) => {
    c.querySelector("#ibPreview").src = dataUrl;
    c.querySelector("#ibOutput").textContent = dataUrl;
    c.querySelector("#ibWorkArea").classList.remove("hidden");
  }, t("action.upload"));
  c.querySelector("#ibUploaderSlot").appendChild(uploader);
  addCopyHandler(c, "#ibCopy", () => c.querySelector("#ibOutput").textContent);
};

/* ---------- 20. Favicon Generator ---------- */
RENDERERS.favicon = (c) => {
  const SIZES = [16, 32, 48, 180, 192, 512];
  c.innerHTML = `
    <div id="fvUploaderSlot"></div>
    <div id="fvWorkArea" class="hidden">
      <p class="hint">${t("tool.favicon.sizes")}: ${SIZES.join(", ")}px</p>
      <div class="favicon-preview-row" id="fvGrid"></div>
    </div>
  `;
  let img = new Image();
  const uploader = buildImageUploader(c, (dataUrl) => {
    img = new Image();
    img.onload = () => {
      c.querySelector("#fvWorkArea").classList.remove("hidden");
      const grid = c.querySelector("#fvGrid");
      grid.innerHTML = "";
      SIZES.forEach((size) => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        canvas.getContext("2d").drawImage(img, 0, 0, size, size);
        const url = canvas.toDataURL("image/png");
        const item = document.createElement("div");
        item.className = "favicon-preview-item";
        item.innerHTML = `<img src="${url}" width="${Math.min(size, 64)}" height="${Math.min(size, 64)}" alt="${size}x${size}" /><span>${size}×${size}</span><button class="btn" style="padding:4px 10px;font-size:11px;">${t("action.download")}</button>`;
        item.querySelector("button").addEventListener("click", () => {
          canvas.toBlob((blob) => downloadFile(`icon-${size}.png`, blob, "image/png"));
        });
        grid.appendChild(item);
      });
    };
    img.src = dataUrl;
  }, t("action.upload"));
  c.querySelector("#fvUploaderSlot").appendChild(uploader);
};

/* ---------- 21. Markdown Editor + Preview ---------- */
function renderMarkdown(src) {
  let html = escapeHtml(src);
  html = html.replace(/```([\s\S]*?)```/g, (m, code) => `<pre><code>${code}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^###### (.*)$/gm, "<h6>$1</h6>");
  html = html.replace(/^##### (.*)$/gm, "<h5>$1</h5>");
  html = html.replace(/^#### (.*)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/^(?:- |\* )(.*)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  html = html
    .split(/\n{2,}/)
    .map((block) => (/^\s*<(h\d|ul|pre|blockquote)/.test(block) ? block : `<p>${block.replace(/\n/g, "<br>")}</p>`))
    .join("\n");
  return html;
}

RENDERERS.markdown = (c) => {
  c.innerHTML = `
    <div class="markdown-grid">
      <div class="field">
        <label>${t("tool.markdown.editor")}</label>
        <textarea id="mdInput" style="min-height:220px;"># Hello Nova

**Bold**, *italic*, \`code\`, and [links](https://example.com).

- One
- Two
- Three</textarea>
      </div>
      <div class="field">
        <label>${t("tool.markdown.preview")}</label>
        <div class="markdown-preview" id="mdPreview"></div>
      </div>
    </div>
  `;
  function run() {
    c.querySelector("#mdPreview").innerHTML = renderMarkdown(c.querySelector("#mdInput").value);
  }
  c.querySelector("#mdInput").addEventListener("input", debounce(run, 150));
  run();
};

/* ---------- 22. Word Counter ---------- */
RENDERERS.wordCount = (c) => {
  c.innerHTML = `
    <div class="field">
      <textarea id="wcInput" style="min-height:160px;"></textarea>
    </div>
    <div class="stat-row">
      <div class="stat-box"><strong id="wcWords">0</strong><span>${t("tool.wordCount.words")}</span></div>
      <div class="stat-box"><strong id="wcSentences">0</strong><span>${t("tool.wordCount.sentences")}</span></div>
      <div class="stat-box"><strong id="wcParagraphs">0</strong><span>${t("tool.wordCount.paragraphs")}</span></div>
      <div class="stat-box"><strong id="wcReading">0</strong><span>${t("tool.wordCount.readingTime")}</span></div>
    </div>
  `;
  function run() {
    const text = c.querySelector("#wcInput").value;
    const words = (text.match(/\S+/g) || []).length;
    const sentences = (text.match(/[^.!?]+[.!?]+/g) || (text.trim() ? [text] : [])).length;
    const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim()).length;
    c.querySelector("#wcWords").textContent = words;
    c.querySelector("#wcSentences").textContent = sentences;
    c.querySelector("#wcParagraphs").textContent = paragraphs;
    c.querySelector("#wcReading").textContent = t("tool.wordCount.minutes", { count: Math.max(1, Math.ceil(words / 200)) });
  }
  c.querySelector("#wcInput").addEventListener("input", debounce(run, 100));
  run();
};

/* ---------- 23. Character Counter ---------- */
RENDERERS.charCount = (c) => {
  c.innerHTML = `
    <div class="field">
      <textarea id="ccInput" style="min-height:140px;"></textarea>
    </div>
    <div class="field">
      <label>${t("tool.charCount.limit")}</label>
      <input type="number" id="ccLimit" min="0" placeholder="—" />
    </div>
    <div class="stat-row">
      <div class="stat-box"><strong id="ccWith">0</strong><span>${t("tool.charCount.withSpaces")}</span></div>
      <div class="stat-box"><strong id="ccWithout">0</strong><span>${t("tool.charCount.withoutSpaces")}</span></div>
    </div>
    <p class="hint" id="ccLimitStatus"></p>
  `;
  function run() {
    const text = c.querySelector("#ccInput").value;
    const limit = c.querySelector("#ccLimit").value;
    c.querySelector("#ccWith").textContent = text.length;
    c.querySelector("#ccWithout").textContent = text.replace(/\s/g, "").length;
    const status = c.querySelector("#ccLimitStatus");
    if (limit) {
      const remaining = +limit - text.length;
      status.textContent = remaining >= 0 ? t("tool.charCount.remaining", { count: remaining }) : t("tool.charCount.overLimit", { count: -remaining });
      status.style.color = remaining >= 0 ? "var(--muted)" : "var(--danger)";
    } else {
      status.textContent = "";
    }
  }
  c.querySelector("#ccInput").addEventListener("input", debounce(run, 100));
  c.querySelector("#ccLimit").addEventListener("input", run);
  run();
};

/* ---------- 24. Lorem Ipsum Generator ---------- */
RENDERERS.lorem = (c) => {
  const WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat".split(" ");

  function genWords(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
    return arr;
  }
  function genSentence() {
    const len = 6 + Math.floor(Math.random() * 8);
    const words = genWords(len);
    const s = words.join(" ");
    return s.charAt(0).toUpperCase() + s.slice(1) + ".";
  }
  function genParagraph() {
    const sentences = 3 + Math.floor(Math.random() * 4);
    return Array.from({ length: sentences }, genSentence).join(" ");
  }

  c.innerHTML = `
    <div class="field">
      <label>${t("tool.lorem.unit")}</label>
      <select id="loUnit">
        <option value="paragraphs">${t("tool.lorem.unit.paragraphs")}</option>
        <option value="sentences">${t("tool.lorem.unit.sentences")}</option>
        <option value="words">${t("tool.lorem.unit.words")}</option>
      </select>
    </div>
    <div class="field">
      <label>${t("tool.lorem.count")}</label>
      <input type="number" id="loCount" min="1" max="100" value="3" />
    </div>
    <div class="checkbox-row"><input type="checkbox" id="loClassic" checked /><label for="loClassic">${t("tool.lorem.startClassic")}</label></div>
    <div class="output-box" id="loOutput"></div>
    <div class="btn-row">
      <button class="btn primary" id="loGenerate">${t("action.generate")}</button>
      <button class="btn" id="loCopy">${t("action.copy")}</button>
    </div>
  `;

  function generate() {
    const unit = c.querySelector("#loUnit").value;
    const count = Math.max(1, Math.min(100, +c.querySelector("#loCount").value || 1));
    const classic = c.querySelector("#loClassic").checked;
    let result = "";
    if (unit === "words") {
      const w = genWords(count);
      result = w.join(" ");
      if (classic) result = "Lorem ipsum " + result;
    } else if (unit === "sentences") {
      const s = Array.from({ length: count }, genSentence);
      if (classic) s[0] = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
      result = s.join(" ");
    } else {
      const p = Array.from({ length: count }, genParagraph);
      if (classic) p[0] = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. " + p[0];
      result = p.join("\n\n");
    }
    c.querySelector("#loOutput").textContent = result;
  }

  c.querySelector("#loGenerate").addEventListener("click", generate);
  addCopyHandler(c, "#loCopy", () => c.querySelector("#loOutput").textContent);
  generate();
};

/* ---------- 25. Text Case Converter ---------- */
RENDERERS.textCase = (c) => {
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.textCase.input")}</label>
      <textarea id="tcInput"></textarea>
    </div>
    <div class="btn-row">
      <button class="btn" id="tcUpper">${t("tool.textCase.upper")}</button>
      <button class="btn" id="tcLower">${t("tool.textCase.lower")}</button>
      <button class="btn" id="tcCap">${t("tool.textCase.capitalize")}</button>
    </div>
    <div class="output-box" id="tcOutput"></div>
    <div class="btn-row"><button class="btn primary" id="tcCopy">${t("action.copy")}</button></div>
  `;

  function output(str) {
    c.querySelector("#tcOutput").textContent = str;
  }
  c.querySelector("#tcUpper").addEventListener("click", () => output(c.querySelector("#tcInput").value.toUpperCase()));
  c.querySelector("#tcLower").addEventListener("click", () => output(c.querySelector("#tcInput").value.toLowerCase()));
  c.querySelector("#tcCap").addEventListener("click", () =>
    output(
      c
        .querySelector("#tcInput")
        .value.toLowerCase()
        .replace(/\b\w/g, (ch) => ch.toUpperCase())
    )
  );
  addCopyHandler(c, "#tcCopy", () => c.querySelector("#tcOutput").textContent);
};

/* ---------- 26. Find and Replace ---------- */
RENDERERS.findReplace = (c) => {
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.findReplace.text")}</label>
      <textarea id="frText" style="min-height:140px;"></textarea>
    </div>
    <div class="field-row">
      <div class="field"><label>${t("tool.findReplace.find")}</label><input type="text" id="frFind" /></div>
      <div class="field"><label>${t("tool.findReplace.replace")}</label><input type="text" id="frReplace" /></div>
    </div>
    <div class="checkbox-row"><input type="checkbox" id="frCase" /><label for="frCase">${t("tool.findReplace.caseSensitive")}</label></div>
    <div class="checkbox-row"><input type="checkbox" id="frWhole" /><label for="frWhole">${t("tool.findReplace.wholeWord")}</label></div>
    <p class="hint" id="frMatches"></p>
    <div class="field">
      <label>${t("action.apply")}</label>
      <div class="output-box" id="frOutput"></div>
    </div>
    <div class="btn-row">
      <button class="btn primary" id="frRun">${t("action.replaceAll")}</button>
      <button class="btn" id="frCopy">${t("action.copy")}</button>
    </div>
  `;

  function buildRegex() {
    const find = c.querySelector("#frFind").value;
    if (!find) return null;
    const caseSensitive = c.querySelector("#frCase").checked;
    const wholeWord = c.querySelector("#frWhole").checked;
    let pattern = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (wholeWord) pattern = `\\b${pattern}\\b`;
    return new RegExp(pattern, "g" + (caseSensitive ? "" : "i"));
  }

  function run() {
    const text = c.querySelector("#frText").value;
    const replace = c.querySelector("#frReplace").value;
    const regex = buildRegex();
    const matchesEl = c.querySelector("#frMatches");
    if (!regex) {
      matchesEl.textContent = "";
      c.querySelector("#frOutput").textContent = text;
      return;
    }
    const count = (text.match(regex) || []).length;
    matchesEl.textContent = t("tool.findReplace.matches", { count });
    c.querySelector("#frOutput").textContent = text.replace(regex, replace);
  }

  ["#frText", "#frFind", "#frReplace", "#frCase", "#frWhole"].forEach((sel) =>
    c.querySelector(sel).addEventListener("input", debounce(run, 150))
  );
  c.querySelector("#frRun").addEventListener("click", run);
  addCopyHandler(c, "#frCopy", () => c.querySelector("#frOutput").textContent);
};

/* ---------- 27. HTML Escape / Unescape ---------- */
RENDERERS.htmlEscape = (c) => {
  c.innerHTML = `
    <div class="tabs" id="heTabs">
      <button class="active" data-dir="escape">${t("action.escape")}</button>
      <button data-dir="unescape">${t("action.unescape")}</button>
    </div>
    <div class="field">
      <label>${t("tool.htmlEscape.input")}</label>
      <textarea id="heInput"></textarea>
    </div>
    <div class="field">
      <label>${t("tool.htmlEscape.output")}</label>
      <div class="output-box" id="heOutput"></div>
    </div>
    <div class="btn-row"><button class="btn" id="heCopy">${t("action.copy")}</button></div>
  `;

  let dir = "escape";
  function unescapeHtml(str) {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
  }
  function run() {
    const input = c.querySelector("#heInput").value;
    c.querySelector("#heOutput").textContent = dir === "escape" ? escapeHtml(input) : unescapeHtml(input);
  }
  c.querySelectorAll("#heTabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      dir = btn.getAttribute("data-dir");
      c.querySelectorAll("#heTabs button").forEach((b) => b.classList.toggle("active", b === btn));
      run();
    });
  });
  c.querySelector("#heInput").addEventListener("input", debounce(run, 150));
  addCopyHandler(c, "#heCopy", () => c.querySelector("#heOutput").textContent);
};

/* ---------- 28. CSS Minifier ---------- */
RENDERERS.cssMin = (c) => {
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.cssMin.input")}</label>
      <textarea id="cmInput" style="min-height:160px;"></textarea>
    </div>
    <div class="field">
      <label>${t("tool.cssMin.output")}</label>
      <div class="output-box" id="cmOutput"></div>
    </div>
    <p class="hint" id="cmSavings"></p>
    <div class="btn-row">
      <button class="btn primary" id="cmRun">${t("action.minify")}</button>
      <button class="btn" id="cmCopy">${t("action.copy")}</button>
    </div>
  `;

  function minifyCss(css) {
    return css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\s*([{}:;,])\s*/g, "$1")
      .replace(/;}/g, "}")
      .replace(/\s{2,}/g, " ")
      .replace(/\n/g, "")
      .trim();
  }

  function run() {
    const raw = c.querySelector("#cmInput").value;
    const min = minifyCss(raw);
    c.querySelector("#cmOutput").textContent = min;
    const before = new Blob([raw]).size;
    const after = new Blob([min]).size;
    const pct = before ? Math.round((1 - after / before) * 100) : 0;
    c.querySelector("#cmSavings").textContent = raw ? t("tool.cssMin.savings", { percent: pct, before, after }) : "";
  }

  c.querySelector("#cmInput").addEventListener("input", debounce(run, 200));
  c.querySelector("#cmRun").addEventListener("click", run);
  addCopyHandler(c, "#cmCopy", () => c.querySelector("#cmOutput").textContent);
};

/* ---------- 29. JavaScript Formatter ---------- */
function formatJs(code, indentSize) {
  const indentStr = " ".repeat(indentSize);
  let result = "";
  let depth = 0;
  let i = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;

  const spaced = [];
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      spaced.push(ch);
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      spaced.push(ch);
      if (ch === "*" && next === "/") { spaced.push(next); i += 2; inBlockComment = false; continue; }
      i++;
      continue;
    }
    if (inString) {
      spaced.push(ch);
      if (ch === "\\") { spaced.push(next); i += 2; continue; }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") { inLineComment = true; spaced.push(ch); i++; continue; }
    if (ch === "/" && next === "*") { inBlockComment = true; spaced.push(ch); i++; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inString = ch; spaced.push(ch); i++; continue; }

    if (ch === "{" || ch === "}" || ch === ";") {
      spaced.push(ch, "\n");
      i++;
      continue;
    }
    spaced.push(ch);
    i++;
  }

  const rawLines = spaced.join("").split("\n").map((l) => l.trim()).filter((l) => l.length);

  rawLines.forEach((line) => {
    const closingFirst = line.startsWith("}");
    const printDepth = closingFirst ? Math.max(0, depth - 1) : depth;
    result += indentStr.repeat(printDepth) + line + "\n";
    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;
    depth = Math.max(0, depth + opens - closes);
  });

  return result.trim();
}

RENDERERS.jsFormat = (c) => {
  c.innerHTML = `
    <div class="field">
      <label>${t("tool.jsFormat.input")}</label>
      <textarea id="jsInput" style="min-height:160px;" placeholder="function greet(name){return 'Hi '+name;}"></textarea>
    </div>
    <div class="field">
      <label>${t("tool.jsFormat.indent")}</label>
      <select id="jsIndent">
        <option value="2">2</option>
        <option value="4">4</option>
      </select>
    </div>
    <div class="field">
      <label>${t("tool.jsFormat.output")}</label>
      <div class="output-box" id="jsOutput"></div>
    </div>
    <div class="btn-row">
      <button class="btn primary" id="jsRun">${t("action.format")}</button>
      <button class="btn" id="jsCopy">${t("action.copy")}</button>
    </div>
  `;

  function run() {
    const raw = c.querySelector("#jsInput").value;
    const indent = +c.querySelector("#jsIndent").value;
    if (!raw.trim()) {
      c.querySelector("#jsOutput").textContent = "";
      return;
    }
    try {
      c.querySelector("#jsOutput").textContent = formatJs(raw, indent);
    } catch (e) {
      c.querySelector("#jsOutput").textContent = raw;
    }
  }

  c.querySelector("#jsRun").addEventListener("click", run);
  c.querySelector("#jsIndent").addEventListener("change", run);
  addCopyHandler(c, "#jsCopy", () => c.querySelector("#jsOutput").textContent);
};

/* ---------- 30. Regex Tester ---------- */
RENDERERS.regex = (c) => {
  c.innerHTML = `
    <div class="field-row">
      <div class="field"><label>${t("tool.regex.pattern")}</label><input type="text" id="rxPattern" placeholder="\\w+" /></div>
      <div class="field"><label>${t("tool.regex.flags")}</label><input type="text" id="rxFlags" value="g" /></div>
    </div>
    <div class="field">
      <label>${t("tool.regex.testString")}</label>
      <textarea id="rxText" style="min-height:120px;"></textarea>
    </div>
    <p class="hint" id="rxStatus"></p>
    <div class="field">
      <label>${t("tool.regex.testString")}</label>
      <div class="output-box regex-highlight" id="rxHighlight"></div>
    </div>
  `;

  function run() {
    const pattern = c.querySelector("#rxPattern").value;
    let flags = c.querySelector("#rxFlags").value;
    const text = c.querySelector("#rxText").value;
    const status = c.querySelector("#rxStatus");
    const highlight = c.querySelector("#rxHighlight");

    if (!pattern) {
      status.textContent = "";
      highlight.innerHTML = escapeHtml(text);
      return;
    }
    try {
      if (!flags.includes("g")) flags += "g";
      const re = new RegExp(pattern, flags);
      const matches = [...text.matchAll(re)];
      status.innerHTML = matches.length
        ? `<span class="badge success">${t("tool.regex.matches", { count: matches.length })}</span>`
        : `<span class="badge warning">${t("tool.regex.noMatches")}</span>`;

      let html = "";
      let lastIndex = 0;
      matches.forEach((m) => {
        html += escapeHtml(text.slice(lastIndex, m.index));
        html += `<mark>${escapeHtml(m[0])}</mark>`;
        lastIndex = m.index + m[0].length;
      });
      html += escapeHtml(text.slice(lastIndex));
      highlight.innerHTML = html || escapeHtml(text);
    } catch (err) {
      status.innerHTML = `<span class="badge danger">${t("tool.regex.invalid", { error: err.message })}</span>`;
      highlight.innerHTML = escapeHtml(text);
    }
  }

  c.querySelector("#rxPattern").addEventListener("input", debounce(run, 150));
  c.querySelector("#rxFlags").addEventListener("input", debounce(run, 150));
  c.querySelector("#rxText").addEventListener("input", debounce(run, 150));
};

/* ---------- 31. REST API Tester ---------- */
RENDERERS.apiTester = (c) => {
  c.innerHTML = `
    <div class="url-row">
      <select class="method-select" id="atMethod">
        <option>GET</option>
        <option>POST</option>
        <option>PUT</option>
        <option>PATCH</option>
        <option>DELETE</option>
      </select>
      <input type="url" id="atUrl" placeholder="https://api.example.com/resource" />
    </div>
    <div class="field">
      <label>${t("tool.apiTester.headers")}</label>
      <textarea id="atHeaders" style="min-height:70px;" placeholder="Content-Type: application/json"></textarea>
    </div>
    <div class="field" id="atBodyField">
      <label>${t("tool.apiTester.body")}</label>
      <textarea id="atBody" style="min-height:100px;" placeholder='{"key":"value"}'></textarea>
    </div>
    <p class="hint">${t("tool.apiTester.corsHint")}</p>
    <div class="btn-row"><button class="btn primary" id="atSend">${t("action.send")}</button></div>
    <div class="field">
      <div class="stat-row" id="atMeta"></div>
    </div>
    <div class="field">
      <label>${t("tool.apiTester.response")}</label>
      <div class="output-box" id="atOutput"></div>
    </div>
  `;

  function toggleBody() {
    const method = c.querySelector("#atMethod").value;
    c.querySelector("#atBodyField").style.display = method === "GET" || method === "DELETE" ? "none" : "flex";
  }
  c.querySelector("#atMethod").addEventListener("change", toggleBody);
  toggleBody();

  c.querySelector("#atSend").addEventListener("click", async () => {
    const method = c.querySelector("#atMethod").value;
    const url = c.querySelector("#atUrl").value.trim();
    const headersRaw = c.querySelector("#atHeaders").value;
    const bodyRaw = c.querySelector("#atBody").value;
    const output = c.querySelector("#atOutput");
    const meta = c.querySelector("#atMeta");
    if (!url) return;

    const headers = {};
    headersRaw.split("\n").forEach((line) => {
      const idx = line.indexOf(":");
      if (idx > -1) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });

    output.textContent = t("tool.apiTester.sending");
    output.classList.remove("error");
    meta.innerHTML = "";
    const started = performance.now();

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: method === "GET" || method === "DELETE" ? undefined : bodyRaw || undefined
      });
      const elapsed = Math.round(performance.now() - started);
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { /* not json, leave as-is */ }

      meta.innerHTML = `
        <div class="stat-box"><strong>${res.status}</strong><span>${t("tool.apiTester.status")}</span></div>
        <div class="stat-box"><strong>${elapsed}ms</strong><span>${t("tool.apiTester.time")}</span></div>
      `;
      output.textContent = pretty;
    } catch (err) {
      output.textContent = t("tool.apiTester.error", { error: err.message });
      output.classList.add("error");
    }
  });
};

/* ===========================================================
   INIT
   =========================================================== */
function init() {
  document.documentElement.lang = state.lang;
  applyTranslations();
  document.getElementById("langButton").textContent = state.lang.toUpperCase();
  document.querySelectorAll(".language-button[data-lang]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-lang") === state.lang);
  });

  renderSidebarCategories();
  renderCategoryChips();
  renderGrid();
  renderFavorites();

  document.getElementById("menuButton").addEventListener("click", openSidebar);
  document.getElementById("sidebarClose").addEventListener("click", closeSidebar);
  document.getElementById("overlay").addEventListener("click", () => {
    closeSidebar();
    closeTool();
  });
  document.getElementById("toolPanelClose").addEventListener("click", closeTool);

  document.getElementById("langButton").addEventListener("click", () => {
    setLanguage(state.lang === "en" ? "hu" : "en");
  });
  document.querySelectorAll(".language-button[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => setLanguage(btn.getAttribute("data-lang")));
  });

  document.getElementById("searchInput").addEventListener(
    "input",
    debounce((e) => {
      state.query = e.target.value.trim();
      renderGrid();
    }, 150)
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeTool();
      closeSidebar();
    }
  });

  registerServiceWorker();
  setupInstallPrompt();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("SW registration failed", err));
    });
  }
}

function setupInstallPrompt() {
  let deferredPrompt = null;
  const installGroup = document.getElementById("installGroup");
  const installButton = document.getElementById("installButton");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installGroup.classList.remove("hidden");
  });

  installButton.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installGroup.classList.add("hidden");
  });

  window.addEventListener("appinstalled", () => {
    installGroup.classList.add("hidden");
  });
}

document.addEventListener("DOMContentLoaded", init);
