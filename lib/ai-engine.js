/**
 * lib/ai-engine.js
 * Modul Kecerdasan Buatan (Artificial Intelligence) untuk Sistem Inkubator Telur Entok
 * Mengimplementasikan:
 * 1. Prediksi Hatching Success Index (HSI) & Evaluasi Kesehatan Inkubasi
 * 2. Real-time Anomaly Detection (Deteksi Lampu Putus, Sensor Drift, Tutup Terbuka, Humidifier Kering)
 * 3. Stage-Aware Adaptive Microclimate Controller (Aturan Logika Fuzzy untuk Telur Entok 35 Hari)
 * 4. Analisis Computer Vision Candling Telur (Fertil, Infertil, Embrio Mati / Blood Ring)
 * 5. Asisten Cerdas Diagnosis & Konsultasi Inkubasi
 */

class AIEngine {
  constructor() {
    // Panduan biologis penetasan telur entok (Muscovy Duck - 35 hari)
    this.stageProfiles = {
      early: {
        name: "Fase Awal (Hari 1 - 14): Pembentukan Embrio & Jaringan Vaskular",
        dayRange: [1, 14],
        targetTemp: 37.8,
        tempTolerance: 0.4,
        targetHumidity: 60,
        humidityTolerance: 5,
        turningEnabled: true,
        turningIntervalHours: 4,
        coolingRequired: false,
        notes: "Jaga stabilitas suhu ketat. Pembalikan telur rutin mencegah embrio menempel pada membran kerabang."
      },
      mid: {
        name: "Fase Pertengahan (Hari 15 - 29): Pertumbuhan Organ & Pendinginan Berkala",
        dayRange: [15, 29],
        targetTemp: 37.5,
        tempTolerance: 0.5,
        targetHumidity: 65,
        humidityTolerance: 5,
        turningEnabled: true,
        turningIntervalHours: 4,
        coolingRequired: true,
        coolingMinutesPerDay: 15,
        notes: "Telur entok membutuhkan pendinginan dan pengabutan halus harian selama 15 menit untuk meniru perilaku induk alami."
      },
      lockdown: {
        name: "Fase Kritis / Lockdown (Hari 30 - 35): Persiapan & Proses Menetas",
        dayRange: [30, 35],
        targetTemp: 37.2,
        tempTolerance: 0.4,
        targetHumidity: 78,
        humidityTolerance: 5,
        turningEnabled: false,
        turningIntervalHours: 0,
        coolingRequired: false,
        notes: "Pembalikan telur WAJIB DIMATIKAN. Kelembapan dinaikkan ke 75-80% agar selaput telur lunak dan anak entok tidak dehidrasi saat memecah cangkang (pipping)."
      }
    };
  }

  /**
   * Menentukan profil fase inkubasi berdasarkan hari ke-X
   */
  getStageProfile(currentDay = 7) {
    if (currentDay >= 30) return this.stageProfiles.lockdown;
    if (currentDay >= 15) return this.stageProfiles.mid;
    return this.stageProfiles.early;
  }

