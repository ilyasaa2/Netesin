/**
 * server.js
 * Server Gateway Terintegrasi NETESIN
 * Proyek Akhir Kolaborasi 3 Matkul:
 * 1. Internet of Things (IoT)
 * 2. Kecerdasan Buatan (AI)
 * 3. Teknologi Sistem Terintegrasi
 *
 * Peneliti: Hakkan Azrul Suseno & Muhammad Ramdhan (Universitas Tidar 2026)
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

// Muat variabel lingkungan (.env) jika file tersedia
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
    console.log('[ENV] Berhasil memuat konfigurasi dari .env');
  }
} catch (e) {
  console.warn('[ENV] Catatan:', e.message);
}

const aiEngine = require('./lib/ai-engine');
const IoTSimulator = require('./lib/iot-simulator');
const db = require('./lib/db');
const { generateFirmwareCode } = require('./lib/firmware-template');
const MqttBridge = require('./lib/mqtt-client');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3100;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inisialisasi Simulator IoT
const iotSim = new IoTSimulator(aiEngine);

// Sinkronkan hari aktif dari database ke simulator
const activeBatch = db.getActiveBatch();
if (activeBatch && activeBatch.currentDay) {
  iotSim.currentDay = activeBatch.currentDay;
}

// Broadcast WebSocket ke semua client web yang terhubung
function broadcastWebSocket(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Inisialisasi Jembatan MQTT ke Broker HiveMQ (Mendukung Kode ESP32 Lama & Baru)
const mqttBridge = new MqttBridge(iotSim, aiEngine, db, broadcastWebSocket);

// Timer periodik (setiap 1 detik): Evaluasi status, AI, & Broadcast ke web client
setInterval(() => {
  const state = iotSim.getState();

  // Watchdog koneksi ESP32 Fisik: jika tidak ada kiriman data lebih dari 15 detik, beralih ke standby/simulator
  if (state.hardware_source === 'PHYSICAL_ESP32') {
    const timeSinceLast = Date.now() - (iotSim.lastPhysicalTime || 0);
    if (timeSinceLast > 15000) {
      iotSim.deviceState.hardware_source = 'SIMULATOR';
      console.warn(`[WATCHDOG ESP32] Lebih dari 15 detik tidak ada data telemetri, otomatis standby.`);
    }
  }

  const history = db.getTelemetryHistory(60);

  // Jalankan AI Analisis Real-time
  const aiHealth = aiEngine.calculateHatchingHealth(history, state.currentDay, state.totalTurnsDone, state.expectedTurns);
  const anomalies = aiEngine.detectAnomalies(state, history);

  // Catat anomali berstatus CRITICAL (dengan deduplikasi otomatis di db.logAlert)
  if (anomalies.length > 0) {
    anomalies.forEach(anomaly => {
      if (anomaly.severity === "CRITICAL") {
        db.logAlert({
          type: anomaly.id,
          title: anomaly.title,
          message: anomaly.message,
          severity: anomaly.severity
        });
      }
    });
  }

  // Rekam riwayat simulasi hanya jika mode SIMULATOR (data fisik direkam langsung saat tiba)
  if (state.hardware_source === 'SIMULATOR') {
    db.addTelemetryRecord({
      timestamp: new Date().toISOString(),
      temp_ds18b20: state.temp_ds18b20,
      temp_dht22: state.temp_dht22,
      humidity: state.humidity,
      heater: state.heater,
      fan: state.fan,
      humidifier: state.humidifier,
      servo_angle: state.servo_angle,
      buzzer: state.buzzer
    });
  }

  // Sinkronisasi berkala ke Database Eksternal Cloud Supabase (setiap 10 detik jika diaktifkan)
  if (state.uptime_seconds % 10 === 0) {
    db.syncToExternalDatabase(state);
  }

  // Paket data streaming ke frontend web secara real-time
  const livePacket = {
    type: "TELEMETRY_UPDATE",
    timestamp: new Date().toISOString(),
    state,
    aiHealth,
    anomalies,
    activeBatch: db.getActiveBatch()
  };

  broadcastWebSocket(livePacket);
}, 1000);

// WebSocket Handler
wss.on('connection', (ws) => {
  // Kirim initial state saat client baru tersambung
  const state = iotSim.getState();
  const history = db.getTelemetryHistory(40);
  const aiHealth = aiEngine.calculateHatchingHealth(history, state.currentDay, state.totalTurnsDone, state.expectedTurns);
  const anomalies = aiEngine.detectAnomalies(state, history);

  ws.send(JSON.stringify({
    type: "INITIAL_STATE",
    state,
    aiHealth,
    anomalies,
    activeBatch: db.getActiveBatch(),
    history: db.getTelemetryHistory(50),
    alerts: db.getAlertsLog(10)
  }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === "CONTROL_COMMAND") {
        iotSim.setActuatorControl(parsed.controls);
        mqttBridge.publishControl(parsed.controls);
      }
    } catch (e) {
      console.error("Kesalahan parsing WS pesan:", e.message);
    }
  });
});

// ======================= REST API ENDPOINTS =======================

/**
 * Endpoint Ingesti Telemetri dari ESP32 Fisik (HTTP POST)
 */
