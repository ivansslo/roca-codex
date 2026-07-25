# Google Maps Platform — Isochrones API (Screenshot Analysis)

> Screenshot: `Web Services > Isochrones API`, Bahasa Indonesia translation, Preview (pre-GA)

## Apa itu Isochrones API?

**Isochrones API** menghitung **area yang dapat dijangkau dalam waktu atau jarak tertentu** dari titik awal.

Contoh: 
- "Area mana yang bisa dijangkau dalam 15 menit dengan mobil dari Kantor Jakarta?"
- "Coverage 30 menit jalan kaki dari ATM BCA?"
- Polygon geo yang dihasilkan = isochrone.

Ini beda dari Distance Matrix (yang hitung point-to-point). Isochrones = **area/region**.

**Travel modes:** driving, walking, cycling, transit (tergantung support).

**Use cases:**
- Service coverage planning (bank branch, klinik, logistic hub)
- Emergency response radius
- Delivery zone mapping
- Store catchment area
- Urban planning & risk analysis
- Incident blast radius

## Penjelasan Screenshot (Detail)

Header:
```
Google Maps Platform
Web Services > Isochrones API
Mulai | Hubungi bagian penjualan
```

Preview Notice (kuning/pink box di screenshot):
```
Pratinjau: Produk atau fitur ini berada dalam status Pratinjau pra-GA. 
Produk dan fitur pra-GA mungkin memiliki dukungan terbatas, 
dan perubahan pada produk serta fitur pra-GA mungkin tidak kompatibel 
dengan versi pra-GA lainnya. Penawaran Pra-GA tercakup dalam 
Persyaratan Khusus Layanan Google Maps Platform.
```
Artinya: **Belum GA (General Availability)** — masih beta/preview, breaking changes bisa terjadi, SLA/support limited. Hati-hati kalau pakai production.

Translation Notice:
```
translated by Google — Google uses AI technology to translate...
Switch to English
```
Kamu lihat versi Bahasa Indonesia auto-translate.

Breadcrumb:
`Beranda > Produk > Google Maps Platform > Dokumentasi > Web Services > Isochrones API`

Title:
`Menyiapkan Isochrones API`

Collapsed Box:
`Developer Wilayah Ekonomi Eropa (EEA)` — kalau developer/customer di EEA, ada Terms khusus Google Maps Platform EEA (data residency, consent).

Intro:
`Dokumen ini menjelaskan langkah-langkah yang diperlukan untuk mulai menggunakan Isochrones API.`

3 Cards:
```
1. Akun dan penagihan
   Pastikan Anda memenuhi prasyarat.

2. Aktifkan API
   Aktifkan API di project Google Cloud Anda.

3. Membuat permintaan
   Konfigurasi kunci API atau OAuth untuk membuat permintaan API yang terautentikasi.
```

## Cara Kerja (Technical)

Typical request (English endpoint, belum GA jadi cek docs terbaru):

```
POST https://routes.googleapis.com/v1/computeIschrone
Headers:
  X-Goog-Api-Key: YOUR_API_KEY
  X-Goog-FieldMask: ...

Body:
{
  "origin": { "location": { "latLng": { "latitude": -6.2, "longitude": 106.8 } } },
  "travelMode": "DRIVE",
  "routeModifiers": { ... },
  "timeLimit": "1800s", // 30 minutes
  "distanceLimit": "5000" // optional meters
}
```

Response: GeoJSON polygon(s) reachable area.

**Quota & Pricing:** Pay per request, likely Maps Platform SKU.

## Relevansi dengan Kerjaan Google Threat Intel & RocSpace

Untuk CTI:
- **Scam call-center reachability:** map area 30-min drive dari suspected call-center, overlay with telco tower
- **Logistics of fraud parcel:** mapping delivery reach dari warehouse ilegal
- **Client site visit planning:** onsite 3 days/week di Jakarta — Isochrones bisa hitung which client sites reachable within 45 min transit from your base — optimize route
- **Incident response radius:** kalau ada breach di data center, hitung area terdampak / responder coverage

Untuk `rocagents` integration idea:

```ts
// tool: google_maps_isochrones_mapper
// input: lat, lng, minutes, mode
// action: fetch isochrone polygon → store in Grafana + overlay with threat infra IPs

// Example: map 15/30/45 min driving isochrones from Jakarta client office
// Combine with scam infra ASN geolocation to see clustering
```

Code sketch:
```ts
async function getIsochrone(lat: number, lng: number, seconds: number) {
  const res = await fetch(`https://routes.googleapis.com/v1:computeIschrone`, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: lat, longitude: lng } } },
      travelMode: "DRIVE",
      timeLimit: `${seconds}s`
    })
  });
  return res.json();
}
```

Add to `.env`: `GOOGLE_MAPS_API_KEY=...`
Add endpoint: `/api/maps/isochrones` → tool `isochrones_threat_geo_mapper`
Add Grafana panel: Geomap with isochrone polygons + threat markers.

## Kenapa Muncul di Flow Kamu?

Kamu sudah apply Google job (Threat Intel Mandiant). Google Maps Platform Isochrones API docs mungkin terkait riset kamu untuk:
- Anti-abuse geospatial clustering
- Location intelligence for scam infra
- Atau sekadar explore Google Cloud products for RocSpace location features

Both are strategically aligned.

---

Next: Kalau mau saya implement full `isochrones_threat_geo_mapper` tool + UI map overlay di rocagents, bilang aja — siap build.
