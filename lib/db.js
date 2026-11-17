/**
 * lib/db.js
 * Manajemen Penyimpanan Data, Riwayat Telemetri, Batch Penetasan & Log Integrasi
 */

const fs = require('fs');
const path = require('path');

class DatabaseManager {
  constructor() {
    this.storageDir = path.join(__dirname, '..', 'data');
    this.storageFile = path.join(this.storageDir, 'app_data.json');
    this.maxHistorySize = 600;

    this.data = {
      activeBatch: {
        id: "BATCH-ENTOK-2026-001",
        title: "Inkubasi Telur Entok Manila Super (Grade A)",
        breed: "Entok Manila (Cairina moschata)",
        totalEggs: 30,
        startDate: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString().split('T')[0], // 8 hari lalu
        currentDay: 8,
        totalCycleDays: 35,
        expectedHatchDate: new Date(Date.now() + 27 * 24 * 3600 * 1000).toISOString().split('T')[0],
        status: "ACTIVE",
        operator: "Hakkan Azrul Suseno & Muhammad Ramdhan",
        notes: "Uji coba penetasan kolaborasi 3 matkul: T. Sistem Terintegrasi, AI, dan IoT - UNTIDAR 2026"
      },
      batches: [
        {
          id: "BATCH-ENTOK-2026-001",
          title: "Inkubasi Telur Entok Manila Super (Grade A)",
          breed: "Entok Manila (Cairina moschata)",
          totalEggs: 30,
          startDate: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString().split('T')[0],
          currentDay: 8,
          totalCycleDays: 35,
          status: "ACTIVE"
        },
        {
          id: "BATCH-ENTOK-HIST-098",
          title: "Uji Coba Batch Pra-Sidang 20 Telur",
          breed: "Entok Lokal Magelang",
          totalEggs: 20,
          startDate: "2026-08-01",
          currentDay: 35,
          totalCycleDays: 35,
          status: "COMPLETED",
          hatchCount: 18,
          hatchRate: 90.0
        }
      ],
      candlingRecords: [
        {
          day: 7,
          date: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString().split('T')[0],
          fertileCount: 27,
          infertileCount: 2,
          deadCount: 1,
          notes: "Peneropongan hari ke-7 berhasil: 2 butir telur infertil dikeluarkan dari rak."
        }
      ],
      externalDatabase: {
        provider: "SUPABASE", // "SUPABASE", "FIREBASE", "CUSTOM_REST", "NONE"
        enabled: false,
        url: process.env.SUPABASE_URL || "",
        apiKey: process.env.SUPABASE_KEY || "",
        tableName: process.env.SUPABASE_TABLE || "telemetry",
        syncIntervalSec: 10,
        lastSyncStatus: "OFFLINE",
        lastSyncTime: null,
        totalSyncedCount: 0
      },
      telegramConfig: {
        enabled: true,
        botToken: "MOCK_BOT_TOKEN_7812938491:AAH8z...",
        chatId: "-100234918234",
        alertOnOverheat: true,
        alertOnUnderheat: true,
        alertOnWaterEmpty: true,
        alertOnTurning: false
      },
      alertsLog: [],
      telemetryHistory: []
    };

    this.initStorage();
  }

  initStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf8');
        const loaded = JSON.parse(raw);
        this.data = { ...this.data, ...loaded };
      } else {
        this.seedInitialHistory();
        this.saveToFile();
      }

      // Terapkan environment variables jika ada (.env)
      if (process.env.SUPABASE_URL) {
        this.data.externalDatabase = {
          ...this.getExternalDbConfig(),
          provider: "SUPABASE",
          url: process.env.SUPABASE_URL,
          apiKey: process.env.SUPABASE_KEY || this.data.externalDatabase.apiKey || "",
          tableName: process.env.SUPABASE_TABLE || this.data.externalDatabase.tableName || "telemetry",
          enabled: process.env.SUPABASE_ENABLED === "true" || this.data.externalDatabase.enabled
        };
      }
    } catch (err) {
      console.warn("DB Storage warning:", err.message);
      this.seedInitialHistory();
    }
  }

  seedInitialHistory() {
    // Generate 60 menit riwayat realistis ke belakang
    const now = Date.now();
    for (let i = 60; i >= 0; i--) {
      const time = new Date(now - i * 60 * 1000).toISOString();
      const baseTemp = 37.8 + Math.sin(i / 5) * 0.25 + (Math.random() - 0.5) * 0.1;
      const baseHum = 61.5 + Math.cos(i / 6) * 2.0 + (Math.random() - 0.5) * 0.5;

      this.data.telemetryHistory.push({
        timestamp: time,
        temp_ds18b20: Math.round(baseTemp * 100) / 100,
        temp_dht22: Math.round((baseTemp - 0.15) * 100) / 100,
        humidity: Math.round(baseHum * 10) / 10,
        heater: baseTemp < 37.8,
        fan: true,
        humidifier: baseHum < 60,
        servo_angle: i % 8 < 4 ? 45 : -45,
        buzzer: false
      });
    }
  }

  saveToFile() {
    try {
      fs.writeFileSync(this.storageFile, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error("Gagal menyimpan ke file data:", e.message);
    }
  }

  addTelemetryRecord(record) {
    this.data.telemetryHistory.push(record);
    if (this.data.telemetryHistory.length > this.maxHistorySize) {
      this.data.telemetryHistory.shift();
    }
  }

  getTelemetryHistory(limit = 100) {
    return this.data.telemetryHistory.slice(-limit);
  }

  getActiveBatch() {
    return this.data.activeBatch;
  }

  updateActiveBatch(update) {
    this.data.activeBatch = { ...this.data.activeBatch, ...update };
    this.saveToFile();
    return this.data.activeBatch;
  }

  addCandlingRecord(record) {
    this.data.candlingRecords.push(record);
    this.saveToFile();
    return this.data.candlingRecords;
  }

  getCandlingRecords() {
    return this.data.candlingRecords;
  }

  logAlert(alert) {
    // Hindari duplikasi alert yang sama dalam 60 detik terakhir
    const now = Date.now();
    const existing = this.data.alertsLog.find(a => a.type === alert.type);
    if (existing && (now - new Date(existing.timestamp).getTime()) < 60000) {
      return null;
    }

    const alertEntry = {
      id: "ALT-" + Date.now().toString(36),
      timestamp: new Date().toISOString(),
      ...alert
    };
    this.data.alertsLog.unshift(alertEntry);
    if (this.data.alertsLog.length > 50) {
      this.data.alertsLog.pop();
    }
    this.saveToFile();
    return alertEntry;
  }

  getAlertsLog(limit = 20) {
    return this.data.alertsLog.slice(0, limit);
  }

  getTelegramConfig() {
    return this.data.telegramConfig;
  }

  updateTelegramConfig(cfg) {
    this.data.telegramConfig = { ...this.data.telegramConfig, ...cfg };
    this.saveToFile();
    return this.data.telegramConfig;
  }

  getExternalDbConfig() {
    return this.data.externalDatabase || {
      provider: "FIREBASE",
      enabled: false,
      url: "",
      apiKey: "",
      tableName: "telemetry_logs",
      lastSyncStatus: "OFFLINE",
      totalSyncedCount: 0
    };
  }

  updateExternalDbConfig(cfg) {
    this.data.externalDatabase = { ...this.getExternalDbConfig(), ...cfg };
    this.saveToFile();
    return this.data.externalDatabase;
  }

  async testExternalDbConnection() {
    const config = this.getExternalDbConfig();
    if (!config.url) {
      throw new Error("URL Database eksternal belum diisi.");
    }

    try {
      const pingPayload = {
        test: true,
        device_id: "ESP32-INKUBATOR-ENTOK-01",
        timestamp: new Date().toISOString(),
        message: "Koneksi uji coba dari NETESIN UNTIDAR 2026"
      };

      if (config.provider === "FIREBASE") {
        // Firebase Realtime DB REST endpoint
        const targetUrl = config.url.replace(/\/$/, '') + '/test_connection.json';
        const res = await fetch(targetUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pingPayload)
        });
        if (!res.ok) throw new Error("Firebase HTTP status: " + res.status);
      } else if (config.provider === "SUPABASE") {
        // 1. Verifikasi koneksi & keberadaan tabel Supabase via GET
        const readUrl = config.url.replace(/\/$/, '') + '/rest/v1/' + (config.tableName || 'telemetry') + '?select=*&limit=1';
        const res = await fetch(readUrl, {
          method: 'GET',
          headers: {
            'apikey': config.apiKey,
            'Authorization': 'Bearer ' + config.apiKey
          }
        });

        if (!res.ok) {
          let detail = "";
          try {
            const errJson = await res.json();
            detail = errJson.message || errJson.hint || errJson.details || "";
          } catch (e) {
            detail = await res.text().catch(() => "");
          }

          if (res.status === 404) {
            throw new Error(`Tabel "${config.tableName || 'telemetry'}" belum ditemukan di Supabase. Silakan buat tabel terlebih dahulu di SQL Editor dashboard Supabase.`);
          } else if (res.status === 401 || res.status === 403) {
            throw new Error(`Autentikasi Supabase gagal (${res.status}): ${detail || 'API Key salah atau tidak memiliki izin'}. Pastikan menggunakan anon public key atau service_role key.`);
          } else {
            throw new Error(`Koneksi Supabase error HTTP ${res.status}: ${detail}`);
          }
        }

        // 2. Uji coba kirim baris telemetri uji coba (Insert Test)
        const insertUrl = config.url.replace(/\/$/, '') + '/rest/v1/' + (config.tableName || 'telemetry');
        const testPayload = {
          device_id: "ESP32-INKUBATOR-ENTOK-01",
          temperature: 37.5,
          temp_dht22: 37.5,
          humidity: 60.0,
          humidifier: false,
          heater: false,
          fan: true,
          status: "TEST_CONNECTION"
        };

        const insertRes = await fetch(insertUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.apiKey,
            'Authorization': 'Bearer ' + config.apiKey,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(testPayload)
        });

        if (!insertRes.ok) {
          let errInsert = "";
          try {
            const b = await insertRes.json();
            errInsert = b.message || b.details || "";
          } catch (e) {}
          throw new Error(`Tabel Supabase terbaca, namun izin INSERT ditolak (${insertRes.status}): ${errInsert}. Pastikan kebijakan RLS tabel "${config.tableName}" mengizinkan insert.`);
        }
      } else if (config.provider === "THINGSPEAK") {
        const targetUrl = `https://api.thingspeak.com/update?api_key=${config.apiKey}&field1=37.8&field2=62.0`;
        const res = await fetch(targetUrl);
        if (!res.ok) throw new Error("ThingSpeak HTTP status: " + res.status);
      } else {
        // Custom REST
        const res = await fetch(config.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pingPayload)
        });
        if (!res.ok) throw new Error("REST API HTTP status: " + res.status);
      }

      this.data.externalDatabase.lastSyncStatus = "CONNECTED";
      this.data.externalDatabase.lastSyncTime = new Date().toISOString();
      this.saveToFile();

      return {
        status: "CONNECTED",
        provider: config.provider,
        targetUrl: config.url,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      this.data.externalDatabase.lastSyncStatus = "ERROR: " + err.message;
      this.saveToFile();
      throw err;
    }
  }

  async syncToExternalDatabase(record) {
    const config = this.getExternalDbConfig();
    if (!config || !config.enabled || !config.url) return;

    try {
      const payload = {
        device_id: "ESP32-INKUBATOR-ENTOK-01",
        timestamp: record.timestamp || new Date().toISOString(),
        temp_core_ds18b20: record.temp_ds18b20,
        temp_ambient_dht22: record.temp_dht22,
        humidity_dht22: record.humidity,
        heater_status: record.heater ? 1 : 0,
        fan_status: record.fan ? 1 : 0,
        humidifier_status: record.humidifier ? 1 : 0,
        servo_angle: record.servo_angle
      };

      if (config.provider === "FIREBASE") {
        const targetUrl = config.url.replace(/\/$/, '') + '/telemetry_live.json';
        await fetch(targetUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else if (config.provider === "SUPABASE") {
        const targetUrl = config.url.replace(/\/$/, '') + '/rest/v1/' + (config.tableName || 'telemetry');
        const tempVal = Number(record.temp_dht22 !== undefined ? record.temp_dht22 : (record.temperature !== undefined ? record.temperature : record.temp_ds18b20 || 0));
        const humVal = Number(record.humidity !== undefined ? record.humidity : 0);

        const supabasePayload = {
          device_id: record.device_id || "ESP32-INKUBATOR-ENTOK-01",
          timestamp: record.timestamp || new Date().toISOString(),
          temperature: Number(tempVal.toFixed(1)),
          temp_dht22: Number(tempVal.toFixed(1)),
          humidity: Number(humVal.toFixed(1)),
          humidifier: Boolean(record.humidifier),
          heater: Boolean(record.heater),
          fan: Boolean(record.fan),
          servo_angle: Number(record.servo_angle || 0),
          status: record.hardware_source === 'PHYSICAL_ESP32' ? 'PHYSICAL_ESP32_LIVE' : 'ONLINE'
        };

        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.apiKey,
            'Authorization': 'Bearer ' + config.apiKey,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(supabasePayload)
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${detail}`);
        }
      }

      this.data.externalDatabase.totalSyncedCount = (this.data.externalDatabase.totalSyncedCount || 0) + 1;
      this.data.externalDatabase.lastSyncTime = new Date().toISOString();
      this.data.externalDatabase.lastSyncStatus = "SYNCED";
    } catch (e) {
      this.data.externalDatabase.lastSyncStatus = "SYNC_FAILED: " + e.message;
    }
  }

  exportCSV() {
    const rows = [
      ["Timestamp", "DS18B20_Temp_C", "DHT22_Temp_C", "Humidity_Pct", "Heater_Relay", "Fan_DC", "Humidifier_Ultrasonic", "Servo_Angle_Deg", "Buzzer_Alarm"].join(",")
    ];

    for (const item of this.data.telemetryHistory) {
      rows.push([
        item.timestamp,
        item.temp_ds18b20,
        item.temp_dht22,
        item.humidity,
        item.heater ? 1 : 0,
        item.fan ? 1 : 0,
        item.humidifier ? 1 : 0,
        item.servo_angle,
        item.buzzer ? 1 : 0
      ].join(","));
    }

    return rows.join("\n");
  }
}

module.exports = new DatabaseManager();