  /**
   * Model Prediksi Tingkat Keberhasilan Penetasan (Hatching Success Index - HSI)
   * Mengevaluasi riwayat telemetri (suhu rata-rata, deviasi standar, fluktuasi kelembapan, kepatuhan pembalikan)
   */
  calculateHatchingHealth(history = [], currentDay = 7, totalTurnsDone = 0, expectedTurns = 0) {
    if (!history || history.length === 0) {
      return {
        hsiPercentage: 88.0,
        grade: "Optimal",
        confidence: 0.75,
        factors: {
          thermalStability: 90,
          humidityCompliance: 86,
          turningCompliance: 88,
          environmentalStress: 8
        },
        recommendation: "Data telemetri baru dimulai. Sistem beroperasi dalam rentang stabil."
      };
    }

    const stage = this.getStageProfile(currentDay);
    const targetT = stage.targetTemp;
    const targetH = stage.targetHumidity;

    // Ambil sampel terakhir (maksimal 60 data poin)
    const samples = history.slice(-60);
    const temps = samples.map(s => Number(s.temp_ds18b20 || s.temp_dht22 || 37.8));
    const humids = samples.map(s => Number(s.humidity || 60));

    // Rata-rata dan standar deviasi
    const avgT = temps.reduce((a, b) => a + b, 0) / temps.length;
    const avgH = humids.reduce((a, b) => a + b, 0) / humids.length;

    const stdT = Math.sqrt(temps.reduce((sq, n) => sq + Math.pow(n - avgT, 2), 0) / temps.length);
    const stdH = Math.sqrt(humids.reduce((sq, n) => sq + Math.pow(n - avgH, 2), 0) / humids.length);

    // Skor kestabilan suhu (0 - 100)
    const tError = Math.abs(avgT - targetT);
    let thermalStability = Math.max(0, 100 - (tError * 40) - (stdT * 35));

    // Skor kepatuhan kelembapan (0 - 100)
    const hError = Math.abs(avgH - targetH);
    let humidityCompliance = Math.max(0, 100 - (hError * 3) - (stdH * 5));

    // Skor pembalikan telur
    let turningCompliance = 100;
    if (stage.turningEnabled) {
      if (expectedTurns > 0) {
        turningCompliance = Math.min(100, Math.round((totalTurnsDone / expectedTurns) * 100));
      }
    } else {
      turningCompliance = totalTurnsDone === 0 ? 100 : 85; // Di fase lockdown seharusnya tidak dibalik
    }

    // Penalti jika ada kondisi ekstrem (overheat > 39.0 atau chilling < 36.0)
    let extremeCount = samples.filter(s => s.temp_ds18b20 > 39.0 || s.temp_ds18b20 < 36.0).length;
    let environmentalStress = Math.min(100, (extremeCount / samples.length) * 150 + (stdT > 0.8 ? 20 : 5));

    // Formula pembobotan HSI
    // HSI = 0.45 * Thermal + 0.30 * Humidity + 0.15 * Turning + 0.10 * (100 - Stress)
    let hsi = (0.45 * thermalStability) + (0.30 * humidityCompliance) + (0.15 * turningCompliance) + (0.10 * Math.max(0, 100 - environmentalStress));
    hsi = Math.min(99.4, Math.max(25.0, Math.round(hsi * 10) / 10));

    let grade = "Optimal";
    let recommendation = "Kondisi mikroklimat ruang inkubator sangat ideal untuk perkembangan embrio telur entok.";

    if (hsi >= 88) {
      grade = "Sangat Baik (Optimal)";
      recommendation = "Kondisi inkubator sangat stabil. Pertahankan setpoint sesuai siklus biologis hari ke-" + currentDay + ".";
    } else if (hsi >= 75) {
      grade = "Baik (Toleransi Aman)";
      recommendation = "Parameter dalam batas normal, namun terdapat fluktuasi minor pada " + (thermalStability < humidityCompliance ? "stabilitas suhu" : "kelembapan udara") + ".";
    } else if (hsi >= 60) {
      grade = "Peringatan (Suboptimal)";
      recommendation = "Terdeteksi deviasi suhu/kelembapan dari target optimal. Periksa ventilasi fan dan pasokan air humidifier.";
    } else {
      grade = "Kritis (Risiko Kegagalan Tetas)";
      recommendation = "Kondisi darurat: Fluktuasi ekstrem terdeteksi. Segera periksa pemanas, kipas, dan pastikan pintu tertutup rapat.";
    }

    return {
      hsiPercentage: hsi,
      grade,
      confidence: 0.92,
      factors: {
        thermalStability: Math.round(thermalStability),
        humidityCompliance: Math.round(humidityCompliance),
        turningCompliance: Math.round(turningCompliance),
        environmentalStress: Math.round(environmentalStress)
      },
      stats: {
        avgTemp: Math.round(avgT * 100) / 100,
        stdTemp: Math.round(stdT * 100) / 100,
        avgHumidity: Math.round(avgH * 10) / 10,
        stdHumidity: Math.round(stdH * 10) / 10
      },
      stage: stage.name,
      recommendation
    };
  }

