const SHEET_ID = 'INSERISCI_QUI_ID_DEL_TUO_GOOGLE_SHEET';
const DRIVE_FOLDER_ID = 'INSERISCI_QUI_ID_CARTELLA_GOOGLE_DRIVE';
const SHEET_NAME = 'Moduli Dogsitter';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const data = payload.data || {};
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

    const headers = ['Data invio','Proprietario','Telefono','Email','Cane','Servizio','Data inizio','Data fine','Tariffe','Totale giornaliero','Sconto %','Giorni','Totale periodo','Importo sconto','Totale finale','Pagamento','Stato cliente','Stato pagamento','GDPR','Firma cliente','Firma dogsitter','Dogsitter','Ente/associazione','PDF','Filename PDF','Dati JSON'];
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);

    let pdfUrl = '';
    if (payload.pdfBase64 && payload.filename && DRIVE_FOLDER_ID !== 'INSERISCI_QUI_ID_CARTELLA_GOOGLE_DRIVE') {
      const bytes = Utilities.base64Decode(payload.pdfBase64);
      const blob = Utilities.newBlob(bytes, 'application/pdf', payload.filename);
      const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      pdfUrl = file.getUrl();
    }

    sheet.appendRow([
      new Date(), data.ownerName || '', data.ownerPhone || '', data.ownerEmail || '', data.dogName || '',
      data.serviceType || '', data.startDate || '', data.endDate || '', data.dailyRate || '', data.dailyRateTotal || '',
      data.discountRate || '', data.periodDays || '', data.periodSubtotal || '', data.discountAmount || '', data.periodFinalTotal || '',
      data.paymentMethodOther || data.paymentMethod || '', data.clientStatus || 'Nuovo', data.paymentStatus || 'Da pagare',
      data.gdprConsent || '', data.customerSignatureData ? 'Presente' : '', data.dogsitterSignatureData ? 'Presente' : '',
      data.dogsitterName || '', data.dogsitterOrganizationName || data.dogsitterOrganization || '',
      pdfUrl ? '=HYPERLINK("' + pdfUrl + '";"Apri PDF")' : '', payload.filename || '', JSON.stringify(data)
    ]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true, pdfUrl })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.message })).setMimeType(ContentService.MimeType.JSON);
  }
}
