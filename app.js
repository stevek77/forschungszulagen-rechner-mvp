// Forschungszulagen-Rechner MVP
// Hinweis: Vereinfachte Logik. Sätze können sich ändern – im MVP als Config zentral.

const CONFIG = {
  // Förderquoten (vereinfachtes MVP)
  // Personal: KMU 35%, Großunternehmen 25% (Beispiel-Logik, anpassbar)
  ratePersonnelKMU: 0.35,
  ratePersonnelGU: 0.25,

  // Externe FuE-Aufträge: häufig niedriger (vereinfachtes MVP)
  rateExternalKMU: 0.245,
  rateExternalGU: 0.175,

  // Anlagen/Abschreibung behandeln wir wie Personalquote (vereinfachtes MVP)
  // (Kannst du später getrennt ausweisen.)
};

let state = {
  year: 2025,
  isKMU: true
};

// Elements
const $ = (id) => document.getElementById(id);

const els = {
  btnKMU: $("btnKMU"),
  btnGU: $("btnGU"),
  staffCount: $("staffCount"),
  salaryAvg: $("salaryAvg"),
  fueShare: $("fueShare"),
  fueShareLabel: $("fueShareLabel"),
  externalCost: $("externalCost"),
  assetDep: $("assetDep"),

  resultEuro: $("resultEuro"),
  basisEuro: $("basisEuro"),
  pEuro: $("pEuro"),
  eEuro: $("eEuro"),
  aEuro: $("aEuro"),

  btnPdf: $("btnPdf"),
  ctaLead: $("ctaLead"),

  // modal
  emailModal: $("emailModal"),
  emailInput: $("emailInput"),
  consent: $("consent"),
  btnCancel: $("btnCancel"),
  btnSend: $("btnSend"),
  modalMsg: $("modalMsg"),
};

// Helpers
function clampNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? x : 0;
}

function formatEUR(n) {
  return Math.round(n).toLocaleString("de-DE");
}

function getRates() {
  return {
    rP: state.isKMU ? CONFIG.ratePersonnelKMU : CONFIG.ratePersonnelGU,
    rE: state.isKMU ? CONFIG.rateExternalKMU : CONFIG.rateExternalGU,
    rA: state.isKMU ? CONFIG.ratePersonnelKMU : CONFIG.ratePersonnelGU
  };
}

// Core calculation (MVP)
function calculate() {
  const staff = clampNumber(els.staffCount.value);
  const salary = clampNumber(els.salaryAvg.value);
  const share = clampNumber(els.fueShare.value) / 100;
  const external = clampNumber(els.externalCost.value);
  const assets = clampNumber(els.assetDep.value);

  const { rP, rE, rA } = getRates();

  // Bemessungsgrundlagen (vereinfachtes MVP)
  const basePersonnel = staff * salary * share;
  const baseExternal = external;
  const baseAssets = assets;

  const grantPersonnel = basePersonnel * rP;
  const grantExternal = baseExternal * rE;
  const grantAssets = baseAssets * rA;

  const totalBase = basePersonnel + baseExternal + baseAssets;
  const totalGrant = grantPersonnel + grantExternal + grantAssets;

  // UI
  els.fueShareLabel.textContent = Math.round(share * 100);

  els.basisEuro.textContent = formatEUR(totalBase);
  els.resultEuro.textContent = formatEUR(totalGrant);

  els.pEuro.textContent = formatEUR(grantPersonnel);
  els.eEuro.textContent = formatEUR(grantExternal);
  els.aEuro.textContent = formatEUR(grantAssets);

  return {
    staff, salary, share,
    external, assets,
    basePersonnel, baseExternal, baseAssets,
    totalBase, totalGrant,
    grantPersonnel, grantExternal, grantAssets,
    rates: { rP, rE, rA },
    year: state.year,
    size: state.isKMU ? "KMU" : "Großunternehmen"
  };
}

// Accordion behavior
document.querySelectorAll(".accordion__head").forEach(btn => {
  btn.addEventListener("click", () => {
    const body = btn.parentElement.querySelector(".accordion__body");
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!expanded));
    body.classList.toggle("accordion__body--collapsed", expanded);
  });
});

// Toggle size buttons
els.btnKMU.addEventListener("click", () => {
  state.isKMU = true;
  els.btnKMU.classList.add("segmented__btn--active");
  els.btnGU.classList.remove("segmented__btn--active");
  calculate();
});
els.btnGU.addEventListener("click", () => {
  state.isKMU = false;
  els.btnGU.classList.add("segmented__btn--active");
  els.btnKMU.classList.remove("segmented__btn--active");
  calculate();
});

// Live calculation
["input", "change"].forEach(evt => {
  [els.staffCount, els.salaryAvg, els.fueShare, els.externalCost, els.assetDep].forEach(el => {
    el.addEventListener(evt, calculate);
  });
});

