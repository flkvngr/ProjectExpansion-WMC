# Panduan Submit Data GIS Baru — dari Shapefile QGIS

Panduan ini menjelaskan cara mengubah hasil analisis QGIS Anda (2 shapefile:
grid skor kawasan + titik properti potensial) menjadi satu file
`newdata_[NamaKota].html` yang bisa diupload lewat kotak submission di
`masterlist-property.html` (Section 3).

Ada 2 cara: **pakai script Python** (paling akurat, direkomendasikan) atau
**minta AI convert manual** (kalau tidak bisa jalankan Python). Keduanya
menghasilkan file dengan format akhir yang identik.

---

## 1. Yang Anda Butuhkan Sebelum Mulai

Dari hasil analisis QGIS, siapkan **2 shapefile terpisah** (boleh salah satu
saja kalau memang cuma itu yang tersedia):

| Shapefile | Isi | Tipe geometri |
|---|---|---|
| **Grid skor** | Fishnet/grid kawasan dengan skor total per petak | Polygon |
| **Titik potensial** | Titik-titik kandidat lokasi hasil analisis QGIS | Point |

Setiap shapefile sebenarnya adalah **kumpulan beberapa file** — pastikan
semuanya ada dan lengkap dalam satu folder:

```
NamaFile.shp   <- geometri (wajib)
NamaFile.shx   <- index (wajib)
NamaFile.dbf   <- tabel atribut/field (wajib)
NamaFile.prj   <- info sistem koordinat/proyeksi (SANGAT PENTING, jangan sampai hilang)
NamaFile.cpg   <- encoding teks (opsional)
```

**Field yang wajib ada di attribute table:**
- Shapefile grid skor: field numerik berisi skor total per petak (nama field
  bebas, misal `total`, `SKOR_TOTAL`, `skor` — nanti disebutkan saat convert).
- Shapefile titik: tidak wajib ada field khusus, tapi kalau ada field
  nama/label/nomor urut, sebutkan juga supaya ikut tersimpan.

**Soal proyeksi/koordinat**: shapefile dari QGIS biasanya pakai sistem
proyeksi meter (UTM, dsb), BUKAN lat/lng biasa. Ini **wajar dan tidak masalah**
— asal file `.prj` ada, proses convert akan otomatis mendeteksi dan
mengubahnya (reproject) ke lat/lng WGS84 yang dipakai peta web. Jangan pernah
convert manual sistem koordinatnya sendiri sebelum diproses.

---

## 2. Cara A — Pakai Script Python (Direkomendasikan)

### Instalasi (sekali saja)
```bash
pip install pyshp pyproj --break-system-packages
```

### Kode Dasar (`shp_to_gisdata.py`)

Simpan kode ini sebagai file `shp_to_gisdata.py`:

```python
"""
Konverter shapefile (grid skor + titik potensial) -> newdata_[Kota].html
untuk sistem masterlist-property.html WM Center.

Kebutuhan: pip install pyshp pyproj --break-system-packages
"""
import argparse
import json
import os
import sys

try:
    import shapefile
except ImportError:
    sys.exit("Perlu 'pip install pyshp --break-system-packages' dulu.")
try:
    from pyproj import Transformer, CRS
except ImportError:
    sys.exit("Perlu 'pip install pyproj --break-system-packages' dulu.")

MAX_POLYGONS = 2000
MAX_POINTS_PER_POLYGON = 10
MAX_FILE_MB = 2

def get_transformer(prj_path):
    """Baca file .prj, tentukan transformer ke WGS84 (EPSG:4326).
    Kalau sistem koordinat sudah WGS84/lat-lng biasa, transformer di-skip (None)."""
    if not os.path.exists(prj_path):
        print(f"  PERINGATAN: {prj_path} tidak ditemukan, asumsikan sudah lat/lng WGS84.")
        return None
    with open(prj_path) as f:
        wkt = f.read()
    src_crs = CRS.from_wkt(wkt)
    if src_crs.to_epsg() == 4326:
        return None
    print(f"  Proyeksi terdeteksi: {src_crs.name} -> akan direproject ke WGS84 (lat/lng).")
    return Transformer.from_crs(src_crs, "EPSG:4326", always_xy=True)

def read_grid_shapefile(shp_base, score_field):
    """Baca shapefile grid skor (Polygon), kembalikan list fitur GeoJSON-like."""
    sf = shapefile.Reader(shp_base)
    transformer = get_transformer(shp_base + '.prj')

    if score_field not in [f[0] for f in sf.fields[1:]]:
        available = [f[0] for f in sf.fields[1:]]
        sys.exit(f"Field skor '{score_field}' tidak ditemukan. Field yang tersedia: {available}")

    features = []
    for shape, rec in zip(sf.shapes(), sf.records()):
        score = rec[score_field]
        if score is None:
            continue
        # pecah shape.points jadi ring2 sesuai shape.parts (penting utk multipart polygon)
        parts = list(shape.parts) + [len(shape.points)]
        rings = []
        for i in range(len(parts) - 1):
            ring_pts = shape.points[parts[i]:parts[i+1]]
            if transformer:
                ring_pts = [transformer.transform(x, y) for x, y in ring_pts]
            ring_pts = [[round(x, 6), round(y, 6)] for x, y in ring_pts]
            # pastikan ring tertutup (titik awal == titik akhir)
            if ring_pts[0] != ring_pts[-1]:
                ring_pts.append(ring_pts[0])
            rings.append(ring_pts)

        features.append({
            "type": "Feature",
            "properties": {"total": round(float(score), 2)},
            "geometry": {"type": "Polygon", "coordinates": rings}
        })
    return features

def read_points_shapefile(shp_base, name_field=None):
    """Baca shapefile titik properti potensial (Point), kembalikan list fitur GeoJSON-like."""
    sf = shapefile.Reader(shp_base)
    transformer = get_transformer(shp_base + '.prj')

    features = []
    for shape, rec in zip(sf.shapes(), sf.records()):
        x, y = shape.points[0]
        if transformer:
            lng, lat = transformer.transform(x, y)
        else:
            lng, lat = x, y
        props = {"kategori": "potential_point"}
        if name_field:
            rec_dict = rec.as_dict()
            if name_field in rec_dict:
                props["nama"] = str(rec_dict[name_field])
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": {"type": "Point", "coordinates": [round(lng, 6), round(lat, 6)]}
        })
    return features

def validate(features):
    polygons = [f for f in features if f["geometry"]["type"] == "Polygon"]
    points = [f for f in features if f["geometry"]["type"] == "Point"]
    warnings = []
    if len(polygons) > MAX_POLYGONS:
        warnings.append(
            f"Jumlah polygon ({len(polygons)}) melebihi batas {MAX_POLYGONS}. "
            f"WAJIB disederhanakan dulu di QGIS (perbesar ukuran sel fishnet, atau Dissolve "
            f"sel bertetangga dengan skor sama) sebelum lanjut."
        )
    for f in polygons:
        n_pts = len(f["geometry"]["coordinates"][0])
        if n_pts > MAX_POINTS_PER_POLYGON:
            warnings.append(
                f"Ada polygon dengan {n_pts} titik koordinat (lebih dari batas {MAX_POINTS_PER_POLYGON}). "
                f"Bentuk grid idealnya kotak sederhana (4-6 titik)."
            )
            break
    return polygons, points, warnings

def build_html(features, kota):
    json_text = json.dumps(features, separators=(',', ':'))
    return (
        "<!DOCTYPE html>\n<html>\n<body>\n"
        "/* GISDATA_START */\n"
        + json_text + "\n"
        "/* GISDATA_END */\n"
        "</body>\n</html>\n"
    )

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--grid', help='Path .shp grid skor (tanpa/dengan ekstensi .shp)')
    ap.add_argument('--grid-field', default='total', help='Nama field skor total di shapefile grid (default: total)')
    ap.add_argument('--points', help='Path .shp titik properti potensial (opsional)')
    ap.add_argument('--points-name-field', default=None, help='Nama field label/nama di shapefile titik (opsional)')
    ap.add_argument('--kota', required=True, help='Nama kota, HARUS PERSIS sama dengan nama sheet di spreadsheet')
    ap.add_argument('--out', default=None, help='Nama file output (default: newdata_[Kota].html)')
    args = ap.parse_args()

    if not args.grid and not args.points:
        sys.exit("Minimal harus ada salah satu: --grid atau --points")

    features = []
    if args.grid:
        grid_base = args.grid[:-4] if args.grid.lower().endswith('.shp') else args.grid
        print(f"Membaca grid skor: {grid_base}.shp (field: {args.grid_field})")
        grid_features = read_grid_shapefile(grid_base, args.grid_field)
        print(f"  -> {len(grid_features)} polygon dibaca.")
        features += grid_features

    if args.points:
        pts_base = args.points[:-4] if args.points.lower().endswith('.shp') else args.points
        print(f"Membaca titik potensial: {pts_base}.shp")
        pt_features = read_points_shapefile(pts_base, args.points_name_field)
        print(f"  -> {len(pt_features)} titik dibaca.")
        features += pt_features

    polygons, points, warnings = validate(features)
    for w in warnings:
        print(f"  PERINGATAN: {w}")

    out_name = args.out or f"newdata_{args.kota}.html"
    html = build_html(features, args.kota)
    with open(out_name, 'w') as f:
        f.write(html)

    size_mb = len(html.encode('utf-8')) / 1024 / 1024
    print(f"\nSelesai: {out_name}")
    print(f"  {len(polygons)} polygon, {len(points)} titik, ukuran {size_mb:.2f} MB")
    if size_mb > MAX_FILE_MB:
        print(f"  PERINGATAN: ukuran file melebihi batas {MAX_FILE_MB} MB.")
    if not warnings and size_mb <= MAX_FILE_MB:
        print("  Semua validasi lolos, siap diupload.")

if __name__ == '__main__':
    main()
```