app.post('/api/telemetry', (req, res) => {
  const payload = req.body;
  if (!payload || Object.keys(payload).length === 0) {
    return res.status(400).json({ error: "Payload kosong" });
  }

  // 1. Ingest ke IoT Simulator (mengalihkan ke mode PHYSICAL_ESP32)
  iotSim.ingestPhysicalTelemetry(payload);

  const state = iotSim.getState();

  // 2. Simpan rekaman telemetri langsung ke riwayat DB
  db.addTelemetryRecord({
    timestamp: new Date().toISOString(),
    temp_ds18b20: state.temp_ds18b20,
    temp_dht22: state.temp_dht22,
    humidity: state.humidity,
    heater: state.heater,
    fan: state.fan,
    humidifier: state.humidifier,
    servo_angle: state.servo_angle,
    buzzer: state.buzzer,
    hardware_source: 'PHYSICAL_ESP32'
  });

  // 3. Evaluasi AI & Anomali
  const history = db.getTelemetryHistory(60);
  const aiHealth = aiEngine.calculateHatchingHealth(history, state.currentDay, state.totalTurnsDone, state.expectedTurns);
  const anomalies = aiEngine.detectAnomalies(state, history);

  // 4. Broadcast real-time langsung ke semua client web via WebSocket!
  broadcastWebSocket({
    type: "TELEMETRY_UPDATE",
    timestamp: new Date().toISOString(),
    state,
    aiHealth,
    anomalies,
    activeBatch: db.getActiveBatch()
  });

  // 5. Sinkronisasi data ESP32 fisik secara real-time ke Supabase (jika diaktifkan)
  db.syncToExternalDatabase(state);

  console.log(`[HTTP IN TELEMETRI ESP32] Suhu: ${state.temp_dht22.toFixed(1)}°C | Lembap: ${state.humidity.toFixed(1)}% | Humidifier: ${state.humidifier ? 'ON' : 'OFF'}`);

  return res.json({
    status: "SUCCESS",
    server_time: new Date().toISOString(),
    control_mode: state.control_mode,
    heater: state.heater,
    fan: state.fan,
    humidifier: state.humidifier,
    servo_angle: state.servo_angle,
    buzzer: state.buzzer
  });
});

/**
 * Status Lengkap Sistem (Dashboard & Health Check)
 */
app.get('/api/status', (req, res) => {
  const state = iotSim.getState();
  const history = db.getTelemetryHistory(60);
  const aiHealth = aiEngine.calculateHatchingHealth(history, state.currentDay, state.totalTurnsDone, state.expectedTurns);
  const anomalies = aiEngine.detectAnomalies(state, history);

  res.json({
    system: {
      name: "NETESIN",
      version: "2.4.0",
      status: "ONLINE",
      uptime: process.uptime(),
      connected_clients: wss.clients.size
    },
    state,
    aiHealth,
    anomalies,
    activeBatch: db.getActiveBatch()
  });
});

/**
 * Kontrol Aktuator (Manual / Auto Toggle)
 */
app.post('/api/control', (req, res) => {
  const controls = req.body;
  iotSim.setActuatorControl(controls);

  // Teruskan perintah kontrol ke ESP32 melalui MQTT
  mqttBridge.publishControl(controls);

  // Jika hari diubah, update juga ke database batch
  if (controls.currentDay !== undefined) {
    db.updateActiveBatch({ currentDay: Number(controls.currentDay) });
  }

  res.json({
    status: "UPDATED",
    state: iotSim.getState()
  });
});

/**
 * Injeksi Skenario Anomali Simulator (Demo Sidang Proyek Akhir)
 */
app.post('/api/simulator/fault', (req, res) => {
  const { faultType } = req.body;
  const result = iotSim.injectFault(faultType);
  res.json({
    status: "FAULT_INJECTED",
    faultType,
    activeFaults: result,
    state: iotSim.getState()
  });
});

/**
 * AI Endpoint: Prediksi Daya Tetas & Evaluasi
 */
app.post('/api/ai/predict', (req, res) => {
  const { day } = req.body;
  const currentDay = day || iotSim.currentDay;
  const history = db.getTelemetryHistory(100);
  const state = iotSim.getState();

  const prediction = aiEngine.calculateHatchingHealth(history, currentDay, state.totalTurnsDone, state.expectedTurns);
  res.json(prediction);
});

/**
 * AI Endpoint: Asisten Konsultasi & Diagnosis Chatbot
 */
app.post('/api/ai/chat', (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Pesan tidak boleh kosong" });
  }
  const answer = aiEngine.consultAI(message);
  res.json({
    query: message,
    ...answer,
    timestamp: new Date().toISOString()
  });
});

/**
 * AI Endpoint: Computer Vision Analisis Candling Telur
 */
app.post('/api/ai/candling', (req, res) => {
  const { imageType } = req.body;
  const result = aiEngine.analyzeEggCandling(imageType || "fertile_day7");
  res.json(result);
});