  /**
   * Real-time Anomaly Detection Engine
   * Menganalisis kondisi aktuator dan perubahan fisik untuk mendeteksi kegagalan perangkat
   */
  detectAnomalies(telemetry, history = []) {
    const anomalies = [];
    const tDS = Number(telemetry.temp_ds18b20 || 0);
    const tDHT = Number(telemetry.temp_dht22 || 0);
    const hum = Number(telemetry.humidity || 0);
    const heaterOn = Boolean(telemetry.heater);
    const humidifierOn = Boolean(telemetry.humidifier);
    const fanOn = Boolean(telemetry.fan);

    // 1. Deteksi Kerusakan Elemen Pemanas / Lampu Pijar Putus (Thermal Inertia Defect)
    // Jika pemanas aktif terus menerus selama > 10 menit tapi suhu berada di bawah 36.5°C dan tidak naik
    if (heaterOn && tDS < 36.5 && history.length >= 10) {
      const past10 = history.slice(-10);
      const heaterAllOn = past10.every(h => h.heater);
      const tFirst = Number(past10[0].temp_ds18b20 || 0);
      const tDelta = tDS - tFirst;
      if (heaterAllOn && tDelta <= 0.1) {
        anomalies.push({
          id: "heater_filament_defect",
          severity: "CRITICAL",
          title: "Indikasi Kerusakan Pemanas (Lampu Pijar Putus)",
          message: "Lampu pemanas terpantau aktif secara kontinu, namun suhu inkubator tidak mengalami kenaikan (Delta T = " + tDelta.toFixed(2) + "°C). Kemungkinan filamen lampu pijar 5W putus atau relay terkendala.",
          action: "Periksa kondisi fisik kedua lampu pijar dan modul relay GPIO 26.",
          timestamp: new Date().toISOString()
        });
      }
    }

    // 2. Deteksi Pintu Inkubator Terbuka / Kebocoran Suhu Drastis
    if (history.length >= 5) {
      const past5 = history.slice(-5);
      const tStart = Number(past5[0].temp_ds18b20 || tDS);
      const drop = tStart - tDS;
      if (drop > 1.4) {
        anomalies.push({
          id: "open_chamber_leak",
          severity: "WARNING",
          title: "Penurunan Suhu Drastis (Pintu Terbuka)",
          message: "Suhu ruang turun drastis sebesar " + drop.toFixed(1) + "°C dalam waktu singkat. Terindikasi pintu atau penutup inkubator terbuka.",
          action: "Pastikan pintu inkubator tertutup rapat dan seal insulasi melamin tidak renggang.",
          timestamp: new Date().toISOString()
        });
      }
    }

    // 3. Deteksi Pasokan Air Humidifier Habis (Ultrasonic Desiccation)
    if (humidifierOn && hum < 48 && history.length >= 8) {
      const past8 = history.slice(-8);
      const humAllOn = past8.every(h => h.humidifier);
      if (humAllOn) {
        anomalies.push({
          id: "humidifier_water_depleted",
          severity: "WARNING",
          title: "Pasokan Air Humidifier Habis / Tersumbat",
          message: "Modul humidifier ultrasonic 5V aktif namun kelembapan tetap rendah (" + hum.toFixed(1) + "% RH). Kemungkinan reservoir air habis.",
          action: "Isi ulang wadah air distilasi pada modul kabut ultrasonic (GPIO 25).",
          timestamp: new Date().toISOString()
        });
      }
    }

    // 4. Deteksi Sensor Drift / Diskrepansi Sensor Suhu
    // Membandingkan DS18B20 (suhu inti telur/tengah) vs DHT22 (suhu udara atas)
    if (tDS > 0 && tDHT > 0) {
      const sensorDelta = Math.abs(tDS - tDHT);
      if (sensorDelta > 2.8) {
        anomalies.push({
          id: "sensor_drift_discrepancy",
          severity: "INFO",
          title: "Diskrepansi Sensor (DS18B20 vs DHT22)",
          message: "Perbedaan pembacaan sensor mencapai " + sensorDelta.toFixed(1) + "°C (DS18B20: " + tDS.toFixed(1) + "°C, DHT22: " + tDHT.toFixed(1) + "°C).",
          action: "Periksa sirkulasi Fan DC 6010 atau lakukan kalibrasi probe sensor.",
          timestamp: new Date().toISOString()
        });
      }
    }

    // 5. Overheat Hazard (Bahaya Kematian Embrio)
    if (tDS >= 39.2 || tDHT >= 39.5) {
      anomalies.push({
        id: "overheating_hazard",
        severity: "CRITICAL",
        title: "Bahaya Suhu Kritis Overheat (>39.2°C)",
        message: "Suhu mencapai ambang batas mematikan bagi embrio unggas. Pemanas harus segera dinonaktifkan dan fan dihidupkan.",
        action: "Sistem pengaman otomatis mematikan relay lampu dan membunyikan buzzer GPIO 14.",
        timestamp: new Date().toISOString()
      });
    }

    return anomalies;
  }