### Cara Menjalankan

```bash
# Dengan grid + titik sekaligus:
python3 shp_to_gisdata.py \
  --grid GridSkorSemarang.shp --grid-field SKOR_TOTAL \
  --points TitikPotensialSemarang.shp --points-name-field Name \
  --kota Semarang

# Cuma grid saja:
python3 shp_to_gisdata.py --grid GridSkorBali.shp --grid-field total --kota Bali

# Cuma titik saja:
python3 shp_to_gisdata.py --points TitikBali.shp --kota Bali
```

Ganti `--kota` dengan nama sheet yang **persis sama** dengan tab di
spreadsheet (case-sensitive). Hasilnya otomatis bernama
`newdata_[Kota].html`, langsung siap upload.

Script ini otomatis:
- Mendeteksi & mengonversi sistem proyeksi apapun ke lat/lng WGS84
- Menutup ring polygon yang belum tertutup
- Menangani polygon multipart (poligon dengan lubang/beberapa bagian)
- Memvalidasi jumlah polygon (maks 2.000) dan ukuran file (maks 2 MB)
- Membungkus hasil dengan format `/* GISDATA_START */ ... /* GISDATA_END */`

---

## 3. Cara B — Minta AI Convert (kalau tidak bisa jalankan Python)

Kalau tidak memungkinkan menjalankan script sendiri, lampirkan kedua
shapefile (semua file pendukungnya, zip jadi satu) ke AI (Claude/ChatGPT/dst)
dan salin-tempel prompt ini:

> **Tugas Anda**: saya lampirkan 1-2 shapefile (masing-masing terdiri dari
> file .shp/.shx/.dbf/.prj) — satu shapefile grid skor kawasan (Polygon) dan
> satu shapefile titik properti potensial (Point). Baca file `.prj` masing-
> masing untuk tahu sistem proyeksinya, lalu **reproject semua koordinat ke
> WGS84 (EPSG:4326, lat/lng biasa)** — jangan biarkan dalam meter/UTM.
>
> Gabungkan keduanya jadi SATU array JSON dengan format:
> - Fitur dari shapefile grid → `{"type":"Feature","properties":{"total": <angka skor>},"geometry":{"type":"Polygon","coordinates":[[[lng,lat],...]]}}`
>   (ring polygon harus tertutup: titik pertama = titik terakhir)
> - Fitur dari shapefile titik → `{"type":"Feature","properties":{"kategori":"potential_point","nama":"<isi field nama/label jika ada>"},"geometry":{"type":"Point","coordinates":[lng,lat]}}`
>
> Bungkus array itu dalam file HTML bernama `newdata_[NamaKota].html`:
> ```html
> <!DOCTYPE html><html><body>
> /* GISDATA_START */
> [ ...array gabungan tadi... ]
> /* GISDATA_END */
> </body></html>
> ```
>
> **Batasan wajib**: kalau jumlah polygon dari shapefile grid lebih dari
> 2.000, sederhanakan dulu (gabungkan sel bertetangga dengan skor sama)
> sebelum dikonversi — jangan diekspor mentah-mentah. Tiap polygon idealnya
> maksimal ~10 titik koordinat. Laporkan ke saya jumlah polygon dan titik
> yang berhasil dikonversi, plus sistem proyeksi asli yang terdeteksi,
> sebelum memberi saya file finalnya.

---

## 4. Struktur Akhir yang Diharapkan Sistem

```html
<!DOCTYPE html>
<html><body>
/* GISDATA_START */
[
  {
    "type": "Feature",
    "properties": { "total": 25.5 },
    "geometry": { "type": "Polygon", "coordinates": [[[110.40,-6.98],[110.41,-6.98],[110.41,-6.99],[110.40,-6.99],[110.40,-6.98]]] }
  },
  {
    "type": "Feature",
    "properties": { "kategori": "potential_point", "nama": "1" },
    "geometry": { "type": "Point", "coordinates": [110.4209,-6.9773] }
  }
]
/* GISDATA_END */
</body></html>
```

| Aturan | Nilai |
|---|---|
| Nama file | `newdata_[NamaKota].html` (persis nama sheet, case-sensitive) |
| Koordinat | `[longitude, latitude]` — lng dulu, WAJIB WGS84 (bukan UTM/meter) |
| Fitur grid | `geometry.type: "Polygon"`, wajib ada `properties.total` |
| Fitur titik | `geometry.type: "Point"`, wajib ada `properties.kategori: "potential_point"` |
| Ring polygon | Harus tertutup (titik pertama = titik terakhir) |
| Maks jumlah polygon | 2.000 |
| Maks titik per polygon | ~10 (idealnya kotak sederhana 4-6 titik) |
| Maks ukuran file | 2 MB |

---

## 5. Setelah File Jadi

1. Buka `masterlist-property.html`, scroll ke kotak "Update data analisis GIS".
2. Upload file `newdata_[Kota].html` yang sudah jadi.
3. Sistem otomatis validasi: format file, nama sesuai sheet, struktur data.
4. Kalau berhasil, data **hanya menimpa kota tersebut** — kota lain tidak
   ikut berubah — dan peta langsung ter-update tanpa perlu refresh.

---

## 6. Troubleshooting Umum

| Gejala | Kemungkinan Penyebab |
|---|---|
| Popup "tidak sesuai" soal marker/format | Cek lagi struktur JSON, biasanya ring polygon belum tertutup atau tipe geometri salah tulis |
| Titik/grid muncul di lokasi yang salah total (misal di lautan/luar negeri) | Proyeksi belum ke-reproject ke WGS84 — cek file `.prj` ikut disertakan saat convert |
| Popup "kota tidak ditemukan" | Nama di `--kota` / nama file beda dengan nama sheet (cek huruf besar/kecil) |
| Upload lama sekali / gagal | Kemungkinan besar jumlah polygon kelewat banyak — cek pesan warning dari script, sederhanakan grid dulu di QGIS |
