(function () {
  "use strict";

  const D = window.PATH_DATA;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TABS = ["path", "quiz", "progress", "resources", "about"];
  const STORE_KEY = "dsp:state:v1";

  // ---- storage with an in-memory fallback (blocked storage, private browsing) ----
  const storage = (() => {
    let mem = null;
    let ok = false;
    try {
      localStorage.setItem("dsp:probe", "1");
      localStorage.removeItem("dsp:probe");
      ok = true;
    } catch (e) { /* use memory */ }
    return {
      read() {
        try { return ok ? localStorage.getItem(STORE_KEY) : mem; } catch (e) { return mem; }
      },
      write(text) {
        if (ok) { try { localStorage.setItem(STORE_KEY, text); return; } catch (e) { ok = false; } }
        mem = text;
      },
      persistent() { return ok; },
    };
  })();

  function blankState() {
    return { v: 1, weeks: {}, quiz: {}, diagnostic: {}, confidence: {}, textStep: 0, theme: "light" };
  }
  function loadState() {
    try {
      const raw = storage.read();
      if (!raw) return blankState();
      const s = JSON.parse(raw);
      return s && s.v === 1 ? Object.assign(blankState(), s) : blankState();
    } catch (e) { return blankState(); }
  }
  let state = loadState();
  const save = () => storage.write(JSON.stringify(state));

  function weekState(n) {
    const w = D.weeks.find((x) => x.week === n);
    const cur = state.weeks[n] || { outcomes: [], lab: false };
    while (cur.outcomes.length < w.outcomes.length) cur.outcomes.push(false);
    state.weeks[n] = cur;
    return cur;
  }

  // ---- path tab ----
  const openWeeks = new Set([1]);

  function weekProgress(w) {
    const s = weekState(w.week);
    const done = s.outcomes.filter(Boolean).length + (s.lab ? 1 : 0);
    const total = w.outcomes.length + 1;
    return { done, total, complete: done === total };
  }

  function renderPath() {
    let done = 0, total = 0, weeksDone = 0;
    $("weeks").innerHTML = D.weeks.map((w) => {
      const p = weekProgress(w);
      done += p.done; total += p.total; weeksDone += p.complete ? 1 : 0;
      const s = weekState(w.week);
      const open = openWeeks.has(w.week);
      const res = D.resources.filter((r) => r.weeks.includes(w.week));
      const status = p.complete ? "done" : (p.done ? "started" : "");
      return `<article class="week ${status}" data-week="${w.week}">
        <span class="node" aria-hidden="true">${p.complete ? ICON.check : w.week}</span>
        <div class="wk">
        <button aria-expanded="${open}" aria-controls="wk-${w.week}">
          <span><span class="t">Week ${w.week}: ${esc(w.title)}</span><br><span class="meta">${esc(w.time)} &middot; ${p.done} of ${p.total} done${p.complete ? " &middot; complete" : ""}</span></span>
          <span class="chev" aria-hidden="true">&#9662;</span>
        </button>
        <div class="body" id="wk-${w.week}" ${open ? "" : "hidden"}>
          <div class="bar" aria-hidden="true"><i style="width:${Math.round(p.done / p.total * 100)}%"></i></div>
          <p>${esc(w.summary)}</p>
          <p class="note">I can&hellip;</p>
          ${w.outcomes.map((o, i) => `<label class="check"><input type="checkbox" data-kind="outcome" data-week="${w.week}" data-i="${i}" ${s.outcomes[i] ? "checked" : ""}><span>${esc(o)}</span></label>`).join("")}
          <div class="lab-row"><label class="check"><input type="checkbox" data-kind="lab" data-week="${w.week}" ${s.lab ? "checked" : ""}><span><strong>Lab done:</strong> ${esc(w.lab)}<br><span class="note">Instructions are in <code>${esc(w.labFolder)}</code> in the course repository.</span></span></label></div>
          ${res.length ? `<p class="note">Free resources for this week</p><ul class="links">${res.map((r) => `<li><a href="${esc(r.url)}" rel="noopener">${esc(r.title)}</a></li>`).join("")}</ul>` : ""}
        </div>
        </div>
      </article>`;
    }).join("");
    const pct = total ? Math.round(done / total * 100) : 0;
    $("ring-bar").style.strokeDashoffset = String(113.1 * (1 - pct / 100));
    $("ring-text").textContent = pct + "%";
    $("ring").setAttribute("aria-label", `Overall progress ${pct} percent`);
    $("path-summary").textContent = `${weeksDone} of ${D.weeks.length} weeks complete`;
    renderBadges(done, weeksDone);
  }

  const ICON = {
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-8-5-8-10.500A4.500 4.500 0 0 1 12 7a4.500 4.500 0 0 1 8 2.500C20 15 12 20 12 20z"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4m0 0h12l-2.500 4.500L17 13H5"/></svg>',
  };

  function renderBadges(ticks, weeksDone) {
    const quizAce = Object.values(state.quiz).some((q) => q && q.best === q.total);
    const checkedIn = Object.keys(state.confidence || {}).length > 0;
    const list = [
      ["First step", ICON.star, ticks > 0],
      ["Quiz ace", ICON.bolt, quizAce],
      ["Check-in", ICON.heart, checkedIn],
      ["Halfway", ICON.flag, weeksDone >= Math.ceil(D.weeks.length / 2)],
      ["Finisher", ICON.check, weeksDone === D.weeks.length],
    ];
    $("badges").innerHTML = list.map(([name, icon, got]) =>
      `<li class="badge ${got ? "earned" : ""}"><span class="b-shape" aria-hidden="true">${icon}</span>${name}<span class="b-state">${got ? "Earned" : "Not yet"}</span></li>`).join("");
  }

  // ---- quiz ----
  let run = null;

  function shuffle(a) {
    const out = a.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function renderQuizMenu() {
    $("quiz-weeks").innerHTML = D.weeks.map((w) => {
      const best = state.quiz[w.week];
      return `<button data-week="${w.week}"><strong>Week ${w.week}</strong><small>${esc(w.title)}</small><small>${best ? `Best ${best.best}/${best.total}` : "Not tried yet"}</small></button>`;
    }).join("");
    const parts = [];
    ["pre", "post"].forEach((st) => {
      const d = state.diagnostic[st];
      if (d) parts.push(`${st === "pre" ? "Start" : "End"}: ${d.score}/${d.total} (form ${d.form})`);
    });
    $("diag-summary").textContent = parts.length ? "Saved diagnostics - " + parts.join("; ") : "No diagnostic taken yet.";
  }

  function startQuiz(questions, meta) {
    run = { list: questions, i: 0, picked: [], checked: false, score: 0, meta };
    $("quiz-menu").hidden = true;
    $("quiz-run").hidden = false;
    renderQuestion();
  }

  function renderQuestion() {
    const q = run.list[run.i];
    const last = run.i === run.list.length - 1;
    $("quiz-run").innerHTML = `
      <article class="card">
        <div class="q-head"><span>${esc(run.meta.title)}</span><span>Question ${run.i + 1} of ${run.list.length}</span></div>
        <fieldset class="opts" id="opts">
          <legend class="q-text" id="q-text" tabindex="-1">${esc(q.question)}</legend>
          ${q.options.map((o, k) => `<label class="opt"><input type="radio" name="opt" value="${k}"><span>${esc(o)}</span></label>`).join("")}
        </fieldset>
        <div id="fb" role="status" aria-live="polite"></div>
        <div class="row">
          <button class="btn" id="q-check" disabled>Check answer</button>
          <button class="btn ghost" id="q-next" hidden>${last ? "See results" : "Next question"}</button>
          <button class="btn ghost" id="q-quit">Stop</button>
        </div>
      </article>`;
    $("q-text").focus({ preventScroll: true });
  }

  function checkAnswer() {
    const q = run.list[run.i];
    const chosen = document.querySelector("#opts input:checked");
    if (!chosen) return;
    const k = Number(chosen.value);
    const right = k === q.answer;
    run.picked[run.i] = k;
    if (right) run.score++;
    document.querySelectorAll("#opts .opt").forEach((el, idx) => {
      el.classList.toggle("right", idx === q.answer);
      el.classList.toggle("wrong", idx === k && !right);
      el.querySelector("input").disabled = true;
    });
    $("fb").innerHTML = `<div class="feedback ${right ? "good" : "bad"}"><strong>${right ? "Correct." : "Not quite."}</strong> ${right ? "" : "The answer is: " + esc(q.options[q.answer]) + ". "}${esc(q.explanation)}</div>`;
    $("q-check").hidden = true;
    $("q-next").hidden = false;
    $("q-next").focus();
  }

  function finishQuiz() {
    const total = run.list.length;
    const { meta, score } = run;
    const date = new Date().toISOString().slice(0, 10);
    let saved = "";
    if (meta.kind === "week") {
      const prev = state.quiz[meta.week] || { best: 0, attempts: 0 };
      state.quiz[meta.week] = { best: Math.max(prev.best, score), total, last: date, attempts: prev.attempts + 1 };
      saved = "Saved to your progress.";
    } else if (meta.kind === "diagnostic") {
      state.diagnostic[meta.stage] = { form: meta.form, score, total, date };
      saved = `Saved as your ${meta.stage === "pre" ? "start" : "end"}-of-course diagnostic.`;
    }
    save();
    const missed = run.list.map((q, i) => ({ q, i })).filter((x) => run.picked[x.i] !== x.q.answer);
    $("quiz-run").innerHTML = `
      <article class="card" tabindex="-1" id="result">
        <h3>${esc(meta.title)}</h3>
        <p class="result-big">${score} / ${total}</p>
        <p class="note">${saved}</p>
        ${missed.length ? `<h3>Worth another look</h3><ul>${missed.map((x) => `<li><strong>${esc(x.q.question)}</strong><br>${esc(x.q.options[x.q.answer])}. ${esc(x.q.explanation)}</li>`).join("")}</ul>` : "<p>You answered everything correctly.</p>"}
        <div class="row"><button class="btn" id="q-back">Back to practice</button></div>
      </article>`;
    $("result").focus({ preventScroll: true });
  }

  function exitQuiz() {
    run = null;
    $("quiz-run").hidden = true;
    $("quiz-menu").hidden = false;
    renderQuizMenu();
  }

  // ---- progress tab ----
  function renderConfidenceForm() {
    const stage = $("conf-stage").value;
    const saved = (state.confidence[stage] || {}).ratings || {};
    $("conf-form").innerHTML = D.confidenceItems.map((it) => `
      <fieldset class="conf-item"><legend>${esc(it.text)}</legend>
        <div class="scale">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${it.id}" value="${n}" ${saved[it.id] === n ? "checked" : ""}><span>${n}</span></label>`).join("")}</div>
      </fieldset>`).join("");
  }

  function renderConfidenceChart() {
    const pre = (state.confidence.pre || {}).ratings;
    const post = (state.confidence.post || {}).ratings;
    if (!pre && !post) { $("conf-chart").innerHTML = ""; return; }
    const mean = (r) => r ? Object.values(r).reduce((a, b) => a + b, 0) / Object.values(r).length : null;
    const m1 = mean(pre), m2 = mean(post);
    const rows = D.confidenceItems.map((it) => {
      const a = pre && pre[it.id], b = post && post[it.id];
      return `<div class="hbar"><span>${esc(it.text)}</span><div class="track" aria-hidden="true">${a ? `<i class="pre" style="width:${a * 20}%"></i>` : ""}${b ? `<i class="post" style="width:${b * 20}%"></i>` : ""}</div><span class="note">Start: ${a || "-"} &middot; End: ${b || "-"}</span></div>`;
    }).join("");
    const change = m1 != null && m2 != null ? ` Average change: ${(m2 - m1 >= 0 ? "+" : "") + (m2 - m1).toFixed(1)}.` : "";
    $("conf-chart").innerHTML = `<h3>Your confidence</h3><p class="legend"><span><b style="background:var(--gold)"></b>Start${m1 != null ? " (avg " + m1.toFixed(1) + ")" : ""}</span><span><b style="background:var(--teal-2)"></b>End${m2 != null ? " (avg " + m2.toFixed(1) + ")" : ""}</span></p>${rows}<p class="note">${change.trim()} This is your own view of your confidence, which is useful but not a test.</p>`;
  }

  function renderScores() {
    const rows = D.weeks.map((w) => {
      const q = state.quiz[w.week];
      return `<tr><td>Week ${w.week}</td><td>${q ? `${q.best}/${q.total}` : "-"}</td><td>${q ? q.attempts : 0}</td></tr>`;
    }).join("");
    const diag = ["pre", "post"].map((s) => {
      const d = state.diagnostic[s];
      return `<tr><td>Diagnostic, ${s === "pre" ? "start" : "end"}</td><td>${d ? `${d.score}/${d.total}` : "-"}</td><td>${d ? "form " + d.form : ""}</td></tr>`;
    }).join("");
    $("quiz-scores").innerHTML = `<table class="scores"><thead><tr><th>Quiz</th><th>Best score</th><th>Attempts</th></tr></thead><tbody>${rows}${diag}</tbody></table>`;
  }

  function renderProgressTab() {
    renderConfidenceForm();
    renderConfidenceChart();
    renderScores();
  }

  function saveConfidence() {
    const stage = $("conf-stage").value;
    const ratings = {};
    D.confidenceItems.forEach((it) => {
      const c = document.querySelector(`#conf-form input[name="${it.id}"]:checked`);
      if (c) ratings[it.id] = Number(c.value);
    });
    if (Object.keys(ratings).length < D.confidenceItems.length) {
      $("data-msg").textContent = "Please rate every statement before saving.";
      return;
    }
    state.confidence[stage] = { ratings, date: new Date().toISOString().slice(0, 10) };
    save();
    renderConfidenceChart();
    $("data-msg").textContent = "Check-in saved.";
  }

  function exportData() {
    const text = JSON.stringify(state, null, 2);
    try {
      const blob = new Blob([text], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "skills-path-progress.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { /* the text box below is the fallback */ }
    $("data-msg").innerHTML = "Export started. If nothing downloaded, copy the text below and keep it somewhere safe.<br><textarea readonly rows=\"5\" style=\"width:100%\"></textarea>";
    $("data-msg").querySelector("textarea").value = text;
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = JSON.parse(reader.result);
        if (!s || s.v !== 1 || typeof s.weeks !== "object") throw new Error("not a progress file");
        state = Object.assign(blankState(), s);
        save();
        renderAll();
        $("data-msg").textContent = "Progress imported.";
      } catch (e) {
        $("data-msg").textContent = "That file is not a valid progress export, so nothing was changed.";
      }
    };
    reader.readAsText(file);
  }

  // ---- resources ----
  function renderResources() {
    const sel = $("res-week");
    if (!sel.options.length) {
      sel.innerHTML = '<option value="all">All weeks</option>' + D.weeks.map((w) => `<option value="${w.week}">Week ${w.week}: ${esc(w.title)}</option>`).join("") + '<option value="0">General</option>';
    }
    const v = sel.value;
    const list = D.resources.filter((r) => v === "all" || (v === "0" ? r.weeks.length === 0 : r.weeks.includes(Number(v))));
    $("res-note").textContent = `${D.resourcesNote} Last checked ${D.resourcesChecked}.`;
    renderContext();
    $("res-list").innerHTML = list.map((r) => `<div class="res"><a href="${esc(r.url)}" rel="noopener"><strong>${esc(r.title)}</strong></a><div class="tag">${esc(r.provider)} &middot; ${esc(r.level)} &middot; ${esc(r.cost)}</div><div>${esc(r.notes)}</div></div>`).join("");
  }

  function renderContext() {
    const C = D.context;
    const when = new Date(C.compiled_on + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    $("context-note").textContent = `${C.latest_year_note} Compiled ${when}.`;
    $("context-list").innerHTML = C.stats.map((s) => `<article class="stat"><div class="stat-v">${esc(s.value)}</div><div class="stat-b"><p>${esc(s.indicator)}</p><p class="tag">${esc(s.group)} &middot; ${esc(s.period)}</p><p class="note"><a href="${esc(s.url)}" rel="noopener">${esc(s.publisher)}</a>, published ${esc(s.published)}, accessed ${esc(s.accessed_on)}.</p><p class="note"><strong>Limit:</strong> ${esc(s.caveat)}</p></div></article>`).join("");
  }

  // ---- about / install / text size ----
  function applyTextStep() {
    const step = Math.max(-1, Math.min(3, state.textStep || 0));
    document.documentElement.style.setProperty("--scale", String(1 + step * 0.125));
  }

  function applyTheme() {
    const t = ["light", "dark", "auto"].includes(state.theme) ? state.theme : "light";
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    const dark = t === "dark" || (t === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (meta) meta.setAttribute("content", dark ? "#0c1f1f" : "#2ec4b6");
    if ($("theme-select")) $("theme-select").value = t;
  }

  function renderAbout() {
    $("build-note").textContent = `Reading list last checked ${D.resourcesChecked}. Progress is stored ${storage.persistent() ? "in this browser" : "in memory only because browser storage is blocked, so export it before closing"}.`;
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    let html;
    if (standalone) html = "<p>You are using the installed app.</p>";
    else if (ios) html = "<p>On iPhone or iPad, open this page in <strong>Safari</strong>, tap the Share button, then choose <strong>Add to Home Screen</strong>.</p>";
    else html = "<p>On Android with Chrome, use the <strong>Install app</strong> button when it appears, or open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>";
    $("install-help").innerHTML = html + '<p class="note">After installing, the app opens offline.</p>';
  }

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("install-btn").hidden = false;
  });

  // ---- wiring ----
  function setTab(name) {
    if (!TABS.includes(name)) name = "path";
    TABS.forEach((t) => { $("tab-" + t).hidden = t !== name; });
    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    if (name === "path") renderPath();
    if (name === "quiz" && !run) renderQuizMenu();
    if (name === "progress") renderProgressTab();
    if (name === "resources") renderResources();
    if (history.replaceState) history.replaceState(null, "", "#" + name);
    window.scrollTo(0, 0);
  }

  function currentTab() {
    const t = TABS.find((x) => !$("tab-" + x).hidden);
    return t || "path";
  }

  function renderAll() {
    applyTextStep();
    applyTheme();
    setTab(currentTab());
  }

  function init() {
    $("tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setTab(b.dataset.tab); });

    $("weeks").addEventListener("click", (e) => {
      const head = e.target.closest(".week .wk > button");
      if (!head) return;
      const n = Number(head.closest(".week").dataset.week);
      if (openWeeks.has(n)) openWeeks.delete(n); else openWeeks.add(n);
      renderPath();
      const again = document.querySelector(`.week[data-week="${n}"] .wk > button`);
      if (again) again.focus();
    });
    $("weeks").addEventListener("change", (e) => {
      const el = e.target;
      if (el.type !== "checkbox") return;
      const n = Number(el.dataset.week);
      const s = weekState(n);
      if (el.dataset.kind === "lab") s.lab = el.checked; else s.outcomes[Number(el.dataset.i)] = el.checked;
      save();
      renderPath();
      const again = document.querySelector(`input[data-kind="${el.dataset.kind}"][data-week="${n}"]${el.dataset.i !== undefined ? `[data-i="${el.dataset.i}"]` : ""}`);
      if (again) again.focus();
    });

    $("quiz-weeks").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-week]");
      if (!b) return;
      const n = Number(b.dataset.week);
      const w = D.weeks.find((x) => x.week === n);
      startQuiz(shuffle(D.questions.filter((q) => q.week === n)), { kind: "week", week: n, title: `Week ${n}: ${w.title}` });
    });
    $("quiz-mixed").addEventListener("click", () => startQuiz(shuffle(D.questions).slice(0, 10), { kind: "mixed", title: "Mixed review" }));
    document.querySelectorAll("[data-form]").forEach((b) => b.addEventListener("click", () => {
      const form = b.dataset.form;
      const stage = $("diag-stage").value;
      startQuiz(D.questions.filter((q) => q.form === form), { kind: "diagnostic", form, stage, title: `Diagnostic, form ${form}` });
    }));
    $("quiz-run").addEventListener("change", (e) => { if (e.target.name === "opt") $("q-check").disabled = false; });
    $("quiz-run").addEventListener("click", (e) => {
      const id = e.target.id;
      if (id === "q-check") checkAnswer();
      else if (id === "q-next") { if (run.i === run.list.length - 1) finishQuiz(); else { run.i++; renderQuestion(); } }
      else if (id === "q-quit" || id === "q-back") exitQuiz();
    });

    $("conf-stage").addEventListener("change", renderConfidenceForm);
    $("conf-save").addEventListener("click", saveConfidence);
    $("export-btn").addEventListener("click", exportData);
    $("import-file").addEventListener("change", (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ""; });
    $("reset-btn").addEventListener("click", () => {
      if (window.confirm("This deletes your ticks, quiz scores and check-ins from this device. Continue?")) {
        state = blankState();
        save();
        renderAll();
        $("data-msg").textContent = "Everything was reset.";
      }
    });
    $("res-week").addEventListener("change", renderResources);
    $("theme-select").addEventListener("change", (e) => { state.theme = e.target.value; save(); applyTheme(); });
    $("text-up").addEventListener("click", () => { state.textStep = Math.min(3, (state.textStep || 0) + 1); save(); applyTextStep(); });
    $("text-down").addEventListener("click", () => { state.textStep = Math.max(-1, (state.textStep || 0) - 1); save(); applyTextStep(); });
    $("install-btn").addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $("install-btn").hidden = true;
    });

    window.addEventListener("hashchange", () => {
      const h = location.hash.replace("#", "");
      if (TABS.includes(h) && h !== currentTab()) setTab(h);
    });

    renderAbout();
    applyTextStep();
    applyTheme();
    const h = location.hash.replace("#", "");
    setTab(TABS.includes(h) ? h : "path");
  }

  init();

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
