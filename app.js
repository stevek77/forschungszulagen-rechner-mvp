/* app.js — Forschungszulagen-Rechner | Förder-Kompass
   Hinweis: Erwartet, dass index.html passende IDs/Struktur enthält (wie in deiner bisherigen Version).
*/

(() => {
  "use strict";

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const formatEUR = (value) => {
    const v = Number.isFinite(value) ? value : 0;
    return v.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  };

  const fmtNumber = (value) => {
    const v = Number.isFinite(value) ? value : 0;
    return v.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  };

  const safeNum = (val) => {
    const n = Number(String(val ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  // -----------------------------
  // State
  // -----------------------------
  const nowYear = new Date().getFullYear();
  const defaultYears = [2022, 2023, 2024, 2025];

  const state = {
    years: defaultYears.slice(),
    activeYear: 2025,
    includeFutureYears: false,

    // Inputs
    isKMU: true,
    employees: 1,
    grossPerEmployeeYear: 60000,
    fueSharePercent: 50, // 0..100
    totalFuePersonnelOverride: 0, // optional override total F&E personnel cost
    extCosts: 0, // external services / contract research
    extRatePercent: 70, // default weighting for extern (your old logic)
    depreciationCosts: 0,

    // Optional onboarding questions (kept for lead context)
    q: {
      industry: "",
      projectName: "",
      startDate: "",
      status: "",
      notes: ""
    }
  };

  // -----------------------------
  // DOM refs (IDs should exist in index.html)
  // -----------------------------
  const dom = {
    // Pills / selectors
    yearPills: $("#yearPills"),
    btnAddYear: $("#btnAddYear"),
    yearSelect: $("#projectYear"),
    topBadge: $("#topBadgeText"), // "Förder-Kompass Schnellcheck"
    sectionTitleOnboarding: $("#sectionTitleOnboarding"), // heading text node

    // Company size toggle
    btnKMU: $("#btnKMU"),
    btnLarge: $("#btnLarge"),

    // Inputs
    inpEmployees: $("#inpEmployees"),
    inpGross: $("#inpGross"),
    inpFueShare: $("#inpFueShare"),
    inpFueTotalOverride: $("#inpFueTotalOverride"),
    inpExtCosts: $("#inpExtCosts"),
    inpDepreciation: $("#inpDepreciation"),

    // Optional Qs
    inpIndustry: $("#inpIndustry"),
    inpProjectName: $("#inpProjectName"),
    inpStartDate: $("#inpStartDate"),
    selStatus: $("#selStatus"),
    inpNotes: $("#inpNotes"),

    // Results
    outTotal: $("#outTotal"),
    outYearsCount: $("#outYearsCount"),
    outActiveYear: $("#outActiveYear"),
    outBadgeDetail: $("#outBadgeDetail"),

    outBemPersonnel: $("#outBemPersonnel"),
    outBemExt: $("#outBemExt"),
    outBemDep: $("#outBemDep"),
    outBemTotal: $("#outBemTotal"),

    // PDF / Lead
    emailForm: $("#emailForm"),
    inpEmail: $("#leadEmail"),
    btnRequestPdf: $("#btnRequestPdf"),
    requestStatus: $("#requestStatus"),

    // Removed button (we still support if old markup exists)
    btnDirectDownload: $("#btnDirectDownload")
  };

  // -----------------------------
  // Business logic (MVP)
  // -----------------------------
  function calcYear(year) {
    // Personnel F&E base:
    // Option A: employees * grossPerEmployeeYear * fueShare
    // Option B: override total F&E personnel cost (if provided > 0)
    const fueShare = clamp(state.fueSharePercent, 0, 100) / 100;

    const personnelBase =
      state.totalFuePersonnelOverride > 0
        ? safeNum(state.totalFuePersonnelOverride)
        : safeNum(state.employees) * safeNum(state.grossPerEmployeeYear) * fueShare;

    // External: weighted by extRatePercent (default 70%) and then multiplied with the same subsidy rate
    const extBase = safeNum(state.extCosts);
    const extWeighted = extBase * (clamp(state.extRatePercent, 0, 100) / 100);

    // Depreciation: fully as entered (you can later refine)
    const depBase = safeNum(state.depreciationCosts);

    const bemTotal = personnelBase + extWeighted + depBase;

    // Subsidy rate (simplified MVP):
    // - Large: 25%
    // - KMU: 35%
    const rate = state.isKMU ? 0.35 : 0.25;
    const grant = bemTotal * rate;

    return {
      year,
      rate,
      personnelBase,
      extWeighted,
      depBase,
      bemTotal,
      grant
    };
  }

  function calcAllYears() {
    const results = state.years.map(calcYear);
    const sum = results.reduce((acc, r) => acc + r.grant, 0);
    const active = results.find((r) => r.year === state.activeYear) || results[results.length - 1];
    return { results, sum, active };
  }

  // -----------------------------
  // Render
  // -----------------------------
  function renderYearPills() {
    if (!dom.yearPills) return;
    dom.yearPills.innerHTML = "";

    state.years.forEach((y) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill" + (y === state.activeYear ? " is-active" : "");
      btn.textContent = String(y);
      btn.addEventListener("click", () => {
        state.activeYear = y;
        if (dom.yearSelect) dom.yearSelect.value = String(y);
        render();
      });
      dom.yearPills.appendChild(btn);
    });
  }

  function renderYearSelect() {
    if (!dom.yearSelect) return;

    dom.yearSelect.innerHTML = "";
    state.years.forEach((y) => {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      dom.yearSelect.appendChild(opt);
    });
    dom.yearSelect.value = String(state.activeYear);

    dom.yearSelect.onchange = (e) => {
      state.activeYear = Number(e.target.value);
      render();
    };
  }

  function renderCompanySize() {
    if (dom.btnKMU) dom.btnKMU.classList.toggle("is-active", state.isKMU);
    if (dom.btnLarge) dom.btnLarge.classList.toggle("is-active", !state.isKMU);
  }

  function renderResults() {
    const { sum, active } = calcAllYears();

    if (dom.outTotal) dom.outTotal.textContent = formatEUR(sum);
    if (dom.outYearsCount) dom.outYearsCount.textContent = `${state.years.length} Jahre`;
    if (dom.outActiveYear) dom.outActiveYear.textContent = `Aktives Jahr: ${state.activeYear}`;

    // Detail badge line (MVP)
    if (dom.outBadgeDetail) {
      const rateTxt = active.rate === 0.35 ? "P 35%" : "P 25%";
      const extTxt = safeNum(state.extCosts) > 0 ? `• Extern ${state.extRatePercent}%*${rateTxt}` : "";
      dom.outBadgeDetail.textContent = `${rateTxt} ${extTxt}`.trim();
    }

    if (dom.outBemPersonnel) dom.outBemPersonnel.textContent = formatEUR(active.personnelBase);
    if (dom.outBemExt) dom.outBemExt.textContent = formatEUR(active.extWeighted);
    if (dom.outBemDep) dom.outBemDep.textContent = formatEUR(active.depBase);
    if (dom.outBemTotal) dom.outBemTotal.textContent = formatEUR(active.personnelBase + active.extWeighted + active.depBase);
  }

  function renderStaticTextEdits() {
    // Requested text changes
    if (dom.topBadge) dom.topBadge.textContent = "Förder-Kompass Schnellcheck";
    if (dom.sectionTitleOnboarding) {
      dom.sectionTitleOnboarding.textContent =
        "Ergänzende Fragen zum Check der Förderfähigkeit (wichtig für das Beratungsgespräch)";
    }

    // Tooltip / placeholder in E-Mail Feld
    if (dom.inpEmail) {
      dom.inpEmail.placeholder = "name@ihrunternehmen.de";
      dom.inpEmail.title = "name@ihrunternehmen.de";
    }

    // Remove direct download button (if still present in old markup)
    if (dom.btnDirectDownload) {
      dom.btnDirectDownload.remove();
    }
  }

  function render() {
    renderStaticTextEdits();
    renderYearPills();
    renderYearSelect();
    renderCompanySize();
    renderResults();
  }

  // -----------------------------
  // Input bindings
  // -----------------------------
  function bindInputs() {
    if (dom.btnKMU) {
      dom.btnKMU.addEventListener("click", () => {
        state.isKMU = true;
        render();
      });
    }
    if (dom.btnLarge) {
      dom.btnLarge.addEventListener("click", () => {
        state.isKMU = false;
        render();
      });
    }

    if (dom.inpEmployees) {
      dom.inpEmployees.addEventListener("input", (e) => {
        state.employees = clamp(safeNum(e.target.value), 0, 999999);
        render();
      });
    }
    if (dom.inpGross) {
      dom.inpGross.addEventListener("input", (e) => {
        state.grossPerEmployeeYear = clamp(safeNum(e.target.value), 0, 1e12);
        render();
      });
    }
    if (dom.inpFueShare) {
      dom.inpFueShare.addEventListener("input", (e) => {
        state.fueSharePercent = clamp(safeNum(e.target.value), 0, 100);
        render();
      });
    }
    if (dom.inpFueTotalOverride) {
      dom.inpFueTotalOverride.addEventListener("input", (e) => {
        state.totalFuePersonnelOverride = clamp(safeNum(e.target.value), 0, 1e15);
        render();
      });
    }
    if (dom.inpExtCosts) {
      dom.inpExtCosts.addEventListener("input", (e) => {
        state.extCosts = clamp(safeNum(e.target.value), 0, 1e15);
        render();
      });
    }
    if (dom.inpDepreciation) {
      dom.inpDepreciation.addEventListener("input", (e) => {
        state.depreciationCosts = clamp(safeNum(e.target.value), 0, 1e15);
        render();
      });
    }

    // Optional onboarding fields
    if (dom.inpIndustry) dom.inpIndustry.addEventListener("input", (e) => (state.q.industry = e.target.value || ""));
    if (dom.inpProjectName) dom.inpProjectName.addEventListener("input", (e) => (state.q.projectName = e.target.value || ""));
    if (dom.inpStartDate) dom.inpStartDate.addEventListener("input", (e) => (state.q.startDate = e.target.value || ""));
    if (dom.selStatus) dom.selStatus.addEventListener("change", (e) => (state.q.status = e.target.value || ""));
    if (dom.inpNotes) dom.inpNotes.addEventListener("input", (e) => (state.q.notes = e.target.value || ""));

    // Year add button (adds the next year)
    if (dom.btnAddYear) {
      dom.btnAddYear.addEventListener("click", () => {
        const maxY = Math.max(...state.years);
        const next = maxY + 1;
        state.years.push(next);
        state.activeYear = next;
        render();
      });
    }

    // Email/PDF request
    if (dom.emailForm) {
      dom.emailForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = String(dom.inpEmail?.value || "").trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showStatus("Bitte eine gültige E-Mail-Adresse eingeben.", "error");
          return;
        }

        // IMPORTANT: Consent checkbox should exist in HTML (recommended), but we also tolerate no checkbox.
        const consent = $("#leadConsent");
        if (consent && !consent.checked) {
          showStatus("Bitte bestätigen Sie die Datenschutzeinwilligung.", "error");
          return;
        }

        // Build payload for your lead endpoint / Netlify Forms / Zapier / n8n etc.
        const { results, sum, active } = calcAllYears();

        const payload = {
          tool: "Forschungszulagen-Rechner",
          brand: "Förder-Kompass",
          domain: "forschungszulagenantrag.de",
          email,
          createdAt: new Date().toISOString(),
          inputs: {
            isKMU: state.isKMU,
            employees: state.employees,
            grossPerEmployeeYear: state.grossPerEmployeeYear,
            fueSharePercent: state.fueSharePercent,
            totalFuePersonnelOverride: state.totalFuePersonnelOverride,
            extCosts: state.extCosts,
            extRatePercent: state.extRatePercent,
            depreciationCosts: state.depreciationCosts,
            activeYear: state.activeYear,
            years: state.years.slice()
          },
          optionalAnswers: { ...state.q },
          result: {
            totalGrantAllYears: sum,
            activeYear: active.year,
            activeYearGrant: active.grant,
            activeBemPersonnel: active.personnelBase,
            activeBemExtWeighted: active.extWeighted,
            activeBemDep: active.depBase,
            activeBemTotal: active.bemTotal,
            rate: active.rate,
            perYear: results.map((r) => ({
              year: r.year,
              grant: r.grant,
              bemTotal: r.bemTotal,
              rate: r.rate
            }))
          }
        };

        // Generate PDF client-side (still useful for sending via backend later)
        let pdfBlob = null;
        try {
          pdfBlob = generatePdfBlob(payload);
        } catch (err) {
          console.warn("PDF generation failed:", err);
        }

        // Send lead (you can wire this to Netlify Functions, n8n webhook, etc.)
        // Default target: /api/lead (adjust in your deployment)
        const endpoint = $("#leadEndpoint")?.value?.trim() || "/api/lead";

        try {
          dom.btnRequestPdf && (dom.btnRequestPdf.disabled = true);
          showStatus("Wird gesendet …", "info");

          const formData = new FormData();
          formData.append("payload", JSON.stringify(payload));
          // Attach PDF only if your backend supports multipart
          if (pdfBlob) formData.append("pdf", pdfBlob, "Foerder-Kompass_Forschungszulagen-Schaetzung.pdf");

          const res = await fetch(endpoint, {
            method: "POST",
            body: formData
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          showStatus("Danke! Sie erhalten das PDF in Kürze per E-Mail.", "success");
          dom.emailForm.reset();
        } catch (err) {
          console.error(err);
          showStatus(
            "Senden fehlgeschlagen. Bitte später erneut versuchen oder kontaktieren Sie Förder-Kompass direkt.",
            "error"
          );
        } finally {
          dom.btnRequestPdf && (dom.btnRequestPdf.disabled = false);
        }
      });
    }
  }

  function showStatus(msg, type = "info") {
    if (!dom.requestStatus) return;
    dom.requestStatus.textContent = msg;
    dom.requestStatus.className = `request-status is-${type}`;
  }

  // -----------------------------
  // PDF generation (jsPDF)
  // -----------------------------
  function generatePdfBlob(payload) {
    // jsPDF loaded via CDN in index.html
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) throw new Error("jsPDF not available");

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    let y = margin;

    const line = (text, size = 11, extra = 18) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      const split = doc.splitTextToSize(text, 595 - margin * 2);
      doc.text(split, margin, y);
      y += extra + (split.length - 1) * (size + 2);
      if (y > 780) {
        doc.addPage();
        y = margin;
      }
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Forschungszulagen-Rechner – unverbindliche Schätzung", margin, y);
    y += 28;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Förder-Kompass | forschungszulagenantrag.de`, margin, y);
    y += 20;
    doc.text(`E-Mail: ${payload.email}`, margin, y);
    y += 26;

    const r = payload.result;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Potenzielle Forschungszulage (Summe): ${formatEUR(r.totalGrantAllYears)}`, margin, y);
    y += 24;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    line(`Aktives Jahr: ${r.activeYear} | Fördersatz: ${(r.rate * 100).toFixed(0)}%`, 11, 18);
    line(`Bemessungsgrundlage (Personal): ${formatEUR(r.activeBemPersonnel)}`, 11, 18);
    line(`Bemessungsgrundlage (Extern, gewichtet): ${formatEUR(r.activeBemExtWeighted)}`, 11, 18);
    line(`Bemessungsgrundlage (Abschreibung): ${formatEUR(r.activeBemDep)}`, 11, 18);
    line(`Gesamt-Bemessungsgrundlage: ${formatEUR(r.activeBemTotal)}`, 11, 22);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Jahresübersicht", margin, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    r.perYear.forEach((py) => {
      line(`${py.year}: Zulage ${formatEUR(py.grant)} | Bemessung ${formatEUR(py.bemTotal)} | Satz ${(py.rate * 100).toFixed(0)}%`, 11, 16);
    });

    y += 10;
    line(
      "Hinweis: Unverbindliche Schätzung. Die tatsächliche Förderfähigkeit und Höhe hängt von der Bescheinigungsstelle (BSFZ) und dem Finanzamt ab.",
      10,
      16
    );

    // Footer note
    y += 8;
    line(
      "Förder-Kompass: Die Schätzung ist ein Startpunkt – in der Zusammenarbeit werden häufig zusätzliche förderfähige FuE-Anteile sauber identifiziert.",
      10,
      16
    );

    const blob = doc.output("blob");
    return blob;
  }

  // -----------------------------
  // Init
  // -----------------------------
  document.addEventListener("DOMContentLoaded", () => {
    // Ensure activeYear exists in list
    if (!state.years.includes(state.activeYear)) state.activeYear = state.years[state.years.length - 1];

    // Apply requested “Schnellcheck” label immediately
    renderStaticTextEdits();

    bindInputs();
    render();
  });
})();
