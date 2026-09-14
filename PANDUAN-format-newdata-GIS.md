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

## Prompt siap-pakai untuk AI

Salin-tempel ini ke AI bersama file hasil export QGIS Anda (misal .geojson
atau atribut tabel shapefile):

> "Tolong ubah data grid skor properti ini menjadi satu file HTML bernama
> newdata_[NamaKota].html. Isi file harus memuat blok komentar
> `/* GISDATA_START */` diikuti sebuah JSON array dari fitur GeoJSON Polygon
> (masing-masing punya `properties.total` sebagai skor total petak),
> ditutup dengan `/* GISDATA_END */`. Format koordinat: [longitude, latitude]
> per titik, ring poligon harus tertutup (titik awal = titik akhir)."

## Kenapa harus seperti ini?

Sistem di potential-property.html/2 membaca file yang di-upload dengan cara
mencari teks di antara kedua penanda tadi, lalu langsung di-parse sebagai
JSON. Selama formatnya konsisten seperti ini, AI apapun yang Anda pakai
untuk convert hasil QGIS akan selalu menghasilkan file yang bisa langsung
dibaca sistem tanpa penyesuaian manual.
