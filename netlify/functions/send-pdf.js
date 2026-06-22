const { Resend } = require('resend');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Metodo non consentito' }) };
  try {
    const { data, pdfBase64, filename } = JSON.parse(event.body || '{}');
    if (!data || !pdfBase64 || !filename) return { statusCode: 400, body: JSON.stringify({ error: 'Dati o PDF mancanti' }) };

    const apiKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.TO_EMAIL;
    const fromEmail = process.env.FROM_EMAIL;
    const sheetsWebhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

    if (!apiKey || !toEmail || !fromEmail) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Variabili email non configurate' }) };
    }

    const resend = new Resend(apiKey);
    const finalTotal = data.periodFinalTotal || data.dailyRateTotal || '-';

    const ownerHtml = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#211633">
      <h2>Nuovo modulo dogsitter compilato</h2>
      <p><strong>Proprietario:</strong> ${data.ownerName || '-'}</p>
      <p><strong>Telefono:</strong> ${data.ownerPhone || '-'}</p>
      <p><strong>Email:</strong> ${data.ownerEmail || '-'}</p>
      <p><strong>Cane:</strong> ${data.dogName || '-'}</p>
      <p><strong>Servizio:</strong> ${data.serviceType || '-'}</p>
      <p><strong>Tariffe:</strong> ${data.dailyRate || '-'}</p>
      <p><strong>Totale giornaliero:</strong> ${data.dailyRateTotal || '-'}</p>
      <p><strong>Giorni:</strong> ${data.periodDays || '-'}</p>
      <p><strong>Sconto:</strong> ${data.discountRate ? data.discountRate + '%' : '0%'}</p>
      <p><strong>Totale finale:</strong> ${finalTotal}</p>
      <p><strong>Pagamento:</strong> ${data.paymentMethodOther || data.paymentMethod || '-'}</p>
      <p><strong>Stato pagamento:</strong> ${data.paymentStatus || '-'}</p>
      <p><strong>GDPR:</strong> ${data.gdprConsent || '-'}</p>
      <p>PDF completo allegato.</p>
    </div>`;

    const ownerResult = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: `Nuovo modulo dogsitter - ${data.dogName || 'cane'} - ${data.ownerName || 'cliente'}`,
      html: ownerHtml,
      attachments: [{ filename, content: pdfBase64 }]
    });

    let sheetsResult = null;
    if (sheetsWebhookUrl) {
      const sheetsResponse = await fetch(sheetsWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, filename, pdfBase64 })
      });
      sheetsResult = { ok: sheetsResponse.ok, status: sheetsResponse.status, response: await sheetsResponse.text() };
    }

    let clientResult = null;
    if (data.ownerEmail && String(data.ownerEmail).includes('@')) {
      clientResult = await resend.emails.send({
        from: fromEmail,
        to: [data.ownerEmail],
        subject: 'Modulo dogsitter ricevuto correttamente',
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#211633">
          <h2>Modulo ricevuto correttamente</h2>
          <p>Ciao ${data.ownerName || ''}, il modulo relativo a <strong>${data.dogName || 'il tuo cane'}</strong> è stato inviato correttamente.</p>
          <p><strong>Totale finale concordato:</strong> ${finalTotal}</p>
          <p>Grazie.</p>
        </div>`
      });
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, ownerEmailId: ownerResult?.data?.id || null, clientEmailId: clientResult?.data?.id || null, sheets: sheetsResult }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Errore interno' }) };
  }
};
