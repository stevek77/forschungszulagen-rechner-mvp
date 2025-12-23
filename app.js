/* Förder-Kompass Forschungszulagen-Rechner (MVP)
   - Multi-Year: 2022–2025 + Folgejahre
   - PDF via jsPDF
   - Lead Capture via Netlify Forms (hidden form)
   - NEU ab 2026: Gemeinkosten-/Projektpauschale +20% auf förderfähige FuE-Kosten
*/

(() => {
  // ========= Helpers =========
  const fmtEUR = (n) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(Math.max(0, Math.round(n || 0)));

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const $ = (id) => document.getElementById(id);

  // ========= Regel-Engine (MVP) =========
  // Vereinfachte Sätze (wie zuvor in deinem MVP):
  // - Personal/AfA: KMU 35%, Groß 25%
  // - Extern: KMU 24,5%, Groß 15%
  // Deckelung (MVP): max. 10.000.000 € Bemessungsgrundlage/Jahr
  // NEU ab 2026: +20% Pauschale auf förderfähige Kosten (P+E+AfA) => erhöht Bemessungsgrundlage
  const RATE = {
    KMU: { personnel: 0.35, external: 0.245, depr: 0.35 },
    GU: { personnel: 0.25, external: 0.15, depr: 0.25 },
  };
  const MAX_BASE_PER_YEAR = 10_000_000;
  const OVERHEAD_FROM_YEAR = 2026;
  const OVERHEAD_RATE = 0.20;

  // Jahr-Rahmen: rückwirkend ab 2022 + bis (aktuelles Jahr + 10)
  const NOW = new Date();
  const CURRENT_YEAR = NOW.getFullYear();
  const MIN_YEAR = 2022;
  const MAX_YEAR = CURRENT_YEAR + 10;

  // Default: aktuelles Jahr (falls < 2022, dann 2022)
  const defaultYear = Math.max(CURRENT_YEAR, MIN_YEAR);

  let state = {
    size: "KMU", // "KMU" | "GU"
    years: [defaultYear],
    activeYear: defaultYear,
    byYear: {},
    intro: {
      startedAfter2020: "",
      taxableDE: "",
      hasTimeline: "",
      isNovel: "",
      isRisky: "",
      hasUncertainty: "",
    },
  };

  function defaultYearData() {
    return {
      staffCount: 1,
      salary: 60000,
      fueShare: 50,
      totalPersonnelOverride: "",
      externalCost: 0,
      deprCost: 0,
    };
  }

  // ========= UI Elements =========
  const yearTabs = $("yearTabs");
  const addYearBtn = $("addYearBtn");
  const removeYearBtn = $("removeYearBtn"); // optional
  const yearSelect = $("yearSelect");

  const btnKMU = $("btnKMU");
  const btnGU = $("btnGU");

  const staffCount = $("staffCount");
  const salary = $("salary");
  const fueShare = $("fueShare");
  const totalPersonnelOverride = $("totalPersonnelOverride");
  const externalCost = $("externalCost");
  const deprCost = $("deprCost");

  // Results
  const resultAmount = $("resultAmount");
  const metaYears = $("metaYears");
  const metaRate = $("metaRate");
  const metaBasis = $("metaBasis");

  const basisPersonnel = $("basisPersonnel");
  const basisExternal = $("basisExternal");
  const basisDepr = $("basisDepr");
  const basisOverhead = $("basisOverhead"); // NEU (optional in HTML)
  const basisTotal = $("basisTotal");

  const openLeadBtn = $("openLeadBtn");
  const downloadPdfBtn = $("downloadPdfBtn");

  // Modal
  const modalBackdrop = $("modalBackdrop");
  const closeModalBtn = $("closeModalBtn");
  const leadEmail = $("leadEmail");
  const leadName = $("leadName");
  const leadCompany = $("leadCompany");
  const submitLeadBtn = $("submitLeadBtn");
  const leadSuccess = $("leadSuccess");

  // Netlify hidden form
  const hiddenForm = document.querySelector('form[name="lead-forschungszulage-rechner"]');

  // Optional: Einstiegsfragen (falls du später Inputs mit diesen IDs einbaust)
  const introEls = {
    startedAfter2020: $("qStartedAfter2020"),
    taxableDE: $("qTaxableDE"),
    hasTimeline: $("qHasTimeline"),
    isNovel: $("qIsNovel"),
    isRisky: $("qIsRisky"),
    hasUncertainty: $("qHasUncertainty"),
  };

  // ========= Safety checks =========
  const required = [
    yearTabs, addYearBtn, yearSelect,
    btnKMU, btnGU,
    staffCount, salary, fueShare, totalPersonnelOverride, externalCost, deprCost,
    resultAmount, metaYears, metaRate, metaBasis,
    basisPersonnel, basisExternal, basisDepr, basisTotal,
    openLeadBtn, downloadPdfBtn,
    modalBackdrop, closeModalBtn, leadEmail, leadName, leadCompany, submitLeadBtn, leadSuccess,
    hiddenForm
  ];

  if (required.some((el) => !el)) {
    console.warn("Einige benötigte Elemente fehlen. Prüfe deine index.html IDs.");
  }

  // ========= State helpers =========
  function ensureYear(y) {
    if (!state.byYear[y]) state.byYear[y] = defaultYearData();
  }

  function normalizeYears() {
    state.years = Array.from(new Set(state.years))
      .map((y) => Number(y))
      .filter((y) => y >= MIN_YEAR && y <= MAX_YEAR)
      .sort((a, b) => a - b);

    if (!state.years.length) state.years = [defaultYear];

    if (!state.years.includes(state.activeYear)) {
      state.activeYear = state.years[state.years.length - 1];
    }
    state.years.forEach(ensureYear);
  }

  // ========= Render =========
  function renderYears() {
    normalizeYears();

    // Tabs
    yearTabs.innerHTML = "";
    state.years.forEach((y) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tab";
      b.textContent = String(y);
      b.setAttribute("aria-pressed", String(y === state.activeYear));
      b.addEventListener("click", () => {
        state.activeYear = y;
        syncInputsFromState();
        renderYears();
        computeAndRender();
      });
      yearTabs.appendChild(b);
    });

    // Select
    yearSelect.innerHTML = "";
    state.years.forEach((y) => {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      if (y === state.activeYear) opt.selected = true;
      yearSelect.appendChild(opt);
    });
  }

  function syncInputsFromState() {
    const y = state.activeYear;
    ensureYear(y);
    const d = state.byYear[y];

    staffCount.value = d.staffCount;
    salary.value = d.salary;
    fueShare.value = d.fueShare;
    totalPersonnelOverride.value = d.totalPersonnelOverride;
    externalCost.value = d.externalCost;
    deprCost.value = d.deprCost;

    btnKMU.setAttribute("aria-pressed", String(state.size === "KMU"));
    btnGU.setAttribute("aria-pressed", String(state.size === "GU"));

    Object.entries(introEls).forEach(([k, el]) => {
      if (!el) return;
      el.value = state.intro[k] || "";
    });
  }

  function syncStateFromInputs() {
    const y = state.activeYear;
    ensureYear(y);
    const d = state.byYear[y];

    d.staffCount = Math.max(0, Math.round(safeNum(staffCount.value)));
    d.salary = Math.max(0, safeNum(salary.value));
    d.fueShare = clamp(safeNum(fueShare.value), 0, 100);
    d.totalPersonnelOverride = (totalPersonnelOverride.value || "").trim();
    d.externalCost = Math.max(0, safeNum(externalCost.value));
    d.deprCost = Math.max(0, safeNum(deprCost.value));

    Object.entries(introEls).forEach(([k, el]) => {
      if (!el) return;
      state.intro[k] = (el.value || "").trim();
    });
  }

  // ========= Computation =========
  function calcForYear(y) {
    const d = state.byYear[y];
    const rate = RATE[state.size];

    // Personal-Basis
    const computedPersonnel = (d.staffCount * d.salary) * (d.fueShare / 100);
    const personnelBase =
      d.totalPersonnelOverride !== ""
        ? Math.max(0, safeNum(d.totalPersonnelOverride))
        : Math.max(0, computedPersonnel);

    // Extern/AfA
    const externalBase = Math.max(0, safeNum(d.externalCost));
    const deprBase = Math.max(0, safeNum(d.deprCost));

    // NEU: Gemeinkostenpauschale ab 2026 (+20% auf förderfähige Kosten)
    const eligibleBase = personnelBase + externalBase + deprBase;
    const overheadBase = (y >= OVERHEAD_FROM_YEAR) ? (eligibleBase * OVERHEAD_RATE) : 0;

    // Deckelung je Jahr: auf (eligible + overhead)
    const totalBaseRaw = eligibleBase + overheadBase;
    const totalBase = Math.min(totalBaseRaw, MAX_BASE_PER_YEAR);

    // proportional deckeln (wenn nötig) — inkl. Pauschale
    let p = personnelBase, e = externalBase, a = deprBase, o = overheadBase;
    if (totalBaseRaw > MAX_BASE_PER_YEAR && totalBaseRaw > 0) {
      const f = MAX_BASE_PER_YEAR / totalBaseRaw;
      p = personnelBase * f;
      e = externalBase * f;
      a = deprBase * f;
      o = overheadBase * f;
    }

    // Wichtig: Die Pauschale erhöht die Bemessungsgrundlage und wird wie „Personal“ mitgefördert
    // (im MVP: wir rechnen sie mit dem Personal-/AfA-Satz des Jahres/Unternehmensgröße)
    const grant =
      (p + o) * rate.personnel +
      e * rate.external +
      a * rate.depr;

    return {
      year: y,
      base: { personnel: p, external: e, depr: a, overhead: o, total: p + e + a + o },
      grant,
    };
  }

  function calcAll() {
    syncStateFromInputs();
    normalizeYears();

    const perYear = state.years.map((y) => calcForYear(y));
    const totalBase = perYear.reduce((s, r) => s + r.base.total, 0);
    const totalGrant = perYear.reduce((s, r) => s + r.grant, 0);

    const basePersonnel = perYear.reduce((s, r) => s + r.base.personnel, 0);
    const baseExternal = perYear.reduce((s, r) => s + r.base.external, 0);
    const baseDepr = perYear.reduce((s, r) => s + r.base.depr, 0);
    const baseOverhead = perYear.reduce((s, r) => s + (r.base.overhead || 0), 0);

    return { perYear, totalBase, totalGrant, basePersonnel, baseExternal, baseDepr, baseOverhead };
  }

  function computeAndRender() {
    const res = calcAll();
    const rate = RATE[state.size];

    resultAmount.textContent = fmtEUR(res.totalGrant);
    metaYears.textContent = `${state.years.length} Jahr${state.years.length === 1 ? "" : "e"}`;

    const overheadHint = state.years.some(y => y >= OVERHEAD_FROM_YEAR) ? ` • +${Math.round(OVERHEAD_RATE*100)}% Pauschale ab ${OVERHEAD_FROM_YEAR}` : "";
    metaRate.textContent =
      `Quote: ${state.size === "KMU" ? "KMU" : "Groß"} (P ${Math.round(rate.personnel * 100)}% / E ${Math.round(rate.external * 1000) / 10}%)${overheadHint}`;

    metaBasis.textContent = `Bemessung: ${fmtEUR(res.totalBase)}`;

    basisPersonnel.textContent = fmtEUR(res.basePersonnel);
    basisExternal.textContent = fmtEUR(res.baseExternal);
    basisDepr.textContent = fmtEUR(res.baseDepr);

    if (basisOverhead) basisOverhead.textContent = fmtEUR(res.baseOverhead);

    basisTotal.textContent = fmtEUR(res.totalBase);
  }

  // ========= PDF =========
  function buildPdfDoc() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const res = calcAll();
    const now = new Date();
    const dateStr = now.toLocaleDateString("de-DE");

    const left = 48;
    let y = 56;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Forschungszulagen-Rechner – Ergebnis (MVP)", left, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Erstellt am: ${dateStr}`, left, y);
    y += 18;

    doc.setDrawColor(220);
    doc.line(left, y, 548, y);
    y += 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Zusammenfassung", left, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Unternehmensgröße: ${state.size === "KMU" ? "KMU" : "Großunternehmen"}`, left, y); y += 14;
    doc.text(`Jahre: ${state.years.join(", ")}`, left, y); y += 14;
    doc.text(`Gesamt Bemessungsgrundlage (inkl. Pauschale ab 2026): ${fmtEUR(res.totalBase)}`, left, y); y += 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Geschätzte Forschungszulage: ${fmtEUR(res.totalGrant)}`, left, y);
    y += 22;

    // Optional: Einstiegsfragen im PDF
    const introLines = [];
    const introMap = {
      startedAfter2020: "Projekt nach dem 01.01.2020 gestartet?",
      taxableDE: "In Deutschland steuerpflichtig?",
      hasTimeline: "Projektzeitplan mit Meilensteinen vorhanden?",
      isNovel: "Neu/verbessert ggü. Stand der Technik?",
      isRisky: "Technisches Ergebnis offen/risikobehaftet?",
      hasUncertainty: "Technische Unsicherheit vorhanden?",
    };

    Object.keys(introMap).forEach((k) => {
      const v = (state.intro[k] || "").trim();
      if (v) introLines.push(`${introMap[k]} ${v}`);
    });

    if (introLines.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Einstiegs-Check (Selbstauskunft)", left, y);
      y += 14;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      introLines.forEach((line) => {
        if (y > 760) { doc.addPage(); y = 56; }
        doc.text(`• ${line}`, left, y);
        y += 14;
      });
      y += 8;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Details je Jahr", left, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    res.perYear.forEach((r) => {
      if (y > 740) { doc.addPage(); y = 56; }
      doc.setFont("helvetica", "bold");
      doc.text(`Jahr ${r.year}`, left, y); y += 12;
      doc.setFont("helvetica", "normal");

      const overheadLine = r.base.overhead ? ` | Pauschale (20%): ${fmtEUR(r.base.overhead)}` : "";
      doc.text(
        `Personal: ${fmtEUR(r.base.personnel)} | Extern: ${fmtEUR(r.base.external)} | AfA: ${fmtEUR(r.base.depr)}${overheadLine}`,
        left, y
      );
      y += 12;

      doc.text(`Bemessung gesamt: ${fmtEUR(r.base.total)} | Zulage: ${fmtEUR(r.grant)}`, left, y);
      y += 14;

      doc.setDrawColor(235);
      doc.line(left, y, 548, y);
      y += 12;
    });

    if (y > 720) { doc.addPage(); y = 56; }
    doc.setFont("helvetica", "bold");
    doc.text("Hinweise", left, y); y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Unverbindliche Schätzung. Förderfähigkeit und konkrete Höhe werden durch BSFZ/Finanzamt bestimmt.", left, y); y += 12;
    doc.text("Förder-Kompass – www.foerder-kompass.de | www.forschungszulagenantrag.de", left, y);

    return doc;
  }

  function downloadPdf() {
    const doc = buildPdfDoc();
    doc.save("forschungszulage-ergebnis.pdf");
  }

  // ========= Netlify Submit =========
  async function submitNetlifyLead() {
    const res = calcAll();
    const rateLabel = state.size === "KMU" ? "KMU" : "Großunternehmen";

    // Fill hidden form fields
    hiddenForm.querySelector('input[name="email"]').value = leadEmail.value.trim();
    hiddenForm.querySelector('input[name="unternehmen"]').value = leadCompany.value.trim();
    hiddenForm.querySelector('input[name="name"]').value = leadName.value.trim();

    hiddenForm.querySelector('input[name="unternehmensgroesse"]').value = rateLabel;
    hiddenForm.querySelector('input[name="jahre"]').value = state.years.join(", ");

    hiddenForm.querySelector('input[name="bemessung_personal"]').value = String(Math.round(res.basePersonnel));
    hiddenForm.querySelector('input[name="bemessung_extern"]').value = String(Math.round(res.baseExternal));
    hiddenForm.querySelector('input[name="bemessung_abschreibung"]').value = String(Math.round(res.baseDepr));

    // Optional (falls du es als hidden field ergänzt hast)
    const overheadField = hiddenForm.querySelector('input[name="bemessung_pauschale"]');
    if (overheadField) overheadField.value = String(Math.round(res.baseOverhead));

    hiddenForm.querySelector('input[name="bemessung_gesamt"]').value = String(Math.round(res.totalBase));
    hiddenForm.querySelector('input[name="ergebnis_forschungszulage"]').value = String(Math.round(res.totalGrant));

    const formData = new FormData(hiddenForm);

    const body = new URLSearchParams();
    for (const [k, v] of formData.entries()) body.append(k, v);

    await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  }

  // ========= Events =========
  function bindInputEvents() {
    [staffCount, salary, fueShare, totalPersonnelOverride, externalCost, deprCost].forEach((el) => {
      el.addEventListener("input", () => computeAndRender());
    });

    Object.values(introEls).forEach((el) => {
      if (!el) return;
      el.addEventListener("change", () => computeAndRender());
    });

    yearSelect.addEventListener("change", (e) => {
      state.activeYear = Number(e.target.value);
      syncInputsFromState();
      renderYears();
      computeAndRender();
    });

    btnKMU.addEventListener("click", () => {
      state.size = "KMU";
      syncInputsFromState();
      computeAndRender();
    });

    btnGU.addEventListener("click", () => {
      state.size = "GU";
      syncInputsFromState();
      computeAndRender();
    });

    addYearBtn.addEventListener("click", () => {
      const maxY = Math.max(...state.years);
      const next = Math.min(maxY + 1, MAX_YEAR);
      if (!state.years.includes(next)) state.years.push(next);
      state.activeYear = next;
      ensureYear(next);
      renderYears();
      syncInputsFromState();
      computeAndRender();
    });

    if (removeYearBtn) {
      removeYearBtn.addEventListener("click", () => {
        const minY = Math.min(...state.years);
        const prev = Math.max(minY - 1, MIN_YEAR);
        if (!state.years.includes(prev)) state.years.unshift(prev);
        state.activeYear = prev;
        ensureYear(prev);
        renderYears();
        syncInputsFromState();
        computeAndRender();
      });
    }

    downloadPdfBtn.addEventListener("click", downloadPdf);

    openLeadBtn.addEventListener("click", () => {
      leadSuccess.style.display = "none";
      modalBackdrop.style.display = "flex";
      modalBackdrop.setAttribute("aria-hidden", "false");
      setTimeout(() => leadEmail.focus(), 50);
    });

    closeModalBtn.addEventListener("click", () => {
      modalBackdrop.style.display = "none";
      modalBackdrop.setAttribute("aria-hidden", "true");
    });

    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) {
        modalBackdrop.style.display = "none";
        modalBackdrop.setAttribute("aria-hidden", "true");
      }
    });

    submitLeadBtn.addEventListener("click", async () => {
      const email = leadEmail.value.trim();
      if (!email || !email.includes("@")) {
        alert("Bitte eine gültige E-Mail-Adresse eingeben.");
        return;
      }

      submitLeadBtn.disabled = true;
      submitLeadBtn.textContent = "Sende…";

      try {
        await submitNetlifyLead();
        leadSuccess.style.display = "block";
        downloadPdf();
        setTimeout(() => {
          modalBackdrop.style.display = "none";
          modalBackdrop.setAttribute("aria-hidden", "true");
        }, 700);
      } catch (err) {
        console.error(err);
        alert("Konnte nicht senden. Bitte später erneut versuchen.");
      } finally {
        submitLeadBtn.disabled = false;
        submitLeadBtn.textContent = "Absenden & PDF herunterladen";
      }
    });
  }

  // ========= Init =========
  function init() {
    ensureYear(state.activeYear);

    normalizeYears();
    renderYears();
    syncInputsFromState();
    bindInputEvents();
    computeAndRender();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
