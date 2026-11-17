/**
 * lib/iot-simulator.js
 * Simulator Perangkat Keras ESP32 DevKit V1 & Termodinamika Ruang Inkubator
 * Mensimulasikan secara realistis dinamika termal, perpindahan panas lampu pijar,
 * pengkabutan ultrasonik, sirkulasi fan DC, dan pembalikan servo SG90.
 */

class IoTSimulator {
  constructor(aiEngine) {
    this.aiEngine = aiEngine;

    // Parameter lingkungan ruangan luar (Ambient sesuai display fisik 29.2°C)
    this.ambientTemp = 29.2;
    this.ambientHumidity = 58.0;

    // Status perangkat keras (sesuai pin ESP32 di proposal)
    this.deviceState = {
      device_id: "ESP32-INKUBATOR-ENTOK-01",
      ip_address: "192.168.1.108",
      firmware_version: "v2.4.1-TIDAR",
      hardware_source: "SIMULATOR", // "SIMULATOR" atau "PHYSICAL_ESP32"
      control_mode: "AUTO", // "AUTO" atau "MANUAL"
      temp_ds18b20: 37.84, // GPIO 4 (Waterproof Core Probe)
      temp_dht22: 37.72,   // GPIO 5 (Top Ambient Temp)
      humidity: 62.4,      // GPIO 5 (DHT22 Relative Humidity)
      heater: true,        // GPIO 26 (Relay 2x Lampu Pijar 5W)
      fan: true,           // GPIO 27 (Fan DC 6010 Sirkulasi)
      humidifier: false,   // GPIO 25 (Ultrasonic 5V Mist)
      servo_angle: 45,     // GPIO 18 (Sudut Tilting SG90: -45, 0, 45)
      buzzer: false,       // GPIO 14 (Active Buzzer)
      oled_status: "OK - RUNNING", // GPIO 21/22 (I2C 0.96")
      uptime_seconds: 1420,
      last_turned_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      next_turn_seconds: 7200, // 2 jam lagi
      wifi_rssi: -58 // dBm (Kekuatan sinyal Wi-Fi)
    };

    // Mode uji anomali manual
    this.faultInjection = {
      heaterBroken: false,
      lidOpen: false,
      humidifierEmpty: false,
      overheatStuck: false
    };

    this.currentDay = 8; // Default hari inkubasi aktif
    this.totalTurnsDone = 32;
    this.expectedTurns = 32;

    // Interval update termodinamika per detik
    this.timer = null;
    this.startSimulation();
  }