// Modal controls
function openModal() {
  els.modalMsg.textContent = "";
  els.emailModal.setAttribute("aria-hidden", "false");
}
function closeModal() {
  els.emailModal.setAttribute("aria-hidden", "true");
}
els.btnCancel.addEventListener("click", closeModal);
els.emailModal.addEventListener("click", (e) => {
  const t = e.target;
  if (t && t.dataset && t.dataset.close) closeModal();
});

// PDF generation (client-side)
async function generatePdfBlob(calc) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Forschungszulagen-Rechner – Auswertung (MVP)", 40, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Förder-Kompass | Jahr: ${calc.year} | Unternehmensgröße: ${calc.size}`, 40, 72);

  // Summary box
  doc.setDrawColor(15, 138, 115);
  doc.setLineWidth(1);
  doc.roundedRect(40, 90, 515, 92, 10, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Potenzielle Forschungszulage: ${formatEUR(calc.totalGrant)} €`, 55, 125);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Bemessungsgrundlage: ${formatEUR(calc.totalBase)} € (vereinfachte Schätzung)`, 55, 150);

  // Inputs
  const y0 = 210;
  doc.setFont("helvetica", "bold"); doc.text("Eingaben", 40, y0);
  doc.setFont("helvetica", "normal");
  const lines = [
    `Projekt-Mitarbeitende: ${calc.staff}`,
    `Ø Arbeitgeberkosten/Jahr: ${formatEUR(calc.salary)} €`,
    `FuE-Anteil: ${Math.round(calc.share * 100)} %`,
    `Externe FuE-Kosten: ${formatEUR(calc.external)} €`,
    `Abschreibungen (Anlagen): ${formatEUR(calc.assets)} €`,
  ];
  lines.forEach((l, i) => doc.text(l, 40, y0 + 22 + i * 16));

  // Breakdown
  const y1 = 330;
  doc.setFont("helvetica", "bold"); doc.text("Aufteilung (Förderbetrag)", 40, y1);
  doc.setFont("helvetica", "normal");
  const bl = [
    `Personal: ${formatEUR(calc.grantPersonnel)} € (Quote: ${Math.round(calc.rates.rP * 100)}%)`,
    `Dienstleister: ${formatEUR(calc.grantExternal)} € (Quote: ${Math.round(calc.rates.rE * 100)}%)`,
    `Anlagen: ${formatEUR(calc.grantAssets)} €`,
  ];
  bl.forEach((l, i) => doc.text(l, 40, y1 + 22 + i * 16));

  // Footer disclaimer
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text(
    "Hinweis: Unverbindliche Schätzung. Die tatsächliche Förderung hängt u. a. vom BSFZ-Bescheid und der Prüfung durch das Finanzamt ab.",
    40, 800, { maxWidth: 515 }
  );

  const blob = doc.output("blob");
  return blob;
}

// Download directly (optional)
async function downloadPdfDirect() {
  const calc = calculate();
  const blob = await generatePdfBlob(calc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Forschungszulage_Auswertung_${calc.year}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Email gate flow (MVP)
els.btnPdf.addEventListener("click", () => openModal());
els.ctaLead.addEventListener("click", () => openModal());

els.btnSend.addEventListener("click", async () => {
  const email = (els.emailInput.value || "").trim();
  const ok = els.consent.checked;

  if (!email || !email.includes("@")) {
    els.modalMsg.textContent = "Bitte eine gültige E-Mail-Adresse eingeben.";
    return;
  }
  if (!ok) {
    els.modalMsg.textContent = "Bitte Zustimmung setzen, damit wir Ihnen die PDF senden dürfen.";
    return;
  }

  // MVP: Ohne Backend können wir keine E-Mail „wirklich“ senden.
  // Lösung: Netlify Forms (Lead) + PDF Download danach ODER Netlify Function (echter Versand).
  // Hier: Wir speichern die Lead-Daten via Netlify Forms-kompatiblem POST (wenn auf Netlify deployed).
  els.modalMsg.textContent = "Einen Moment…";

  const calc = calculate();
  const payload = {
    email,
    year: String(calc.year),
    size: calc.size,
    grant: String(Math.round(calc.totalGrant)),
    base: String(Math.round(calc.totalBase)),
    staff: String(calc.staff),
    salary: String(calc.salary),
    fueShare: String(Math.round(calc.share * 100)),
    external: String(calc.external),
    assets: String(calc.assets),
    source: "rechner-mvp"
  };

  try {
    // Netlify Forms expects: form-name + fields
    const formData = new URLSearchParams();
    formData.append("form-name", "rechner-leads");
    Object.entries(payload).forEach(([k, v]) => formData.append(k, v));

    await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString()
    });

    // After lead capture: download PDF immediately
    await downloadPdfDirect();

    els.modalMsg.textContent = "Danke! PDF wurde erstellt. Wir melden uns zeitnah.";
    setTimeout(() => { closeModal(); }, 900);
  } catch (e) {
    els.modalMsg.textContent = "Konnte nicht senden. Bitte später erneut versuchen.";
  }
});

// INIT
calculate();