  /**
   * Logika Kendali Adaptif (Adaptive Climate Rules)
   * Mengembalikan keputusan aktuator otomatis berdasarkan parameter biologis terkini
   */
  evaluateMicroclimateControl(telemetry, currentDay = 7) {
    const stage = this.getStageProfile(currentDay);
    const tCurrent = Number(telemetry.temp_ds18b20 || telemetry.temp_dht22 || 37.8);
    const hCurrent = Number(telemetry.humidity || 60);

    let heaterDecision = false;
    let fanDecision = false;
    let humidifierDecision = false;
    let buzzerDecision = false;
    let reason = [];

    // Kendali Suhu Berbasis Histeresis Presisi
    // Setpoint target: stage.targetTemp (misal 37.8°C)
    const tLow = stage.targetTemp - 0.3;
    const tHigh = stage.targetTemp + 0.3;

    if (tCurrent < tLow) {
      heaterDecision = true;
      fanDecision = true; // Fan sirkulasi aktif meratakan panas lampu
      reason.push("Suhu (" + tCurrent.toFixed(1) + "°C) di bawah batas optimal (" + tLow.toFixed(1) + "°C): Pemanas AKTIF");
    } else if (tCurrent > tHigh) {
      heaterDecision = false;
      fanDecision = true; // Fan sirkulasi bantu membuang panas berlebih
      reason.push("Suhu (" + tCurrent.toFixed(1) + "°C) di atas batas aman (" + tHigh.toFixed(1) + "°C): Pemanas NONAKTIF, Kipas AKTIF");
    } else {
      // Suhu dalam rentang ideal, pertahankan siklus halus
      heaterDecision = tCurrent < stage.targetTemp;
      fanDecision = true;
      reason.push("Suhu stabil dalam batas ideal (" + stage.targetTemp + "°C)");
    }

    // Kendali Kelembapan Berbasis Ambang Batas
    const hLow = stage.targetHumidity - stage.humidityTolerance;
    const hHigh = stage.targetHumidity + stage.humidityTolerance;

    if (hCurrent < hLow) {
      humidifierDecision = true;
      reason.push("Kelembapan (" + hCurrent.toFixed(1) + "%) di bawah target (" + hLow + "%): Humidifier AKTIF");
    } else if (hCurrent > hHigh) {
      humidifierDecision = false;
      fanDecision = true;
      reason.push("Kelembapan (" + hCurrent.toFixed(1) + "%) di atas target: Humidifier MATI");
    } else {
      humidifierDecision = false;
    }

    // Alarm Buzzer jika kondisi di luar batas ekstrem
    if (tCurrent < 35.5 || tCurrent > 39.0 || hCurrent < 45 || hCurrent > 88) {
      buzzerDecision = true;
      reason.push("Kondisi abnormal terdeteksi: Alarm Buzzer AKTIF!");
    }

    return {
      heater: heaterDecision,
      fan: fanDecision,
      humidifier: humidifierDecision,
      buzzer: buzzerDecision,
      targetTemp: stage.targetTemp,
      targetHumidity: stage.targetHumidity,
      stageName: stage.name,
      reason: reason.join("; ")
    };
  }

