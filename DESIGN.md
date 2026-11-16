# DESIGN.md - Sistem Monitoring Inkubator Telur Entok Pintar (Netesin)

## 1. Identitas & Karakter Produk
- **Nama Sistem**: NETESIN (Sistem Inkubator Telur Entok Pintar Terintegrasi)
- **Konteks Proyek**: Kolaborasi Tiga Mata Kuliah (Internet of Things, Kecerdasan Buatan, dan Teknologi Sistem Terintegrasi)
- **Institusi**: Program Studi Teknologi Informasi, Fakultas Teknik, Universitas Tidar (2026)
- **Karakter Visual**: Industrial-Agricultural Precision Dashboard. Memadukan kehangatan peternakan unggas (kehangatan inkubasi, siklus biologis entok) dengan ketegasan instrumen kendali IoT presisi tinggi dan analitik AI modern.

## 2. Liveliness Dials
- **ENERGY**: 2 (Balanced - dashboard presisi dengan indikator visual dinamis, bukan sekadar tabel data kering)
- **RHYTHM**: 2 (Struktur modular teratur untuk telemetri instrumen, diselingi panel interaktif kontrol aktuator, visualisasi AI, dan diagram topologi sistem terintegrasi)
- **MOTION**: 2 (Transisi halus untuk perubahan status telemetri, rotasi visual kipas, pergerakan sudut kemiringan servo, dan gauge suhu)

## 3. Palet Warna (Color System)
- **Primary / Identity (Emerald Poultry Life)**:
  - Light: `#059669` (Emerald 600)
  - Dark: `#10b981` (Emerald 500)
  - Alasan: Merepresentasikan parameter biologis telur yang optimal, kesehatan embrio, dan ekosistem peternakan modern.
- **Thermal Heat / Warning (Warm Amber)**:
  - Light: `#d97706` (Amber 600)
  - Dark: `#f59e0b` (Amber 500)
  - Alasan: Merepresentasikan lampu pemanas pijar aktif, suhu ruang inkubasi, dan energi termal.
- **Humidity / Moisture (Cool Cyan / Sky)**:
  - Light: `#0284c7` (Sky 600)
  - Dark: `#38bdf8` (Sky 400)
  - Alasan: Merepresentasikan kelembapan relatif (RH%) dan modul humidifier ultrasonic.
- **Alert / Critical (Rose / Crimson)**:
  - Light: `#e11d48` (Rose 600)
  - Dark: `#f43f5e` (Rose 500)
  - Alasan: Menandai anomali sistem (suhu overheat, kelembapan drop, lampu putus).
- **Backgrounds & Surfaces**:
  - Light Mode: Background `#f8fafc` (Slate 50), Card `#ffffff`, Border `#e2e8f0` (Slate 200), Text `#0f172a` (Slate 900)
  - Dark Mode: Background `#090d16` (Deep Obsidian), Card `#131b2e` (Elevated Navy Slate), Border `#1e293b` (Slate 800), Text `#f8fafc` (Slate 50)

## 4. Tipografi
- **Primary Interface**: Inter / System Modern Sans-Serif (`font-sans`) untuk keterbacaan tajam pada metrik dashboard.
- **Telemetry & Instrument Data**: Tabular Monospace (`font-mono`) untuk angka suhu, kelembapan, durasi waktu, dan payload MQTT/JSON agar tidak bergeser saat nilai berfluktuasi.

## 5. Justifikasi Keputusan Desain (R-31 Compliance)
- **Mengapa tab navigasi berdasar 3 matkul + dashboard utama?** Memudahkan dosen penguji mengevaluasi pemenuhan capaian masing-masing mata kuliah (IoT, Kecerdasan Buatan, dan Sistem Terintegrasi) secara terstruktur tanpa saling tumpang tindih.
- **Mengapa ada simulator perangkat keras built-in?** Memungkinkan pengujian menyeluruh dan demonstrasi langsung di ruang sidang tanpa bergantung pada kehadiran perangkat fisik dan jaringan WiFi lokal kampus.
- **Mengapa menyertakan generator firmware ESP32?** Memberikan integrasi nyata ke perangkat keras fisik ESP32 DevKit V1 dengan pinout yang 100% cocok dengan proposal proyek akhir.

