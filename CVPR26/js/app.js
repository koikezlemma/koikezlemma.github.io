// CVPR 2026 Guide — vanilla JS SPA with hash routing
// Data is fetched from data/program.json + data/themes.json at startup.

const STORE_KEY = "cvpr26-plan-v1";
const DATA_PATHS = {
  program: "data/program.json",
  themes: "data/themes.json",
};

const DAY_META = {
  friday:   { label: "金 June 5", title: "金曜 6/5 (Day 1)" },
  saturday: { label: "土 June 6", title: "土曜 6/6 (Day 2)" },
  sunday:   { label: "日 June 7", title: "日曜 6/7 (Day 3)" },
};

const DAY_KEYS_BY_NAME = {
  "Friday, June 5": "friday",
  "Saturday, June 6": "saturday",
  "Sunday, June 7": "sunday",
};

// ---------- state ----------
const state = {
  program: null,
  themes: null,
  plan: loadPlan(),
};

function loadPlan() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function savePlan() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...state.plan]));
  } catch {
    // ignore quota errors
  }
}

function togglePlan(sessionId) {
  if (state.plan.has(sessionId)) state.plan.delete(sessionId);
  else state.plan.add(sessionId);
  savePlan();
}

// ---------- data helpers ----------
async function loadData() {
  const [program, themes] = await Promise.all([
    fetch(DATA_PATHS.program).then((r) => r.ok ? r.json() : null),
    fetch(DATA_PATHS.themes).then((r) => r.ok ? r.json() : null),
  ]);
  state.program = program;
  state.themes = themes;
}

function findSession(sessionId) {
  if (!state.program) return null;
  for (const day of state.program.days || []) {
    if (day.oral_sessions && day.oral_sessions[sessionId]) {
      return { day, session: day.oral_sessions[sessionId], kind: "oral" };
    }
    if (day.poster_sessions && day.poster_sessions[sessionId]) {
      return { day, session: day.poster_sessions[sessionId], kind: "poster" };
    }
  }
  return null;
}

function dayKey(day) {
  return DAY_KEYS_BY_NAME[day.name] || day.name.toLowerCase().split(",")[0].trim();
}

function dayByKey(key) {
  if (!state.program) return null;
  for (const day of state.program.days || []) {
    if (dayKey(day) === key) return day;
  }
  return null;
}

function themeForSession(sessionId) {
  if (!state.themes) return [];
  const found = [];
  for (const t of state.themes.themes || []) {
    const inSession = (t.related_papers || []).some(
      (p) => p.session_id === sessionId
    );
    if (inSession) found.push(t);
  }
  return found;
}

function papersForThemeInSession(themeId, sessionId) {
  const t = (state.themes?.themes || []).find((x) => x.id === themeId);
  if (!t) return [];
  return (t.related_papers || []).filter((p) => p.session_id === sessionId);
}

function getPaperSummary(paperKey) {
  return state.themes?.summaries?.[paperKey] || null;
}

function getRelatedPaperByKey(paperKey) {
  for (const t of state.themes?.themes || []) {
    const p = (t.related_papers || []).find((rp) => rp.key === paperKey);
    if (p) return { theme: t, paper: p };
  }
  // Award-candidate papers (no theme association, but may have summary)
  for (const dayKey of ["friday", "saturday", "sunday"]) {
    const list = state.themes?.awards?.[dayKey] || [];
    const p = list.find((ap) => ap.key === paperKey);
    if (p) return { theme: AWARD_PSEUDO_THEME, paper: { ...p, day: DAY_META[dayKey]?.title } };
  }
  return null;
}

const AWARD_PSEUDO_THEME = {
  id: "award",
  name: "Award 候補論文",
  short_name: "Award",
  color: "#d4a017",
  bg: "#fbf4dc",
};

