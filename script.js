function berechnen() {
  const mitarbeiter = Number(document.getElementById("mitarbeiter").value);
  const lohn = Number(document.getElementById("lohn").value);
  const anteil = Number(document.getElementById("anteil").value) / 100;
  const extern = Number(document.getElementById("extern").value);
  const unternehmen = document.getElementById("unternehmen").value;

  // Personalkosten F&E
  const personalkosten = mitarbeiter * lohn * anteil;

  // Förderfähige Kosten
  let kosten = personalkosten + extern;

  // Förderquote
  let foerderquote = unternehmen === "kmu" ? 0.25 : 0.15;

  // Max. Bemessungsgrundlage (vereinfachtes MVP)
  kosten = Math.min(kosten, 4000000);

  const foerderung = kosten * foerderquote;

  document.getElementById("output").innerText =
    foerderung.toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR"
    });
}
