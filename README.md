# NETESIN - Smart Incubator System
### Rancang Bangun Sistem Inkubator Telur Entok Otomatis Berbasis ESP32, Kecerdasan Buatan, dan Platform Terintegrasi

Proyek Akhir Kolaborasi Tiga Mata Kuliah:
1. **Internet of Things (IoT)**
2. **Kecerdasan Buatan (Artificial Intelligence)**
3. **Teknologi Sistem Terintegrasi**

**Program Studi Teknologi Informasi, Fakultas Teknik, Universitas Tidar (2026)**
- **Penyusun**:
  - Muhammad Ramdhan (NPM: 2420506027)
  - Hakkan Azrul Suseno (NPM: 2420506029)
- **Dosen Pengampu**: Muhamad Maksum Hidayat, S.Kom., M.Kom.

---

## 📌 Ringkasan Sistem
**NETESIN** adalah sistem pemantauan dan pengendalian inkubator telur entok (*Cairina moschata*) otomatis berbasis mikrokontroler **ESP32 DevKit V1**, dilengkapi algoritma **Kecerdasan Buatan (AI)** untuk evaluasi probabilitas penetasan (*Hatching Success Index*), deteksi anomali kegagalan fisik perangkat (*Predictive Maintenance*), kendali iklim mikro adaptif fase 35 hari entok, serta arsitektur **Sistem Terintegrasi** dua arah menggunakan protokol **MQTT (HiveMQ)**, **HTTP REST API**, **WebSocket**, dan sinkronisasi basis data eksternal.

---

## 🏗️ Arsitektur Sistem Terintegrasi

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       NETESIN - SMART INCUBATOR SYSTEM                      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
     ┌─────────────────────────────────┼────────────────────────────────┐
     ▼                                 ▼                                ▼
