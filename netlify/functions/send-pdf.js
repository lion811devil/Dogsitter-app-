exports.handler = async function(event) {
  const json = (statusCode, payload) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Metodo non consentito" });
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const data = payload.data || {};
    const pdfBase64 = payload.pdfBase64;
    const filename = payload.filename || "Modulo_Dogsitter.pdf";

    if (!data || !pdfBase64) {
      return json(400, { ok: false, error: "Dati o PDF mancanti" });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
    const TO_EMAIL = process.env.TO_EMAIL || "";
    const FROM_EMAIL = process.env.FROM_EMAIL || "";
    const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || "";

    const missing = [];
    if (!RESEND_API_KEY) missing.push("RESEND_API_KEY");
    if (!TO_EMAIL) missing.push("TO_EMAIL");
    if (!FROM_EMAIL) missing.push("FROM_EMAIL");
    if (!GOOGLE_SHEETS_WEBHOOK_URL) missing.push("GOOGLE_SHEETS_WEBHOOK_URL");

    if (missing.length) {
      return json(500, { ok: false, error: "Variabili mancanti: " + missing.join(", ") });
    }

    const finalTotal = data.periodFinalTotal || data.dailyRateTotal || "-";

    let googleResult = null;
    let pdfUrl = "";

    const googleResponse = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, filename, pdfBase64 })
    });

    const googleText = await googleResponse.text();

    try {
      googleResult = JSON.parse(googleText);
      pdfUrl = googleResult.pdfUrl || "";
    } catch (_) {
      googleResult = { raw: googleText };
    }

    console.log("GOOGLE_RESULT", googleResult);

    if (!googleResponse.ok) {
      return json(500, {
        ok: false,
        step: "google",
        error: "Errore Google Sheets/Drive",
        google: googleResult
      });
    }

    const ownerHtml = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#211633">
      <h2>Nuovo modulo dogsitter compilato</h2>
      <p><strong>Proprietario:</strong> ${data.ownerName || "-"}</p>
      <p><strong>Telefono:</strong> ${data.ownerPhone || "-"}</p>
      <p><strong>Email:</strong> ${data.ownerEmail || "-"}</p>
      <p><strong>Cane:</strong> ${data.dogName || "-"}</p>
      <p><strong>Servizio:</strong> ${data.serviceType || "-"}</p>
      <p><strong>Tariffe:</strong> ${data.dailyRate || "-"}</p>
      <p><strong>Totale giornaliero:</strong> ${data.dailyRateTotal || "-"}</p>
      <p><strong>Giorni:</strong> ${data.periodDays || "-"}</p>
      <p><strong>Sconto:</strong> ${data.discountRate ? data.discountRate + "%" : "0%"}</p>
      <p><strong>Totale finale:</strong> ${finalTotal}</p>
      <p><strong>Pagamento:</strong> ${data.paymentMethodOther || data.paymentMethod || "-"}</p>
      <p><strong>Stato pagamento:</strong> ${data.paymentStatus || "-"}</p>
      <p><strong>GDPR:</strong> ${data.gdprConsent || "-"}</p>
      ${pdfUrl ? `<p><strong>Link PDF Drive:</strong> <a href="${pdfUrl}">${pdfUrl}</a></p>` : ""}
      <p>PDF completo allegato.</p>
    </div>`;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        subject: `Nuovo modulo dogsitter - ${data.dogName || "cane"} - ${data.ownerName || "cliente"}`,
        html: ownerHtml,
        attachments: [{ filename, content: pdfBase64 }]
      })
    });

    const emailText = await emailResponse.text();
    let ownerEmail = null;

    try {
      ownerEmail = JSON.parse(emailText);
    } catch (_) {
      ownerEmail = { raw: emailText };
    }

    console.log("RESEND_RESULT", {
      ok: emailResponse.ok,
      status: emailResponse.status,
      response: ownerEmail
    });

    if (!emailResponse.ok) {
      throw new Error(`Resend error ${emailResponse.status}: ${emailText}`);
    }

    const cleanPhone = String(data.ownerPhone || "")
      .replace(/\D/g, "")
      .replace(/^0+/, "");

    const whatsappPhone = cleanPhone.startsWith("39") ? cleanPhone : `39${cleanPhone}`;

    const whatsappMessage = [
      `Ciao ${data.ownerName || ""},`,
      "",
      `il tuo modulo Dogsitter per ${data.dogName || "il tuo cane"} è stato registrato correttamente.`,
      "",
      pdfUrl ? `Puoi visualizzare il PDF qui:` : "",
      pdfUrl || "",
      "",
      "Grazie.",
      "K9 Mantrailing HRDD Tattico Napoletano"
    ].filter(Boolean).join("\n");

    const whatsappUrl = cleanPhone
      ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`
      : "";

    return json(200, {
      ok: true,
      google: googleResult,
      pdfUrl,
      ownerEmail,
      whatsappUrl
    });

  } catch (err) {
    console.log("SEND_PDF_EXCEPTION", err.message);

    return json(500, {
      ok: false,
      error: err.message || "Errore interno"
    });
  }
};