  /**
   * Simulasi Computer Vision Analisis Teropong Telur (Candling Image AI Analysis)
   * Mengklasifikasikan status embrio berdasarkan fitur visual (jaringan vena, mata embrio, rongga udara, cincin darah)
   */
  analyzeEggCandling(imageType = "fertile_day7") {
    const database = {
      fertile_day7: {
        category: "FERTILE_DEVELOPING",
        title: "Embrio Fertil & Berkembang Normal (Hari ke-7)",
        confidence: 0.964,
        featuresDetected: [
          "Jaringan pembuluh darah laba-laba (spiderweb capillary pattern)",
          "Bintik gelap mata embrio aktif di pusat vaskularisasi",
          "Kantung udara (air cell) mulai terbentuk di ujung tumpul telur"
        ],
        viabilityStatus: "Sangat Sehat",
        recommendation: "Lanjutkan inkubasi dan pembalikan telur otomatis secara teratur."
      },
      fertile_day14: {
        category: "FERTILE_DEVELOPING",
        title: "Embrio Berkembang Pesat (Hari ke-14)",
        confidence: 0.981,
        featuresDetected: [
          "Massa embrio menutupi lebih dari 65% volume telur",
          "Pembuluh darah besar dan tebal terpantau menyerap nutrisi kuning telur",
          "Rongga udara berkembang simetris dan proporsional"
        ],
        viabilityStatus: "Sangat Sehat",
        recommendation: "Siapkan jadwal pendinginan telur harian (15 menit) mulai hari ke-15."
      },
      infertile: {
        category: "INFERTILE_CLEAR",
        title: "Telur Kosong / Tidak Dibuahi (Infertil)",
        confidence: 0.973,
        featuresDetected: [
          "Ruang dalam telur bening / tembus cahaya menyeluruh (clear egg)",
          "Tidak ada jaringan pembuluh darah atau bercak embrio",
          "Kuning telur mengapung bebas tanpa struktur vaskular"
        ],
        viabilityStatus: "Tidak Ada Kehidupan",
        recommendation: "Keluarkan telur dari rak inkubator agar tidak membusuk dan memengaruhi telur lain."
      },
      blood_ring: {
        category: "DEAD_EMBRYO_BLOOD_RING",
        title: "Kematian Embrio Dini (Blood Ring / Cincin Darah)",
        confidence: 0.948,
        featuresDetected: [
          "Cincin sirkular darah merah pekat di dinding cangkang",
          "Tidak tampak detak vaskular atau pertumbuhan mata embrio",
          "Disolusi jaringan pembuluh darah akibat kematian dini"
        ],
        viabilityStatus: "Embrio Mati",
        recommendation: "Keluarkan telur segera dari inkubator untuk mencegah kontaminasi bakteri gas busuk."
      },
      lockdown_ready: {
        category: "LOCKDOWN_READY",
        title: "Embrio Siap Menetas (Hari ke-30)",
        confidence: 0.989,
        featuresDetected: [
          "Hampir seluruh bagian dalam telur tampak gelap pekat (embrio penuh)",
          "Rongga udara miring menandakan persiapan paruh menembus selaput (internal pipping)",
          "Pergerakan aktif terlihat pada siluet batas kantung udara"
        ],
        viabilityStatus: "Siap Menetas",
        recommendation: "Pindahkan telur ke baki dasar, hentikan pemutaran servo, dan tingkatkan kelembapan ke 75-80%."
      }
    };

    return database[imageType] || database.fertile_day7;
  }