[1. LAYER EDGE IoT]         [2. KECERDASAN BUATAN]         [3. SISTEM TERINTEGRASI]
• ESP32 DevKit V1 (30 Pin)  • Model Prediksi Daya Tetas    • Multi-Tier Gateway Architecture
• DS18B20 (GPIO 5: Suhu)      (Hatching Success Index %)   • Broker MQTT (HiveMQ Public)
• DHT22 (GPIO 4: Suhu & RH) • Adaptive Fuzzy Climate       • REST API & WebSocket Real-time
• Relay Lampu (GPIO 26)       (Siklus 35 Hari Entok)       • Cloud DB Sync (Firebase/Supabase)
• Fan DC 6010 (GPIO 25)     • Anomaly Detection Engine     • Webhook Telegram Bot Alert
• Humidifier 5V (GPIO 27)   • Computer Vision Candling     • Audit Telemetri & Export CSV
• Servo SG90 (GPIO 18)      • AI Chatbot Konsultan
• Buzzer & OLED Display
```

---

## ⚡ Skema Pinout Perangkat Keras (ESP32 DevKit V1)

| Komponen Fisik | Pin Komponen | Pin ESP32 | Sinyal / Peran |
|---|---|---|---|
| **Sensor DHT22 / AM2302** | DATA | **GPIO 4** | Input Digital (Suhu & Kelembapan Udara) |
| **Sensor DS18B20 Waterproof** | DATA | **GPIO 5** | Input OneWire Digital (Suhu Inti Telur) |
| **Modul Relay 1 (Lampu Pijar 5W)** | IN 1 | **GPIO 26** | Output Digital Pemanas (*Active LOW*) |
| **Modul Relay 2 (Humidifier Ultrasonic)** | IN 2 | **GPIO 27** | Output Digital Pengkabut 5V (*Active LOW*) |
| **Modul Relay 3 (Fan DC 6010 12V)** | IN 3 | **GPIO 25** | Output Digital Sirkulasi Udara (*Active LOW*) |
| **Motor Servo SG90** | Signal | **GPIO 18** | Output PWM (Pembalik Telur Tilting Grid) |
| **Buzzer Aktif** | Signal | **GPIO 14** | Output Audio Alarm Kondisi Abnormal |
| **OLED 0.96" I2C** | SDA / SCL | **GPIO 21 / 22** | Display Lokal Miniatur (I2C) |

---

## 🧠 Modul Kecerdasan Buatan (AI)
1. **Hatching Success Index (HSI) Predictor**:
   - Mengevaluasi kestabilan suhu, kepatuhan kelembapan, rasio pembalikan telur, dan stres lingkungan dari riwayat telemetri.
2. **Adaptive Fuzzy Climate Controller (Siklus 35 Hari Telur Entok)**:
   - **Fase Awal (Hari 1 - 14)**: Target 37.8°C, RH 58-62%, servo tilt 4 jam sekali.
   - **Fase Pertumbuhan & Cooling (Hari 15 - 29)**: Target 37.5°C, RH 62-68%, pendinginan 15 menit/hari.
   - **Fase Kritis / Lockdown (Hari 30 - 35)**: Target 37.2°C, RH 75-80%, servo wajib dimatikan (0° datar) untuk mencegah disorientasi embrio saat memecah kerabang.
3. **Real-time Anomaly Detection**:
   - Mendeteksi lampu putus (*thermal inertia defect*), pintu terbuka, air humidifier habis, dan sensor drift.
4. **Computer Vision Candling Simulator**:
   - Analisis citra peneropongan telur untuk mengidentifikasi fertilitas, jaringan vaskular laba-laba, dan cincin darah (*blood ring*).
5. **AI Consultant Chatbot**:
   - Asisten konsultasi diagnosis masalah penetasan berbasis aturan pakar unggas.

---

## 🚀 Cara Menjalankan Aplikasi Web

### Prasyarat
- [Node.js](https://nodejs.org/) (versi 18 ke atas)
- Web Browser modern (Chrome / Edge / Firefox)

### Instalasi & Menjalankan
1. Clone repositori:
   ```bash
   git clone https://github.com/ilyasaa2/Netesin.git
   cd Netesin
   ```
2. Pasang dependensi:
   ```bash
   npm install
   ```
3. Jalankan server:
   ```bash
   npm start
   ```
   *(Atau klik ganda file `jalankan.bat` pada Windows)*.
4. Buka peramban di:
   ```
   http://localhost:3100
   ```

---

## 📂 Struktur Direktori Proyek
```
Netesin/
├── data/                       # Penyimpanan lokal persistent (app_data.json)
├── esp32_firmware/             # Kode sumber Arduino C++ ESP32
│   ├── InkubatorEntok_ESP32/        # Versi HTTP REST Client
│   └── InkubatorEntok_ESP32_Merged.ino # Versi Hybrid MQTT HiveMQ + Sensor
├── lib/
│   ├── ai-engine.js            # Engine Kecerdasan Buatan (HSI, Anomali, Fuzzy)
│   ├── db.js                   # Database Manager & Cloud Sync
│   ├── firmware-template.js    # Generator Kode Firmware ESP32
│   ├── iot-simulator.js        # Simulator Termodinamika & Virtual ESP32
│   └── mqtt-client.js          # Jembatan MQTT ke Broker HiveMQ
├── public/                     # Tampilan Antarmuka Web Dashboard
│   ├── css/style.css           # Styling Modern Dark/Light Theme
│   ├── img/prototype.jpg       # Foto Miniatur Prototipe Fisik
│   ├── js/app.js               # Frontend Controller & WebSocket Client
│   ├── js/chart.umd.min.js     # Bundle Chart.js Offline
│   └── index.html              # Dashboard Web Utama
├── DESIGN.md                   # Panduan & Justifikasi Desain
├── jalankan.bat                # Shortcut Peluncur Cepat Windows
├── package.json
└── README.md
```

---

## 📄 Lisensi & Hak Cipta
Dikembangkan untuk keperluan Proyek Akhir Mahasiswa Program Studi Teknologi Informasi, Universitas Tidar, 2026.
