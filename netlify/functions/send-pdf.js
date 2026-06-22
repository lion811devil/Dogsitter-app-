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

    console.log("CONFIG_CHECK", {
      hasResendApiKey: Boolean(RESEND_API_KEY),
      hasToEmail: Boolean(TO_EMAIL),
      hasFromEmail: Boolean(FROM_EMAIL),
      hasGoogleWebhook: Boolean(GOOGLE_SHEETS_WEBHOOK_URL),
      fromEmail: FROM_EMAIL || null,
      toEmail: TO_EMAIL || null
    });

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

    try {
      const googleResponse = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, filename, pdfBase64 })
      });

      const googleText = await googleResponse.text();

      googleResult = {
        ok: googleResponse.ok,
        status: googleResponse.status,
        response: googleText.slice(0, 1000)
      };

      console.log("GOOGLE_RESULT", googleResult);

      if (!googleResponse.ok) {
        return json(500, {
          ok: false,
          step: "google",
          error: "Errore Google Sheets/Drive",
          google: googleResult
        });
      }
    } catch (googleError) {
      console.log("GOOGLE_EXCEPTION", googleError.message);

      return json(500, {
        ok: false,
        step: "google",
        error: googleError.message
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
      <p>PDF completo allegato.</p>
    </div>`;

    const sendEmail = async ({ to, subject, html, attachments }) => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
          attachments
        })
      });

      const text = await response.text();

      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        parsed = { raw: text };
      }

      console.log("RESEND_RESULT", {
        ok: response.ok,
        status: response.status,
        response: parsed
      });

      if (!response.ok) {
        throw new Error(`Resend error ${response.status}: ${text}`);
      }

      return parsed;
    };

    const ownerEmail = await sendEmail({
      to: TO_EMAIL,
      subject: `Nuovo modulo dogsitter - ${data.dogName || "cane"} - ${data.ownerName || "cliente"}`,
      html: ownerHtml,
      attachments: [{ filename, content: pdfBase64 }]
    });

    let clientEmail = null;

    if (data.ownerEmail && String(data.ownerEmail).includes("@")) {
      clientEmail = await sendEmail({
        to: data.ownerEmail,
        subject: "Modulo dogsitter ricevuto correttamente",
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#211633">
          <h2>Modulo ricevuto correttamente</h2>
          <p>Ciao ${data.ownerName || ""}, il modulo relativo a <strong>${data.dogName || "il tuo cane"}</strong> è stato inviato correttamente.</p>
          <p><strong>Totale finale concordato:</strong> ${finalTotal}</p>
          <p>Grazie.</p>
        </div>`
      });
    }

    return json(200, {
      ok: true,
      google: googleResult,
      ownerEmail,
      clientEmail
    });

  } catch (err) {
    console.log("SEND_PDF_EXCEPTION", err.message);

    return json(500, {
      ok: false,
      error: err.message || "Errore interno"
    });
  }
};