// ---------- router ----------
const router = {
  routes: [
    { re: /^\/?$/, handler: () => renderHome() },
    { re: /^\/day\/(friday|saturday|sunday)$/, handler: (m) => renderDay(m[1]) },
    { re: /^\/session\/([\w\-]+)$/, handler: (m) => renderSession(m[1]) },
    { re: /^\/themes$/, handler: () => renderThemes() },
    { re: /^\/awards$/, handler: () => renderAwards("friday") },
    { re: /^\/awards\/(friday|saturday|sunday)$/, handler: (m) => renderAwards(m[1]) },
    { re: /^\/paper\/([\w\-]+)$/, handler: (m) => renderPaperDetail(m[1]) },
  ],
  dispatch() {
    const hash = window.location.hash.slice(1) || "/";
    for (const r of this.routes) {
      const m = hash.match(r.re);
      if (m) {
        r.handler(m);
        window.scrollTo(0, 0);
        updateActiveNav(hash);
        return;
      }
    }
    renderHome();
  },
};

function updateActiveNav(hash) {
  document.querySelectorAll("#dayNav a").forEach((a) => {
    a.classList.toggle("is-active", hash.startsWith(a.getAttribute("href").slice(1)));
  });
}

window.addEventListener("hashchange", () => router.dispatch());

// ---------- rendering ----------
const $app = () => document.getElementById("app");

function tpl(id) {
  const t = document.getElementById(id);
  return t.content.firstElementChild.cloneNode(true);
}

function renderHome() {
  // default: pick the conference day matching today, else Friday
  const today = new Date();
  const yyyymmdd = today.toISOString().slice(0, 10);
  let defaultKey = "friday";
  for (const day of state.program?.days || []) {
    if (day.date === yyyymmdd) { defaultKey = dayKey(day); break; }
  }
  renderDay(defaultKey);
}

function renderDay(dayKeyStr) {
  const day = dayByKey(dayKeyStr);
  if (!day) {
    $app().innerHTML = `<p>該当する日が見つかりません: ${dayKeyStr}</p>`;
    return;
  }
  const node = tpl("tpl-day");
  node.querySelector(".day-view__title").textContent = DAY_META[dayKeyStr]?.title || day.name;
  node.querySelector(".day-view__sub").textContent = `${day.name}`;

  // theme legend
  const legend = node.querySelector("#themeLegend");
  for (const t of state.themes?.themes || []) {
    const a = document.createElement("a");
    a.className = "theme-legend__chip";
    a.style.setProperty("--chip-color", t.color);
    a.style.setProperty("--chip-bg", t.bg);
    a.href = "#/themes";
    a.innerHTML = `<span class="dot"></span>${escapeHtml(t.short_name)}`;
    legend.appendChild(a);
  }

  const timeline = node.querySelector("#timeline");
  for (const block of day.schedule || []) {
    const li = tpl("tpl-timeline-block");
    li.querySelector(".tl-time").textContent = block.time;
    const slots = li.querySelector(".tl-sessions");
    const sessionIds = block.session_ids || (block.session_id ? [block.session_id] : []);
    if (sessionIds.length === 0) {
      // non-paper block (Breakfast, Keynote etc.)
      slots.appendChild(renderNonPaperBlock(block));
    } else {
      for (const sid of sessionIds) {
        const found = findSession(sid);
        if (!found) {
          const stub = document.createElement("div");
          stub.className = "sess-card sess-card--non-paper";
          stub.textContent = `${block.name || sid}`;
          slots.appendChild(stub);
          continue;
        }
        slots.appendChild(renderSessionCard(sid, found.session, found.kind, block));
      }
    }
    timeline.appendChild(li);
  }

  renderPlanSummary(node.querySelector("#myPlanSummary"));
  swap(node);
}

function renderNonPaperBlock(block) {
  const card = document.createElement("div");
  card.className = "sess-card sess-card--non-paper";
  card.innerHTML = `<header class="sess-card__hd"><h3 class="sess-card__name">${escapeHtml(block.name)}</h3></header>` +
    (block.room ? `<p class="sess-card__meta">${escapeHtml(block.room)}</p>` : "");
  return card;
}

