# Panduan: Format File "newdata_[nama kota].html"

File ini dipakai untuk instruksi ke AI (Claude/ChatGPT/dst) setiap kali Anda
ingin convert hasil analisis QGIS baru menjadi file yang bisa di-upload lewat
mini submission box di potential-property.html (halaman 2).

## Aturan wajib

1. **Nama file**: `newdata_[NamaKota].html`
   Contoh: `newdata_Bandung.html`, `newdata_Surabaya.html`
   `[NamaKota]` HARUS persis sama dengan nama sheet tab di spreadsheet
   (case-sensitive: "Bandung" ≠ "bandung").

2. **Isi file** wajib memuat dua penanda berikut, dengan sebuah JSON array
   di antaranya:

   ```html
   <!DOCTYPE html>
   <html>
   <body>
   /* GISDATA_START */
   [
     {
       "type": "Feature",
       "properties": {
         "jalan": 8,
         "transum": 6,
         "intersection": 7,
         "healthcare": 5,
         "cbd_titik": 9,
         "pusat_kegiatan": 7,
         "wilayah_cbd": 8,
         "perumahan_elit": 6,
         "total": 56
       },
       "geometry": {
         "type": "Polygon",
         "coordinates": [
           [
             [110.410, -6.990],
             [110.415, -6.990],
             [110.415, -6.995],
             [110.410, -6.995],
             [110.410, -6.990]
           ]
         ]
       }
     }
   ]
   /* GISDATA_END */
   </body>
   </html>
   ```

3. **Setiap elemen array** = satu petak grid (poligon) hasil fishnet QGIS,
   dengan:
   - `properties.total`: skor total petak itu (WAJIB, ini yang dipakai
     untuk mencocokkan skor properti)
   - properti lain (`jalan`, `transum`, dst) bebas menyesuaikan faktor yang
     dipakai dalam analisis Anda — tidak wajib sama persis, hanya `total`
     yang wajib ada.
   - `geometry.coordinates` mengikuti format standar GeoJSON Polygon:
     array of rings, tiap ring adalah array titik `[longitude, latitude]`
     (urutan **lng dulu, baru lat** — kebalikan dari format koordinat form
     yang lat dulu).

4. **Koordinat harus urut menutup poligon** (titik pertama = titik terakhir).

5. **Batas ukuran — WAJIB dipatuhi**, ini penyebab #1 kenapa upload gagal
   diam-diam kalau dilanggar:

   | Batas | Nilai maksimum |
   |---|---|
   | Jumlah polygon (grid cell) | **± 2.000 cell** |
   | Ukuran file `.html` | **± 2 MB** |
   | Jumlah titik koordinat per polygon | **± 10 titik** (idealnya 4–6, kotak sederhana) |

   Kalau hasil convert dari QGIS melebihi ini (misalnya puluhan ribu cell
   atau file sampai puluhan MB), **jangan langsung diupload** — google Apps
   Script yang jadi backend sistem ini punya batas waktu eksekusi ~6 menit
   dan batas ukuran payload; file yang kegedean akan bikin proses upload
   macet/time-out tanpa pesan error yang jelas ke Anda.

## Cara menyederhanakan grid sebelum convert (kalau kelebihan batas)

Penyebab paling umum file jadi raksasa: ukuran sel fishnet di QGIS dibuat
terlalu kecil/detail, atau grid diekspor mentah tanpa digabung dulu. Dua
cara memperbaikinya di QGIS **sebelum** export ke AI untuk di-convert:

- **Perbesar ukuran sel fishnet** — kalau sekarang sel-nya misal 20m x 20m
  dan menghasilkan puluhan ribu sel, coba perbesar ke 100–200m x 100–200m.
  Untuk keperluan screening lokasi cabang, grid sekasar ini biasanya sudah
  cukup — tidak perlu presisi sampai level meter.
- **Dissolve sel bertetangga dengan skor sama** — pakai tool *Dissolve*
  QGIS (`Vector → Geoprocessing Tools → Dissolve`) dengan field `total`
  sebagai basis penggabungan, supaya sel-sel bersebelahan yang skornya
  identik jadi satu polygon besar, bukan ratusan polygon kecil terpisah.

Setelah disederhanakan, baru hasilnya di-export (misal ke `.geojson`) dan
dikasih ke AI untuk di-convert jadi `newdata_[kota].html` pakai prompt di
bawah.

## Prompt siap-pakai untuk AI

Salin-tempel ini ke AI bersama file hasil export QGIS Anda (misal .geojson
atau atribut tabel shapefile):

> "Tolong ubah data grid skor properti ini menjadi satu file HTML bernama
> newdata_[NamaKota].html. Isi file harus memuat blok komentar
> `/* GISDATA_START */` diikuti sebuah JSON array dari fitur GeoJSON Polygon
> (masing-masing punya `properties.total` sebagai skor total petak),
> ditutup dengan `/* GISDATA_END */`. Format koordinat: [longitude, latitude]
> per titik, ring poligon harus tertutup (titik awal = titik akhir).
> **Batasan wajib: total polygon dalam array tidak boleh lebih dari 2.000
> buah, dan tiap polygon maksimal punya sekitar 10 titik koordinat (idealnya
> bentuk kotak sederhana 4-6 titik). Kalau data sumber saya lebih detail dari
> itu, sederhanakan/gabungkan dulu sel-sel yang berdekatan dan punya skor
> sama sebelum dikonversi, jangan diekspor mentah-mentah.**"

## Cara cek sebelum upload (tanpa perlu coba-coba)

1. Cek ukuran file di file explorer — kalau lebih dari ±2 MB, kemungkinan
   besar kegedean.
2. Buka file dengan text editor, cari `/* GISDATA_START */`, hitung kira-kira
   berapa banyak kemunculan `"type":"Feature"` — kalau ribuan/puluhan ribu,
   perlu disederhanakan dulu sebelum upload.

## Kenapa harus seperti ini?

Sistem di potential-property.html/2 membaca file yang di-upload dengan cara
mencari teks di antara kedua penanda tadi, lalu langsung di-parse sebagai
JSON di browser, dikirim ke Google Apps Script, lalu disimpan ke Google
Drive. Selama formatnya konsisten **dan ukurannya wajar**, AI apapun yang
Anda pakai untuk convert hasil QGIS akan selalu menghasilkan file yang bisa
langsung dibaca sistem tanpa penyesuaian manual maupun risiko macet.