  /**
   * Asisten Cerdas Diagnosis & Konsultasi Penetasan Telur Entok
   */
  consultAI(query = "") {
    const q = query.toLowerCase();

    if (q.includes("suhu") && (q.includes("turun") || q.includes("dingin") || q.includes("rendah"))) {
      return {
        answer: "Jika suhu inkubator turun di bawah 37.0°C:\n1. Cek indikator lampu pemanas: pastikan kedua lampu pijar 5W menyala. Jika mati, cek relay GPIO 26 dan filamen lampu.\n2. Pastikan pintu inkubator dan lubang ventilasi tidak terbuka berlebihan.\n3. Periksa catu daya adaptor 12V dan modul stepdown LM2596.",
        category: "Troubleshooting Suhu",
        suggestedActions: ["Cek Relay Pemanas", "Tutup Rapat Pintu Inkubator", "Verifikasi Sensor DS18B20"]
      };
    }

    if (q.includes("kelembapan") || q.includes("lembab") || q.includes("humidifier")) {
      return {
        answer: "Kelembapan optimal telur entok terbagi dalam dua tahap:\n- Hari 1 sampai 29: 55% - 65% RH.\n- Hari 30 sampai 35 (Lockdown): 75% - 80% RH.\nJika kelembapan terlalu rendah, embrio berisiko lengket di selaput telur saat menetas. Jika humidifier aktif tapi kelembapan tidak naik, periksa ketersediaan air distilasi pada spons modul ultrasonic.",
        category: "Manajemen Kelembapan",
        suggestedActions: ["Periksa Wadah Air Humidifier", "Sesuaikan Duty Cycle GPIO 25", "Lakukan Pengabutan Manual jika perlu"]
      };
    }

    if (q.includes("balik") || q.includes("putar") || q.includes("servo") || q.includes("tilting")) {
      return {
        answer: "Pembalikan telur entok dilakukan dengan motor servo SG90 memiringkan rak sudut 45 derajat setiap 3 sampai 4 jam sekali dari hari ke-1 hingga hari ke-29. Tujuannya agar kantung kuning telur tidak menempel pada dinding cangkang. Pada hari ke-30 ke atas, pembalikan HARUS DIHENTIKAN agar anak entok dapat mengatur posisi kepalanya ke arah rongga udara untuk memecah cangkang.",
        category: "Mekanisme Pembalik Telur",
        suggestedActions: ["Uji Rotasi Servo Sekarang", "Cek Jadwal Otomatis 4 Jam", "Pastikan Henti Putar di Hari ke-30"]
      };
    }

    if (q.includes("candling") || q.includes("teropong") || q.includes("senter")) {
      return {
        answer: "Jadwal peneropongan (candling) telur entok yang dianjurkan:\n- Hari ke-7: Deteksi fertil/infertil (tampak pembuluh darah seperti sarang laba-laba).\n- Hari ke-14: Memantau pertumbuhan embrio dan membuang telur busuk/blood ring.\n- Hari ke-28: Evaluasi akhir sebelum fase lockdown hari ke-30.",
        category: "Prosedur Candling",
        suggestedActions: ["Buka Tab Analisis AI Candling", "Gunakan Ruang Gelap & Senter Terang", "Pisahkan Telur Bening/Infertil"]
      };
    }

    if (q.includes("dingin") || q.includes("cooling") || q.includes("misting") || q.includes("semprot")) {
      return {
        answer: "Berbeda dari telur ayam, telur entok memiliki cangkang dan lapisan lilin (kutikula) yang tebal. Mulai hari ke-15 hingga hari ke-29, dianjurkan melakukan pendinginan (cooling) selama 10-15 menit per hari dengan membuka tutup atau mematikan pemanas sebentar dan menyemprotkan kabut air hangat tipis. Ini meniru perilaku induk entok yang sering mandi ke air lalu mengerami kembali.",
        category: "Karakteristik Telur Entok",
        suggestedActions: ["Jadwalkan Cooling 15 Menit", "Gunakan Air Suam Kuku", "Lakukan di Siang Hari"]
      };
    }

    // Default general response
    return {
      answer: "Sistem Inkubator Pintar NETESIN mengintegrasikan kontrol IoT berbasis ESP32, model analitik AI untuk prediksi daya tetas dan deteksi anomali, serta arsitektur sistem terintegrasi. Anda dapat menanyakan tentang pengaturan suhu, kelembapan, mekanisme servo pembalik telur, prosedur candling, atau diagnosis kesalahan sistem.",
      category: "Konsultasi Umum",
      suggestedActions: ["Periksa Status Telemetri Real-time", "Jalankan Diagnosis Anomali AI", "Lihat Jadwal Siklus Inkubasi"]
    };
  }
}

module.exports = new AIEngine();

