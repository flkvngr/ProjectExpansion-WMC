/**
 * ============================================================
 * BACKEND untuk potential-property.html (WM Center)
 * ============================================================
 * CARA PASANG:
 * 1. Buka spreadsheet: https://docs.google.com/spreadsheets/d/15MMkE9icBCUpj8GZTlGaJJ9s6Vh0nyccWQ0aITA-69M
 * 2. Menu Extensions -> Apps Script
 * 3. Hapus isi default, paste SELURUH isi file ini
 * 4. Ganti SPREADSHEET_ID di bawah kalau perlu (harusnya sudah otomatis benar
 *    karena kode ini dijalankan DARI DALAM spreadsheet itu sendiri)
 * 5. Klik Deploy -> New deployment -> pilih tipe "Web app"
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 6. Salin URL Web App yang muncul (bentuknya https://script.google.com/macros/s/XXXX/exec)
 * 7. Tempel URL itu ke variabel APPS_SCRIPT_URL di file potential-property.html
 * ============================================================
 */

// ---------- KONFIGURASI ----------
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const TEMPLATE_SHEET_NAME = 'Semarang'; // sheet yang formatnya dipakai sebagai acuan saat bikin kota baru
const GIS_FOLDER_NAME = 'PotentialProperty_GISData'; // folder Drive tempat simpan data grid GIS per kota

// Peta kolom sesuai spesifikasi form (1 = kolom A, dst)
const COLUMN_MAP = {
  gambar: 3,             // C - foto property (base64, hasil kompres di sisi form)
  linkGambar: 4,         // D - link GDrive kumpulan foto
  alamat: 5,             // E - alamat umum
  linkMaps: 6,           // F - link google maps
  linkAgent: 7,          // G - link agent property
  summary: 8,            // H - short summary
  skor: 19,              // S - skor penilaian (opsional)
  hargaSewa: 20,         // T - harga sewa
  deposit: 21,           // U - deposit (opsional)
  luasTanah: 22,         // V - luas tanah (opsional)
  lebarBangunan: 23,     // W - lebar bangunan (opsional)
  panjangBangunan: 24,   // X - panjang bangunan (opsional)
  totalLuasBangunan: 25, // Y - total luas bangunan (opsional)
  jumlahLantai: 26,      // Z - jumlah lantai (opsional)
  kondisiBangunan: 27,   // AA - kondisi bangunan (opsional)
  contactAgent: 32,      // AF - contact agent
  koordinat: 33          // AG - titik koordinat lat,lng
};

const REQUIRED_FIELDS = [
  'gambar', 'linkGambar', 'alamat', 'linkMaps', 'linkAgent', 'summary',
  'hargaSewa', 'contactAgent', 'koordinat'
]; // field wajib (yang opsional di spek tidak dimasukkan sini)

// ---------- ROUTER ----------
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'listSheets') return jsonOut(listCitySheets());
    if (action === 'getData') return jsonOut(getCityData(e.parameter.city));
    if (action === 'getGis') return jsonOut(getGisData(e.parameter.city));
    return jsonOut({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    if (action === 'submitProperty') return jsonOut(submitProperty(body.data));
    if (action === 'uploadGis') return jsonOut(uploadGisData(body.city, body.gridData));
    return jsonOut({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonOut({ success: false, error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- SHEET LIST ----------
function listCitySheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const names = ss.getSheets()
    .map(function (s) { return s.getName(); })
    .filter(function (n) { return n.indexOf('_') !== 0; }); // sheet internal diawali "_" disembunyikan
  return { sheets: names };
}

// ---------- BACA DATA PROPERTI PER KOTA ----------
function getCityData(city) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(city);
  if (!sheet) return { error: 'Sheet kota tidak ditemukan', rows: [] };

  const lastRow = sheet.getLastRow();
  const lastCol = 33; // sampai kolom AG
  if (lastRow < 2) return { rows: [] };

  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const rows = values.map(function (row, idx) {
    const obj = { _row: idx + 2 };
    for (const key in COLUMN_MAP) {
      obj[key] = row[COLUMN_MAP[key] - 1];
    }
    return obj;
  }).filter(function (r) { return r.alamat; }); // baris kosong dilewati

  return { rows: rows };
}

// ---------- SUBMIT FORM (HALAMAN 1) ----------
function submitProperty(data) {
  // validasi field wajib
  const missing = [];
  REQUIRED_FIELDS.forEach(function (key) {
    if (!data[key] || String(data[key]).trim() === '') missing.push(key);
  });
  if (missing.length > 0) {
    return { success: false, error: 'Field wajib belum terisi: ' + missing.join(', ') };
  }
  if (!data.kota || String(data.kota).trim() === '') {
    return { success: false, error: 'Kota belum dipilih' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(data.kota);

  if (!sheet) {
    // kota baru -> duplikat sheet template supaya formatnya sama
    const template = ss.getSheetByName(TEMPLATE_SHEET_NAME);
    if (!template) {
      return { success: false, error: 'Sheet template "' + TEMPLATE_SHEET_NAME + '" tidak ditemukan untuk disalin' };
    }
    sheet = template.copyTo(ss);
    sheet.setName(data.kota);
  }

  const newRow = sheet.getLastRow() + 1;
  for (const key in COLUMN_MAP) {
    if (data[key] !== undefined && data[key] !== '') {
      sheet.getRange(newRow, COLUMN_MAP[key]).setValue(data[key]);
    }
  }

  return { success: true };
}

// ---------- DATA GIS (GRID SKOR HASIL QGIS) ----------
function getGisFolder() {
  const folders = DriveApp.getFoldersByName(GIS_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(GIS_FOLDER_NAME);
}

function getGisData(city) {
  const folder = getGisFolder();
  const files = folder.getFilesByName('gisdata_' + city + '.json');
  if (files.hasNext()) {
    const file = files.next();
    return JSON.parse(file.getBlob().getDataAsString());
  }
  return { available: false };
}

// dipanggil dari mini submission box di halaman 2
function uploadGisData(city, gridData) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(city);
  if (!sheet) {
    return { success: false, error: 'Sheet kota "' + city + '" tidak tersedia di spreadsheet' };
  }

  const folder = getGisFolder();
  const fileName = 'gisdata_' + city + '.json';
  const content = JSON.stringify({ available: true, features: gridData });

  const existing = folder.getFilesByName(fileName);
  if (existing.hasNext()) {
    existing.next().setContent(content);
  } else {
    folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
  }
  return { success: true };
}