/**
 * Manajemen Batch
 */
app.get('/api/batches', (req, res) => {
  res.json({
    activeBatch: db.getActiveBatch(),
    batches: db.data.batches
  });
});

app.post('/api/batches', (req, res) => {
  const updated = db.updateActiveBatch(req.body);
  iotSim.currentDay = updated.currentDay || iotSim.currentDay;
  res.json({ status: "BATCH_UPDATED", activeBatch: updated });
});

/**
 * Histori Telemetri untuk Grafik Chart.js
 */
app.get('/api/history', (req, res) => {
  const limit = Number(req.query.limit) || 100;
  res.json({
    count: limit,
    history: db.getTelemetryHistory(limit)
  });
});

/**
 * Ekspor Data CSV untuk Laporan Proyek Akhir
 */
app.get('/api/export/csv', (req, res) => {
  const csvData = db.exportCSV();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="netesin_telemetry_untidar_2026.csv"');
  res.send(csvData);
});

/**
 * Konfigurasi Telegram Webhook
 */
app.get('/api/telegram/config', (req, res) => {
  res.json(db.getTelegramConfig());
});

app.post('/api/telegram/config', (req, res) => {
  const updated = db.updateTelegramConfig(req.body);
  res.json({ status: "SAVED", config: updated });
});

/**
 * Uji Notifikasi Telegram Webhook (Mock & Simulated Dispatch)
 */
app.post('/api/telegram/test', (req, res) => {
  const state = iotSim.getState();
  const alertPayload = {
    chat_id: db.getTelegramConfig().chatId,
    parse_mode: "Markdown",
    text: `⚠️ *[NETESIN - SISTEM INKUBATOR ENTOK]* ⚠️\\n\\n` +
          `📢 *Pemberitahuan Peringatan Dini IoT*\\n` +
          `• Suhu Inti (DS18B20): *${state.temp_ds18b20.toFixed(1)}°C*\\n` +
          `• Kelembapan (DHT22): *${state.humidity.toFixed(1)}% RH*\\n` +
          `• Status Pemanas: *${state.heater ? "AKTIF (Menyala)" : "MATI"}*\\n` +
          `• Siklus Inkubasi: *Hari ke-${state.currentDay} dari 35*\\n` +
          `• Waktu Peringatan: *${new Date().toLocaleTimeString('id-ID')} WIB*\\n\\n` +
          `_Pesan otomatis dikirim melalui Sistem Terintegrasi UNTIDAR 2026._`
  };

  db.logAlert({
    type: "TELEGRAM_NOTIFICATION_TEST",
    title: "Pengiriman Uji Coba Webhook Telegram",
    message: "Payload notifikasi berhasil digenerate dan dikirimkan ke target chat.",
    severity: "INFO"
  });

  res.json({
    status: "DISPATCHED",
    transport: "HTTP_POST_WEBHOOK",
    targetChatId: db.getTelegramConfig().chatId,
    previewMessage: alertPayload.text,
    timestamp: new Date().toISOString()
  });
});

/**
 * Konfigurasi & Uji Database Eksternal Cloud (Firebase, Supabase, dll)
 */
app.get('/api/database/config', (req, res) => {
  res.json(db.getExternalDbConfig());
});

app.post('/api/database/config', (req, res) => {
  const updated = db.updateExternalDbConfig(req.body);
  res.json({ status: "SAVED", config: updated });
});

app.post('/api/database/test', async (req, res) => {
  try {
    const result = await db.testExternalDbConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Unduh / Lihat Kode Sumber Firmware ESP32 DevKit V1
 */
app.get('/api/firmware', (req, res) => {
  const ip = req.query.serverIp || "192.168.1.108";
  const port = req.query.serverPort || PORT;
  const ssid = req.query.ssid || "Inkubator-WiFi";
  const pass = req.query.pass || "untidar2026";

  const code = generateFirmwareCode(ip, port, ssid, pass);

  if (req.query.download === "true") {
    res.setHeader('Content-Type', 'text/x-c++src');
    res.setHeader('Content-Disposition', 'attachment; filename="InkubatorEntok_ESP32.ino"');
    return res.send(code);
  }

  res.json({
    status: "SUCCESS",
    code
  });
});

// Jalankan Server dengan penanganan otomatis port terpakai
function startListening(targetPort) {
  server.listen(targetPort, () => {
    console.log(`=======================================================`);
    console.log(`  NETESIN - Sistem Inkubator Telur Entok Terintegrasi  `);
    console.log(`  Kolaborasi 3 Matkul: IoT, AI, & Sistem Terintegrasi `);
    console.log(`  Server aktif di: http://localhost:${targetPort}             `);
    console.log(`=======================================================`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = Number(err.port) + 1;
    console.warn(`[INFO] Port ${err.port} sedang dipakai, otomatis beralih ke port ${nextPort}...`);
    startListening(nextPort);
  } else {
    console.error("Kesalahan server:", err);
  }
});

startListening(PORT);