function renderSessionCard(sessionId, session, kind, block) {
  const card = tpl("tpl-session-card");
  const link = card.querySelector(".sess-card__link");
  link.href = `#/session/${sessionId}`;

  const codeEl = card.querySelector(".sess-card__code");
  let code = session.code;
  if (!code) {
    if (sessionId.startsWith("oral-")) code = `Oral ${sessionId.replace("oral-", "")}`;
    else if (sessionId.startsWith("poster-")) code = `Poster ${sessionId.replace("poster-", "")}`;
    else if (sessionId.startsWith("findings-")) code = "Findings";
    else if (sessionId.startsWith("demos-")) code = "DEMOS";
    else code = sessionId;
  }
  codeEl.textContent = code;

  card.querySelector(".sess-card__name").textContent = session.name || sessionId;
  const meta = [];
  if (session.room || block.room) meta.push(session.room || block.room);
  if (session.time && session.time !== block.time) meta.push(session.time);
  card.querySelector(".sess-card__meta").textContent = meta.join(" · ");

  // theme badges
  const themesEl = card.querySelector(".sess-card__themes");
  const themes = themeForSession(sessionId);
  for (const t of themes) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "theme-badge";
    span.style.setProperty("--badge-color", t.color);
    span.style.setProperty("--badge-bg", t.bg);
    span.innerHTML = `<span class="dot"></span>${escapeHtml(t.short_name)}`;
    li.appendChild(span);
    themesEl.appendChild(li);
  }

  // count
  const n = (session.papers || []).length;
  card.querySelector(".sess-card__count").textContent = n ? `${n} 件` : "";

  // attending
  const attending = state.plan.has(sessionId);
  if (attending) card.classList.add("is-attending");
  const planBtn = card.querySelector(".sess-card__plan");
  planBtn.setAttribute("aria-pressed", attending ? "true" : "false");
  planBtn.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    togglePlan(sessionId);
    const nowAttending = state.plan.has(sessionId);
    card.classList.toggle("is-attending", nowAttending);
    planBtn.setAttribute("aria-pressed", nowAttending ? "true" : "false");
    // also update summary if visible
    const sumEl = document.getElementById("myPlanSummary");
    if (sumEl) renderPlanSummary(sumEl);
  });

  return card;
}

function renderPlanSummary(el) {
  el.innerHTML = "";
  if (state.plan.size === 0) {
    el.innerHTML = `<strong>聴講予定:</strong> まだ追加されていません。各セッション右上の「＋」を押すと予定に追加できます (ブラウザに保存されます)。`;
    return;
  }
  const list = [];
  for (const sid of state.plan) {
    const found = findSession(sid);
    if (!found) continue;
    list.push({ id: sid, session: found.session, day: found.day });
  }
  el.innerHTML = `<strong>聴講予定 (${list.length}):</strong> ` +
    list.map((x) => `<a href="#/session/${x.id}">${escapeHtml(x.session.name || x.id)}</a>`).join("、 ") +
    ` <button class="btn" style="margin-left:0.6rem;font-size:0.78rem;padding:0.2rem 0.6rem" type="button" id="clearPlanBtn">クリア</button>`;
  const btn = document.getElementById("clearPlanBtn");
  if (btn) btn.addEventListener("click", () => {
    if (confirm("全ての聴講予定をクリアしますか?")) {
      state.plan.clear(); savePlan(); router.dispatch();
    }
  });
}