  startSimulation() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.tick();
    }, 1000);
  }

  stopSimulation() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Langkah simulasi fisik setiap 1 detik
   */
  tick() {
    this.deviceState.uptime_seconds += 1;

    // JIKA SUMBER DATA BERASAL DARI ESP32 FISIK NYATA:
    // Hentikan simulasi acak agar data pembacaan sensor DHT22 & Humidifier fisik TIDAK TERTORTOH / TERTIPU!
    if (this.deviceState.hardware_source === "PHYSICAL_ESP32") {
      return;
    }

    // Hitung mundur pembalikan telur (hanya jika fase mengizinkan dan mode AUTO)
    const stage = this.aiEngine.getStageProfile(this.currentDay);
    if (stage.turningEnabled) {
      if (this.deviceState.next_turn_seconds > 0) {
        this.deviceState.next_turn_seconds -= 1;
      } else {
        // Balik telur secara otomatis
        this.deviceState.servo_angle = this.deviceState.servo_angle === 45 ? -45 : 45;
        this.deviceState.next_turn_seconds = stage.turningIntervalHours * 3600;
        this.deviceState.last_turned_at = new Date().toISOString();
        this.totalTurnsDone += 1;
      }
    } else {
      // Fase Lockdown: sudut wajib datar 0 derajat
      this.deviceState.servo_angle = 0;
      this.deviceState.next_turn_seconds = 0;
    }

    // Jika mode AUTO dan bersumber dari SIMULATOR: Jalankan evaluasi logika AI / Mikrokontroler
    if (this.deviceState.control_mode === "AUTO" && this.deviceState.hardware_source === "SIMULATOR") {
      const decision = this.aiEngine.evaluateMicroclimateControl(this.deviceState, this.currentDay);
      if (!this.faultInjection.overheatStuck) {
        this.deviceState.heater = decision.heater;
      }
      this.deviceState.fan = decision.fan;
      this.deviceState.humidifier = decision.humidifier;
      this.deviceState.buzzer = decision.buzzer;
    }

    // Termodinamika Suhu
    let currentT = this.deviceState.temp_ds18b20;
    let heatingPower = 0;

    if (this.faultInjection.overheatStuck) {
      this.deviceState.heater = true;
      heatingPower = 0.08; // Pemanasan terus menerus tanpa henti
    } else if (this.deviceState.heater && !this.faultInjection.heaterBroken) {
      heatingPower = 0.045; // 2x Lampu Pijar 5W menghasilkan panas
    }

    // Pendinginan alami ke suhu ambient
    let coolRate = 0.015;
    if (this.faultInjection.lidOpen) {
      coolRate = 0.075; // Pintu terbuka: panas hilang cepat
    }
    if (this.deviceState.fan && currentT > this.ambientTemp) {
      coolRate += 0.005; // Kipas sirkulasi membuang sedikit panas via celah ventilasi
    }

    let deltaT = heatingPower - (coolRate * ((currentT - this.ambientTemp) / 8.0));
    // Noise sensor mikrokontroler analog
    let sensorNoise = (Math.random() - 0.5) * 0.02;

    this.deviceState.temp_ds18b20 = Math.round((currentT + deltaT + sensorNoise) * 100) / 100;
    // Sensor DHT22 sedikit berbeda posisinya (bagian atas inkubator)
    this.deviceState.temp_dht22 = Math.round((this.deviceState.temp_ds18b20 - 0.12 + ((Math.random() - 0.5) * 0.03)) * 100) / 100;

    // Termodinamika Kelembapan
    let currentH = this.deviceState.humidity;
    let humidPower = 0;
    if (this.deviceState.humidifier && !this.faultInjection.humidifierEmpty) {
      humidPower = 0.35; // Modul ultrasonik menambah kabut
    }

    let humidLoss = 0.08;
    if (this.faultInjection.lidOpen) {
      humidLoss = 0.40;
    }
    let deltaH = humidPower - (humidLoss * ((currentH - this.ambientHumidity) / 15.0));
    let humidNoise = (Math.random() - 0.5) * 0.1;

    let newHumid = currentH + deltaH + humidNoise;
    this.deviceState.humidity = Math.round(Math.min(95.0, Math.max(30.0, newHumid)) * 10) / 10;

    // Update status teks OLED 0.96"
    if (this.deviceState.buzzer) {
      this.deviceState.oled_status = "! ALARM ABNORMAL !";
    } else if (this.deviceState.temp_ds18b20 > 38.5) {
      this.deviceState.oled_status = "SUHU TINGGI (FAN ON)";
    } else if (this.deviceState.temp_ds18b20 < 37.5) {
      this.deviceState.oled_status = "SUHU RENDAH (HEAT ON)";
    } else {
      this.deviceState.oled_status = "NORMAL: HARI KE-" + this.currentDay;
    }
  }

  /**
   * Menerima telemetri dari perangkat keras ESP32 fisik nyata via HTTP POST atau WebSocket
   */
  ingestPhysicalTelemetry(payload) {
    this.deviceState.hardware_source = "PHYSICAL_ESP32";
    this.lastPhysicalTime = Date.now();
    if (payload.temp_ds18b20 !== undefined) {
      this.deviceState.temp_ds18b20 = Number(payload.temp_ds18b20);
    } else if (payload.temp_dht22 !== undefined || payload.temperature !== undefined) {
      this.deviceState.temp_ds18b20 = Number(payload.temp_dht22 !== undefined ? payload.temp_dht22 : payload.temperature);
    }
    if (payload.temp_dht22 !== undefined) {
      this.deviceState.temp_dht22 = Number(payload.temp_dht22);
    } else if (payload.temperature !== undefined) {
      this.deviceState.temp_dht22 = Number(payload.temperature);
    }
    if (payload.humidity !== undefined) this.deviceState.humidity = Number(payload.humidity);
    if (payload.heater !== undefined) this.deviceState.heater = Boolean(payload.heater);
    if (payload.fan !== undefined) this.deviceState.fan = Boolean(payload.fan);
    if (payload.humidifier !== undefined) this.deviceState.humidifier = Boolean(payload.humidifier);
    if (payload.servo_angle !== undefined) this.deviceState.servo_angle = Number(payload.servo_angle);
    if (payload.buzzer !== undefined) this.deviceState.buzzer = Boolean(payload.buzzer);
    if (payload.ip_address) this.deviceState.ip_address = payload.ip_address;
    if (payload.wifi_rssi !== undefined) this.deviceState.wifi_rssi = Number(payload.wifi_rssi);
    this.deviceState.uptime_seconds = payload.uptime_seconds || payload.uptime_sec || this.deviceState.uptime_seconds;
  }

  /**
   * Perintah kontrol manual aktuator dari Dashboard Web
   */
  setActuatorControl(controls) {
    if (controls.control_mode !== undefined) {
      this.deviceState.control_mode = controls.control_mode;
    }
    if (controls.heater !== undefined) {
      this.deviceState.heater = Boolean(controls.heater);
    }
    if (controls.fan !== undefined) {
      this.deviceState.fan = Boolean(controls.fan);
    }
    if (controls.humidifier !== undefined) {
      this.deviceState.humidifier = Boolean(controls.humidifier);
    }
    if (controls.servo_angle !== undefined) {
      this.deviceState.servo_angle = Number(controls.servo_angle);
      this.deviceState.last_turned_at = new Date().toISOString();
      this.totalTurnsDone += 1;
    }
    if (controls.buzzer !== undefined) {
      this.deviceState.buzzer = Boolean(controls.buzzer);
    }
    if (controls.currentDay !== undefined) {
      this.currentDay = Number(controls.currentDay);
    }
  }

  /**
   * Injeksi skenario anomali untuk demonstrasi sidang/evaluasi mata kuliah
   */
  injectFault(faultType) {
    // Reset all faults first
    this.faultInjection = {
      heaterBroken: false,
      lidOpen: false,
      humidifierEmpty: false,
      overheatStuck: false
    };

    if (faultType === "heater_broken") {
      this.faultInjection.heaterBroken = true;
      this.deviceState.heater = true; // Terlihat menyala di perintah, tapi fisik lampu putus
    } else if (faultType === "lid_open") {
      this.faultInjection.lidOpen = true;
    } else if (faultType === "humidifier_empty") {
      this.faultInjection.humidifierEmpty = true;
      this.deviceState.humidifier = true;
    } else if (faultType === "overheat") {
      this.faultInjection.overheatStuck = true;
      this.deviceState.temp_ds18b20 = 39.45;
      this.deviceState.temp_dht22 = 39.60;
    } else if (faultType === "reset") {
      // Normalkan kembali
      this.deviceState.temp_ds18b20 = 37.82;
      this.deviceState.temp_dht22 = 37.74;
      this.deviceState.humidity = 61.8;
      this.deviceState.control_mode = "AUTO";
    }

    return this.faultInjection;
  }

  getState() {
    return {
      ...this.deviceState,
      currentDay: this.currentDay,
      totalTurnsDone: this.totalTurnsDone,
      faultInjection: this.faultInjection
    };
  }
}

module.exports = IoTSimulator;

