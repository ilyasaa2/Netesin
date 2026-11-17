/**
 * lib/mqtt-client.js
 * MQTT Client Bridge untuk menghubungkan Web Dashboard dengan Broker Publik HiveMQ
 * Sesuai kode firmware ESP32 yang digunakan peneliti:
 * Broker: broker.hivemq.com (Port 1883)
 * Topik:
 * - inkubator/mentok/telemetry (Data sensor suhu & kelembapan dari ESP32)
 * - inkubator/mentok/status    (Status online/offline ESP32)
 * - inkubator/mentok/control   (Perintah kontrol target suhu & aktuator)
 */

const mqtt = require('mqtt');

class MqttBridge {
  constructor(iotSim, aiEngine, db, broadcastWs) {
    this.iotSim = iotSim;
    this.aiEngine = aiEngine;
    this.db = db;
    this.broadcastWs = broadcastWs;

    this.brokerUrl = 'mqtt://broker.hivemq.com:1883';
    this.topicTelemetry = 'inkubator/mentok/telemetry';
    this.topicStatus = 'inkubator/mentok/status';
    this.topicControl = 'inkubator/mentok/control';

    this.client = null;
    this.isConnected = false;

    this.connect();
  }

  connect() {
    console.log(`[MQTT] Menghubungkan ke broker: ${this.brokerUrl}...`);
    this.client = mqtt.connect(this.brokerUrl, {
      clientId: 'Netesin_WebServer_' + Math.random().toString(16).substring(2, 8),
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 3000
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      console.log(`[MQTT] Berhasil terhubung ke HiveMQ Broker!`);

      // Berlangganan (Subscribe) ke topik telemetri dan status ESP32
      this.client.subscribe([this.topicTelemetry, this.topicStatus], (err) => {
        if (!err) {
          console.log(`[MQTT] Berlangganan topik: ${this.topicTelemetry} & ${this.topicStatus}`);
        } else {
          console.error(`[MQTT] Gagal subscribe:`, err.message);
        }
      });
    });

    this.client.on('message', (topic, message) => {
      try {
        const msgStr = message.toString();
        console.log(`[MQTT IN] ${topic} -> ${msgStr}`);

        if (topic === this.topicTelemetry) {
          this.handleTelemetry(msgStr);
        } else if (topic === this.topicStatus) {
          this.handleStatus(msgStr);
        }
      } catch (e) {
        console.error(`[MQTT] Gagal memproses pesan:`, e.message);
      }
    });

    this.client.on('error', (err) => {
      console.warn(`[MQTT] Warning koneksi:`, err.message);
    });

    this.client.on('offline', () => {
      this.isConnected = false;
      console.warn(`[MQTT] Terputus dari broker HiveMQ.`);
    });
  }

  handleTelemetry(jsonString) {
    try {
      const data = JSON.parse(jsonString);

      // Ambil nilai numerik dari payload ESP32
      const tempVal = Number(data.temp_dht22 !== undefined ? data.temp_dht22 : (data.temperature !== undefined ? data.temperature : 0));
      const humVal = Number(data.humidity !== undefined ? data.humidity : 0);
      const isHumOn = Boolean(data.humidifier);

      const payload = {
        hardware_source: 'PHYSICAL_ESP32',
        temp_ds18b20: tempVal,
        temp_dht22: tempVal,
        humidity: humVal,
        heater: false,
        fan: false,
        humidifier: isHumOn,
        servo_angle: 0,
        uptime_seconds: Number(data.uptime_sec || this.iotSim.deviceState.uptime_seconds)
      };

      console.log(`[DATA ESP32 DITERIMA & DISINKRONKAN] Suhu: ${tempVal.toFixed(1)}°C | Lembap: ${humVal.toFixed(1)}% | Humidifier: ${isHumOn ? 'ON' : 'OFF'}`);

      // Ingest ke state dan hentikan simulasi acak
      this.iotSim.ingestPhysicalTelemetry(payload);

      // Rekam ke DB
      this.db.addTelemetryRecord({
        timestamp: new Date().toISOString(),
        ...payload
      });

      // Broadcast langsung ke WebSocket web dashboard
      if (this.broadcastWs) {
        const state = this.iotSim.getState();
        const history = this.db.getTelemetryHistory(60);
        const aiHealth = this.aiEngine.calculateHatchingHealth(history, state.currentDay, state.totalTurnsDone, state.expectedTurns);
        const anomalies = this.aiEngine.detectAnomalies(state, history);

        this.broadcastWs({
          type: 'TELEMETRY_UPDATE',
          timestamp: new Date().toISOString(),
          state,
          aiHealth,
          anomalies,
          activeBatch: this.db.getActiveBatch()
        });

        // Sinkronisasi data ESP32 fisik secara real-time ke Database Eksternal Cloud (Supabase)
        this.db.syncToExternalDatabase(state);
      }
    } catch (err) {
      console.error('[MQTT Telemetry Parse Error]', err.message);
    }
  }

  handleStatus(jsonString) {
    try {
      const statusObj = JSON.parse(jsonString);
      if (statusObj.status === 'online') {
        this.iotSim.deviceState.hardware_source = 'PHYSICAL_ESP32';
      }
    } catch (e) {}
  }

  publishControl(controls) {
    if (!this.client || !this.isConnected) return;

    try {
      const payload = JSON.stringify(controls);
      this.client.publish(this.topicControl, payload);
      console.log(`[MQTT OUT] Publikasi kontrol ke ${this.topicControl}:`, payload);
    } catch (e) {
      console.error('[MQTT Publish Error]', e.message);
    }
  }
}

module.exports = MqttBridge;