function renderSession(sessionId) {
  const found = findSession(sessionId);
  if (!found) {
    $app().innerHTML = `<p>セッションが見つかりません: ${sessionId}</p><a href="#/" class="back-link">プログラムに戻る</a>`;
    return;
  }
  const node = tpl("tpl-session");
  const { day, session, kind } = found;
  const kindLabel = sessionId.startsWith("oral-") ? "Oral Session"
    : sessionId.startsWith("demos-") ? "DEMOS"
    : sessionId.startsWith("findings-") ? "Findings Posters"
    : "Poster Session";
  node.querySelector(".session-view__day").textContent = `${day.name} · ${kindLabel}`;
  node.querySelector(".session-view__title").textContent = session.name || sessionId;
  const metaParts = [];
  if (session.time) metaParts.push(session.time);
  if (session.room) metaParts.push(session.room);
  node.querySelector(".session-view__meta").textContent = metaParts.join(" · ");

  // attending button
  const attending = state.plan.has(sessionId);
  const planBtn = node.querySelector(".btn--plan");
  planBtn.setAttribute("aria-pressed", attending ? "true" : "false");
  planBtn.querySelector(".lbl").textContent = attending ? "聴講予定から外す" : "聴講予定に追加";
  planBtn.addEventListener("click", () => {
    togglePlan(sessionId);
    const nowAttending = state.plan.has(sessionId);
    planBtn.setAttribute("aria-pressed", nowAttending ? "true" : "false");
    planBtn.querySelector(".lbl").textContent = nowAttending ? "聴講予定から外す" : "聴講予定に追加";
  });

  // theme banner
  const banner = node.querySelector("#sessionThemeBanner");
  const themes = themeForSession(sessionId);
  if (themes.length > 0) {
    const t = themes[0];
    banner.style.setProperty("--banner-color", t.color);
    banner.style.setProperty("--banner-bg", t.bg);
    banner.innerHTML = `<div class="theme-banner__title">関連テーマ</div>` +
      `<ul>` + themes.map((tt) => {
        const rp = papersForThemeInSession(tt.id, sessionId);
        return `<li>${escapeHtml(tt.name)} — 関連論文 ${rp.length} 件</li>`;
      }).join("") + `</ul>`;
  }

  // paper list
  const listEl = node.querySelector("#paperList");
  const papers = session.papers || [];
  for (const p of papers) {
    const row = tpl("tpl-paper-row");
    const num = p.poster_id ?? p.oral_position ?? "";
    row.querySelector(".paper-row__no").textContent = num;
    row.querySelector(".paper-row__title").textContent = p.title || "(untitled)";
    row.querySelector(".paper-row__authors").textContent = (p.authors || []).join(", ");

    const badges = row.querySelector(".paper-row__badges");
    if (p.is_award_candidate) {
      const b = document.createElement("li");
      b.innerHTML = `<span class="badge-award">🏆 Award候補</span>`;
      badges.appendChild(b);
    }
    if (p.is_highlight) {
      const b = document.createElement("li");
      b.innerHTML = `<span class="badge-highlight">❉ Highlight</span>`;
      badges.appendChild(b);
    }

    // theme badge & detail link
    const matchedThemes = matchPaperToThemes(sessionId, p);
    if (matchedThemes.length > 0) {
      const t = matchedThemes[0].theme;
      row.classList.add("is-related");
      row.style.setProperty("--badge-color", t.color);
      row.style.setProperty("--badge-bg", t.bg);
      for (const m of matchedThemes) {
        const b = document.createElement("li");
        const span = document.createElement("span");
        span.className = "theme-badge";
        span.style.setProperty("--badge-color", m.theme.color);
        span.style.setProperty("--badge-bg", m.theme.bg);
        span.innerHTML = `<span class="dot"></span>${escapeHtml(m.theme.short_name)}`;
        b.appendChild(span);
        badges.appendChild(b);
      }
      const detailLink = row.querySelector(".paper-row__detail");
      const relKey = matchedThemes[0].paper.key;
      if (relKey && getPaperSummary(relKey)) {
        detailLink.href = `#/paper/${relKey}`;
        detailLink.hidden = false;
      }
    }
    // Award-candidate detail link (only if no theme already showed a link)
    if (p.is_award_candidate) {
      const detailLink = row.querySelector(".paper-row__detail");
      if (detailLink.hidden) {
        const award = findAwardByTitle(p.title);
        if (award && getPaperSummary(award.key)) {
          detailLink.href = `#/paper/${award.key}`;
          detailLink.hidden = false;
        }
      }
    }
    listEl.appendChild(row);
  }
  swap(node);
}

function findAwardByTitle(title) {
  if (!title) return null;
  const norm = title.toLowerCase().slice(0, 60).trim();
  for (const dayKey of ["friday", "saturday", "sunday"]) {
    const list = state.themes?.awards?.[dayKey] || [];
    const found = list.find((a) => (a.title || "").toLowerCase().slice(0, 60).trim() === norm);
    if (found) return found;
  }
  return null;
}

