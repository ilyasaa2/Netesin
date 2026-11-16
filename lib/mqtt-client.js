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
        // console.log(`[MQTT IN] ${topic} -> ${msgStr}`);

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
    });
  }

  handleTelemetry(jsonString) {
    try {
      const data = JSON.parse(jsonString);

      // Konversi format dari kode ESP32 lama ke format sistem terintegrasi
      const tempVal = Number(data.temperature || 0);
      const tempDS = Number(data.temp_ds18b20) || tempVal;
      const tempDHT = Number(data.temp_dht22) || tempVal;
      const humVal = Number(data.humidity || 0);

      const payload = {
        hardware_source: 'PHYSICAL_ESP32',
        temp_ds18b20: tempDS,
        temp_dht22: tempDHT,
        humidity: humVal,
        heater: data.heater !== undefined ? Boolean(data.heater) : this.iotSim.deviceState.heater,
        fan: data.fan !== undefined ? Boolean(data.fan) : this.iotSim.deviceState.fan,
        humidifier: data.humidifier !== undefined ? Boolean(data.humidifier) : this.iotSim.deviceState.humidifier,
        servo_angle: data.servo_angle !== undefined ? Number(data.servo_angle) : this.iotSim.deviceState.servo_angle,
        uptime_seconds: Number(data.uptime_sec || this.iotSim.deviceState.uptime_seconds)
      };

      // Ingest ke simulator / state
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