function matchPaperToThemes(sessionId, p) {
  const out = [];
  for (const t of state.themes?.themes || []) {
    for (const rp of t.related_papers || []) {
      if (rp.session_id !== sessionId) continue;
      const matchId = rp.poster_id ?? rp.oral_position;
      const pid = p.poster_id ?? p.oral_position;
      const titleMatch = rp.title && p.title && (rp.title.toLowerCase().slice(0, 40) === p.title.toLowerCase().slice(0, 40));
      if ((matchId != null && pid != null && matchId === pid) || titleMatch) {
        out.push({ theme: t, paper: rp });
      }
    }
  }
  return out;
}

function renderAwards(dayKeyStr) {
  const node = tpl("tpl-awards");
  // Highlight active day in the day nav
  node.querySelectorAll(".awards-day-nav a").forEach((a) => {
    if (a.getAttribute("href") === `#/awards/${dayKeyStr}`) {
      a.classList.add("is-active");
    }
  });

  const list = node.querySelector("#awardsList");
  const awards = state.themes?.awards?.[dayKeyStr] || [];
  if (awards.length === 0) {
    list.innerHTML = `<p style="color:var(--c-text-muted);font-size:var(--fs-sm)">該当する候補論文がありません。</p>`;
  }
  for (const ap of awards) {
    const row = tpl("tpl-award-row");
    row.querySelector(".award-row__title").textContent = ap.title;
    row.querySelector(".award-row__authors").textContent = (ap.authors || []).join(", ");

    const sessUl = row.querySelector(".award-row__sessions");
    for (const sid of ap.session_ids || []) {
      const found = findSession(sid);
      if (!found) continue;
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#/session/${sid}`;
      const label = sid.startsWith("oral-")
        ? `${found.session.code || sid.replace("oral-", "Oral ")}`
        : sid.startsWith("findings-") ? "Findings"
        : sid.startsWith("demos-") ? "DEMOS"
        : `Poster ${sid.replace("poster-", "")}`;
      a.textContent = `${label} · ${found.session.time || ""}`.trim();
      li.appendChild(a);
      sessUl.appendChild(li);
    }

    const detail = row.querySelector(".award-row__detail");
    if (getPaperSummary(ap.key)) {
      detail.href = `#/paper/${ap.key}`;
      detail.hidden = false;
    }
    list.appendChild(row);
  }
  swap(node);
}

function renderThemes() {
  const node = tpl("tpl-themes");
  const grid = node.querySelector("#themesGrid");
  for (const t of state.themes?.themes || []) {
    const card = tpl("tpl-theme-card");
    card.style.setProperty("--theme-color", t.color);
    card.style.setProperty("--theme-bg", t.bg);
    card.querySelector(".theme-card__chip").style.background = t.color;
    card.querySelector(".theme-card__name").textContent = t.name;
    card.querySelector(".theme-card__desc").textContent = t.description || "";
    const list = card.querySelector(".theme-card__papers");

    const sorted = [...(t.related_papers || [])].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    for (const rp of sorted) {
      const li = document.createElement("li");
      li.style.setProperty("--theme-bg", t.bg);
      const rating = "★".repeat(rp.rating || 0) + "☆".repeat(Math.max(0, 3 - (rp.rating || 0)));
      const summary = getPaperSummary(rp.key);
      const titleEl = summary
        ? `<a href="#/paper/${rp.key}">${escapeHtml(rp.title)}</a>`
        : escapeHtml(rp.title);
      const sessLink = `<a href="#/session/${rp.session_id}">${escapeHtml(sessionShortName(rp.session_id))}</a>`;
      li.innerHTML = `<div>${titleEl}</div>` +
        `<small><span class="rating">${rating}</span> · ${sessLink}${rp.day ? " · " + escapeHtml(rp.day) : ""}</small>`;
      list.appendChild(li);
    }
    grid.appendChild(card);
  }
  swap(node);
}

function sessionShortName(sid) {
  const found = findSession(sid);
  if (!found) return sid;
  return found.session.name || sid;
}

function renderPaperDetail(paperKey) {
  const summary = getPaperSummary(paperKey);
  const rel = getRelatedPaperByKey(paperKey);
  if (!summary || !rel) {
    $app().innerHTML = `<p>論文まとめが見つかりません: ${paperKey}</p><a href="#/" class="back-link">戻る</a>`;
    return;
  }
  const node = tpl("tpl-paper-detail");
  const { theme, paper } = rel;
  // For award papers, paper has session_ids[] instead of single session_id
  const primarySid = paper.session_id
    || paper.oral_session
    || paper.poster_session
    || (paper.session_ids && paper.session_ids[0]);

  const backLink = node.querySelector(".back-link");
  if (theme.id === "award") {
    const dayKey = paperKey.split("-")[1]; // "friday" | "saturday" | "sunday"
    backLink.href = `#/awards/${dayKey}`;
    backLink.textContent = `← Award 候補一覧へ戻る`;
  } else {
    backLink.href = `#/session/${primarySid}`;
    backLink.textContent = `← セッションへ戻る`;
  }

  const breadcrumb = node.querySelector(".paper-detail__breadcrumb");
  if (theme.id === "award") {
    breadcrumb.innerHTML = `<a href="#/awards">Award 候補</a> · <span style="color:${theme.color}">${escapeHtml(theme.short_name)}</span>`;
  } else {
    breadcrumb.innerHTML = `<a href="#/themes">関連テーマ</a> · <span style="color:${theme.color}">${escapeHtml(theme.short_name)}</span>`;
  }
  node.querySelector(".paper-detail__title").textContent = paper.title;
  node.querySelector(".paper-detail__authors").textContent = (paper.authors || []).join(", ");

  const meta = node.querySelector(".paper-detail__meta");
  const rating = "★".repeat(summary.rating || 0) + "☆".repeat(Math.max(0, 3 - (summary.rating || 0)));
  let sessLinks = "";
  if (paper.session_ids && paper.session_ids.length > 0) {
    sessLinks = paper.session_ids.map((sid) =>
      `<a href="#/session/${sid}">${escapeHtml(sessionShortName(sid))}</a>`
    ).join(" / ");
  } else if (primarySid) {
    sessLinks = `<a href="#/session/${primarySid}">${escapeHtml(sessionShortName(primarySid))}</a>`;
  }
  meta.innerHTML =
    `<span class="rating" style="font-weight:600">${rating}</span>` +
    ` <span class="theme-badge" style="--badge-color:${theme.color};--badge-bg:${theme.bg}"><span class="dot"></span>${escapeHtml(theme.short_name)}</span>` +
    (summary.arxiv_url ? ` <a href="${summary.arxiv_url}" target="_blank" rel="noopener">arXivで読む →</a>` : "") +
    ` ${sessLinks}`;

  const body = node.querySelector(".paper-detail__body");
  body.innerHTML = renderSummaryBody(summary);
  swap(node);
}

function renderSummaryBody(s) {
  const sec = (title, content) => content ? `<section><h2>${title}</h2>${formatBody(content)}</section>` : "";
  return [
    sec("1. 一言で", s.one_line),
    sec("2. 課題と背景", s.problem),
    sec("3. 主な成果物・コントリビューション", s.contribution),
    sec("4. 解決のアイデア", s.idea),
    sec("5. 代表的な図と概要", s.key_figures),
    sec("6. 評価方法と結果", s.evaluation),
    sec("7. 今後の課題", s.future_work),
    sec("8. 強く関連する先行研究", s.related_work),
    s.note ? `<section><h2>備考</h2><p style="color:var(--c-text-muted);font-size:var(--fs-sm)">${formatInline(s.note)}</p></section>` : "",
  ].join("");
}

function formatBody(content) {
  if (Array.isArray(content)) {
    return `<ul>${content.map((c) => `<li>${formatInline(c)}</li>`).join("")}</ul>`;
  }
  return `<p>${formatInline(String(content))}</p>`;
}

function formatInline(s) {
  // basic escape; allow [Fig X] markup
  const e = escapeHtml(s);
  return e;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function swap(node) {
  $app().innerHTML = "";
  $app().appendChild(node);
}

// ---------- boot ----------
(async function boot() {
  try {
    await loadData();
    if (!state.program) {
      $app().innerHTML = `<div class="loading">プログラムデータの読み込みに失敗しました。</div>`;
      return;
    }
    router.dispatch();
  } catch (e) {
    console.error(e);
    $app().innerHTML = `<div class="loading">エラー: ${e.message}</div>`;
  }
})();
