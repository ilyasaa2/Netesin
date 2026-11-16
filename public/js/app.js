/**
 * public/js/app.js
 * Frontend Controller untuk Sistem Inkubator Telur Entok Pintar (NETESIN)
 * Universitas Tidar 2026
 */

(function () {
  'use strict';

  // State Aplikasi
  const state = {
    connected: false,
    theme: localStorage.getItem('netesin_theme') || 'light',
    currentTab: 'tab-dashboard',
    device: {
      temp_ds18b20: 37.84,
      temp_dht22: 37.72,
      humidity: 62.4,
      heater: true,
      fan: true,
      humidifier: false,
      servo_angle: 45,
      buzzer: false,
      control_mode: 'AUTO',
      hardware_source: 'SIMULATOR',
      currentDay: 8
    },
    aiHealth: {
      hsiPercentage: 94.5,
      grade: 'Optimal'
    },
    audioCtx: null,
    charts: {
      temp: null,
      humidity: null
    }
  };

  // =========================================================================
  // 1. Inisialisasi Tema & Tampilan (R-21, R-34)
  // =========================================================================
  function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();

    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('netesin_theme', state.theme);
        document.documentElement.setAttribute('data-theme', state.theme);
        updateThemeIcon();
        updateChartsTheme();
      });
    }
  }

  function updateThemeIcon() {
    const icon = document.getElementById('themeIcon');
    if (icon) {
      icon.textContent = state.theme === 'dark' ? '☀️' : '🌙';
    }
  }

  // =========================================================================
  // 2. Navigasi Tab (R-24, R-32, R-39)
  // =========================================================================
  function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        switchTab(targetTab);
      });
    });
  }

  function switchTab(tabId) {
    state.currentTab = tabId;

    // Update tombol tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const match = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
    });

    // Update panel konten
    document.querySelectorAll('.tab-content').forEach(panel => {
      if (panel.id === tabId) {
        panel.style.display = 'block';
      } else {
        panel.style.display = 'none';
      }
    });

    // Trigger chart resize jika kembali ke dashboard
    if (tabId === 'tab-dashboard' && state.charts.temp) {
      state.charts.temp.resize();
      state.charts.humidity.resize();
    }
  }

  // =========================================================================
  // 3. Audio Synthesizer (Simulasi Suara Buzzer Fisik)
  // =========================================================================
  function playBuzzerBeep(durationMs = 250, freq = 950) {
    try {
      if (!state.audioCtx) {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
      }
      const osc = state.audioCtx.createOscillator();
      const gain = state.audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, state.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, state.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(state.audioCtx.destination);
      osc.start();
      osc.stop(state.audioCtx.currentTime + durationMs / 1000);
    } catch (e) {
      console.warn("Audio Context belum aktif:", e.message);
    }
  }

  // =========================================================================
  // 4. Inisialisasi Grafik Real-Time Chart.js
  // =========================================================================
  function initCharts() {
    if (typeof Chart === 'undefined') {
      console.warn("Chart.js sedang dimuat...");
      setTimeout(initCharts, 200);
      return;
    }
    const isDark = state.theme === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    // Grafik Suhu
    const ctxTemp = document.getElementById('tempChart');
    if (ctxTemp && !state.charts.temp) {
      state.charts.temp = new Chart(ctxTemp, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Suhu Inti (DS18B20)',
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              borderWidth: 2,
              tension: 0.35,
              fill: false,
              data: []
            },
            {
              label: 'Suhu Udara (DHT22)',
              borderColor: '#0284c7',
              backgroundColor: 'rgba(2, 132, 199, 0.1)',
              borderWidth: 1.5,
              borderDash: [4, 4],
              tension: 0.35,
              fill: false,
              data: []
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 300 },
          scales: {
            y: {
              min: 35.0,
              max: 40.0,
              grid: { color: gridColor },
              ticks: { color: textColor, callback: (v) => v + ' °C' }
            },
            x: {
              grid: { display: false },
              ticks: { color: textColor, maxTicksLimit: 6 }
            }
          },
          plugins: {
            legend: {
              position: 'top',
              labels: { color: textColor, boxWidth: 12 }
            }
          }
        }
      });
    }

    // Grafik Kelembapan
    const ctxHum = document.getElementById('humidityChart');
    if (ctxHum && !state.charts.humidity) {
      state.charts.humidity = new Chart(ctxHum, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Kelembapan Udara (RH %)',
              borderColor: '#059669',
              backgroundColor: 'rgba(5, 150, 105, 0.15)',
              borderWidth: 2,
              tension: 0.35,
              fill: true,
              data: []
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 300 },
          scales: {
            y: {
              min: 40.0,
              max: 90.0,
              grid: { color: gridColor },
              ticks: { color: textColor, callback: (v) => v + ' %' }
            },
            x: {
              grid: { display: false },
              ticks: { color: textColor, maxTicksLimit: 6 }
            }
          },
          plugins: {
            legend: {
              position: 'top',
              labels: { color: textColor, boxWidth: 12 }
            }
          }
        }
      });
    }
  }

  function updateChartsTheme() {
    const isDark = state.theme === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    [state.charts.temp, state.charts.humidity].forEach(chart => {
      if (chart) {
        chart.options.scales.y.grid.color = gridColor;
        chart.options.scales.y.ticks.color = textColor;
        chart.options.scales.x.ticks.color = textColor;
        chart.options.plugins.legend.labels.color = textColor;
        chart.update();
      }
    });
  }

  function pushChartData(timeLabel, tempDS, tempDHT, humidity) {
    if (state.charts.temp) {
      const chart = state.charts.temp;
      chart.data.labels.push(timeLabel);
      chart.data.datasets[0].data.push(tempDS);
      chart.data.datasets[1].data.push(tempDHT);
      if (chart.data.labels.length > 25) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
      }
      chart.update('none');
    }

    if (state.charts.humidity) {
      const chart = state.charts.humidity;
      chart.data.labels.push(timeLabel);
      chart.data.datasets[0].data.push(humidity);
      if (chart.data.labels.length > 25) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
      }
      chart.update('none');
    }
  }

  // =========================================================================
  // 5. Koneksi Real-time WebSocket
  // =========================================================================
  let ws = null;
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      state.connected = true;
      updateConnectionStatus(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'INITIAL_STATE') {
          handleInitialState(msg);
        } else if (msg.type === 'TELEMETRY_UPDATE') {
          handleTelemetryUpdate(msg);
        }
      } catch (err) {
        console.error("Kesalahan parsing WS:", err);
      }
    };

    ws.onclose = () => {
      state.connected = false;
      updateConnectionStatus(false);
      setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  function updateConnectionStatus(isConnected) {
    const pill = document.getElementById('wsStatusPill');
    const txt = document.getElementById('wsStatusText');
    if (pill && txt) {
      if (isConnected) {
        pill.className = 'meta-pill status-connected';
        txt.textContent = 'Sistem Terhubung';
      } else {
        pill.className = 'meta-pill';
        pill.style.borderColor = 'var(--rose-border)';
        pill.style.color = 'var(--rose-danger)';
        txt.textContent = 'Menghubungkan Ulang...';
      }
    }
  }

  function handleInitialState(data) {
    if (data.state) {
      updateUIFromState(data.state);
    }
    if (data.aiHealth) {
      updateAIHealthUI(data.aiHealth);
    }
    if (data.history && data.history.length > 0) {
      data.history.forEach(item => {
        const timeStr = new Date(item.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        pushChartData(timeStr, item.temp_ds18b20, item.temp_dht22, item.humidity);
      });
    }
    if (data.activeBatch) {
      updateBatchUI(data.activeBatch);
    }
    if (data.alerts) {
      renderAuditLogs(data.alerts);
    }
  }

  function handleTelemetryUpdate(data) {
    if (data.state) {
      updateUIFromState(data.state);
      const timeStr = new Date(data.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      pushChartData(timeStr, data.state.temp_ds18b20, data.state.temp_dht22, data.state.humidity);
    }
    if (data.aiHealth) {
      updateAIHealthUI(data.aiHealth);
    }
    if (data.anomalies) {
      handleAnomaliesBanner(data.anomalies);
    }
    if (data.activeBatch) {
      updateBatchUI(data.activeBatch);
    }
  }

  // =========================================================================
  // 6. Sinkronisasi UI dengan State Perangkat & Aktuator
  // =========================================================================
  function updateUIFromState(dev) {
    state.device = { ...state.device, ...dev };

    // Update Metrik Utama
    const elTempDS = document.getElementById('valTempDS18B20');
    const elTempDHT = document.getElementById('valTempDHT22');
    const elHum = document.getElementById('valHumidity');

    if (elTempDS) elTempDS.textContent = dev.temp_ds18b20.toFixed(2);
    if (elTempDHT) elTempDHT.textContent = dev.temp_dht22.toFixed(2);
    if (elHum) elHum.textContent = dev.humidity.toFixed(1);

    // Indikator Suhu Aman / Bahaya
    const badgeTempDS = document.getElementById('badgeTempDS18B20');
    if (badgeTempDS) {
      if (dev.temp_ds18b20 > 38.6) {
        badgeTempDS.textContent = '▲ Suhu Panas (Di Atas Batas)';
        badgeTempDS.style.color = 'var(--rose-danger)';
      } else if (dev.temp_ds18b20 < 37.4) {
        badgeTempDS.textContent = '▼ Suhu Dingin (Pemanas Diperlukan)';
        badgeTempDS.style.color = 'var(--amber-heat)';
      } else {
        badgeTempDS.textContent = '● Target Ideal (37.5 - 38.5°C)';
        badgeTempDS.style.color = 'var(--emerald-primary)';
      }
    }

    // Hardware source pill
    const hwText = document.getElementById('hardwareModeText');
    if (hwText) {
      hwText.textContent = dev.hardware_source === 'PHYSICAL_ESP32' ? 'ESP32 Fisik (Online)' : 'Simulator ESP32';
    }

    // Aktuator Cards Status
    updateActuatorItem('actuatorCardHeater', 'badgeHeater', dev.heater, 'active-heater', 'AKTIF', 'MATI');
    updateActuatorItem('actuatorCardFan', 'badgeFan', dev.fan, 'active-fan', 'AKTIF', 'MATI');
    updateActuatorItem('actuatorCardHumidifier', 'badgeHumidifier', dev.humidifier, 'active-humidifier', 'AKTIF', 'MATI');
    updateActuatorItem('actuatorCardBuzzer', 'badgeBuzzer', dev.buzzer, 'active-alarm', 'BUNYI ALARM', 'NORMAL');

    // Jika buzzer aktif dan baru menyala, bunyikan web synthesizer beep
    if (dev.buzzer) {
      playBuzzerBeep(200, 1050);
    }

    // Animasi Kemiringan Rak Telur (Tilting Servo)
    const trayBar = document.getElementById('trayBarVisual');
    const servoAngleBadge = document.getElementById('servoAngleBadge');
    if (trayBar) {
      // Rotasikan visualizer sesuai sudut derajat servo (-45 s/d 45)
      const angle = dev.servo_angle || 0;
      trayBar.style.transform = `rotate(${angle / 2.5}deg)`;
    }
    if (servoAngleBadge) {
      if (dev.servo_angle > 0) servoAngleBadge.textContent = `+${dev.servo_angle}° Kanan`;
      else if (dev.servo_angle < 0) servoAngleBadge.textContent = `${dev.servo_angle}° Kiri`;
      else servoAngleBadge.textContent = '0° Posisi Datar';
    }

    // Hitung Mundur Putaran Berikutnya
    const countdownEl = document.getElementById('nextTurnCountdown');
    if (countdownEl && dev.next_turn_seconds !== undefined) {
      const hrs = Math.floor(dev.next_turn_seconds / 3600);
      const mins = Math.floor((dev.next_turn_seconds % 3600) / 60);
      const secs = dev.next_turn_seconds % 60;
      countdownEl.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Mode Kendali Pill & Switcher
    const modePill = document.getElementById('controlModePill');
    const modeToggle = document.getElementById('modeToggleCheckbox');
    const modeLabel = document.getElementById('modeToggleLabel');

    if (modePill) {
      const isAuto = dev.control_mode === 'AUTO';
      modePill.textContent = isAuto ? 'MODE OTOMATIS' : 'MODE MANUAL (OVERRIDE)';
      modePill.style.backgroundColor = isAuto ? 'var(--emerald-subtle)' : 'var(--amber-subtle)';
      modePill.style.color = isAuto ? 'var(--emerald-primary)' : 'var(--amber-heat)';
    }
    if (modeToggle) {
      modeToggle.checked = dev.control_mode === 'MANUAL';
    }
    if (modeLabel) {
      modeLabel.textContent = dev.control_mode === 'MANUAL' ? 'Mode Manual (Aktif)' : 'Mode Otomatis (AI)';
    }

    // Update Penampang SVG Digital Twin (Sesuai Prototipe Fisik)
    const svgDigitalTemp = document.getElementById('svgDigitalTemp');
    if (svgDigitalTemp && dev.temp_ds18b20 !== undefined) {
      svgDigitalTemp.textContent = dev.temp_ds18b20.toFixed(1);
    }

    const svgLamp1 = document.getElementById('svgLamp1');
    if (svgLamp1) {
      const circle = svgLamp1.querySelector('circle');
      if (circle) circle.setAttribute('opacity', dev.heater ? '0.95' : '0.2');
    }

    const svgRack = document.getElementById('svgEggRack');
    if (svgRack) {
      svgRack.setAttribute('transform', `translate(180, 165) rotate(${dev.servo_angle / 3.5})`);
    }
  }

  function updateActuatorItem(cardId, badgeId, isActive, activeClass, textOn, textOff) {
    const card = document.getElementById(cardId);
    const badge = document.getElementById(badgeId);
    if (card) card.classList.toggle(activeClass, isActive);
    if (badge) {
      badge.textContent = isActive ? textOn : textOff;
      badge.className = isActive ? 'badge-status on' : 'badge-status off';
    }
  }

  // =========================================================================
  // 7. Update UI Kecerdasan Buatan (AI)
  // =========================================================================
  function updateAIHealthUI(ai) {
    state.aiHealth = ai;

    const elVal = document.getElementById('valHSI');
    const elBig = document.getElementById('aiHsiBig');
    const elBadge = document.getElementById('badgeHSI');
    const elGrade = document.getElementById('aiHealthGrade');
    const elRec = document.getElementById('aiRecommendationText');

    if (elVal) elVal.textContent = ai.hsiPercentage.toFixed(1);
    if (elBig) elBig.textContent = ai.hsiPercentage.toFixed(1) + '%';
    if (elBadge) elBadge.textContent = '● Status ' + ai.grade;
    if (elGrade) elGrade.textContent = ai.grade;
    if (elRec && ai.recommendation) elRec.textContent = ai.recommendation;

    if (ai.factors) {
      const fT = document.getElementById('valFactorThermal');
      const fH = document.getElementById('valFactorHumidity');
      const fTurn = document.getElementById('valFactorTurning');
      const fStress = document.getElementById('valFactorStress');

      if (fT) fT.textContent = ai.factors.thermalStability + '%';
      if (fH) fH.textContent = ai.factors.humidityCompliance + '%';
      if (fTurn) fTurn.textContent = ai.factors.turningCompliance + '%';
      if (fStress) {
        fStress.textContent = ai.factors.environmentalStress + '%';
        fStress.style.color = ai.factors.environmentalStress > 20 ? 'var(--rose-danger)' : 'var(--emerald-primary)';
      }
    }
  }

  function handleAnomaliesBanner(anomalies) {
    const banner = document.getElementById('anomalyAlertBanner');
    const title = document.getElementById('anomalyTitle');
    const msg = document.getElementById('anomalyMessage');
    const action = document.getElementById('anomalyAction');

    if (!banner) return;

    if (anomalies && anomalies.length > 0) {
      const critical = anomalies.find(a => a.severity === 'CRITICAL') || anomalies[0];
      banner.style.display = 'flex';
      banner.className = critical.severity === 'CRITICAL' ? 'alert-banner' : 'alert-banner info-style';
      if (title) title.textContent = critical.title;
      if (msg) msg.textContent = critical.message;
      if (action) action.textContent = '💡 Tindakan: ' + critical.action;
    } else {
      banner.style.display = 'none';
    }
  }

  // =========================================================================
  // 8. Update UI Batch Penetasan
  // =========================================================================
  function updateBatchUI(batch) {
    const bTitle = document.getElementById('batchTitle');
    const bBreed = document.getElementById('batchBreed');
    const bDay = document.getElementById('batchCurrentDay');
    const bBadge = document.getElementById('batchDayBadge');
    const bProgress = document.getElementById('batchProgressBar');
    const bHatch = document.getElementById('batchHatchDate');
    const sliderDay = document.getElementById('sliderIncubationDay');
    const sliderLabel = document.getElementById('sliderDayLabel');

    if (bTitle) bTitle.textContent = batch.title;
    if (bBreed) bBreed.textContent = `${batch.breed} - ${batch.totalEggs} Butir`;
    if (bDay) bDay.textContent = batch.currentDay;
    if (bBadge) bBadge.textContent = `Hari ke-${batch.currentDay} / 35 Hari`;
    if (bProgress) {
      const pct = Math.min(100, Math.round((batch.currentDay / 35) * 100));
      bProgress.style.width = pct + '%';
    }
    if (bHatch && batch.expectedHatchDate) {
      bHatch.textContent = batch.expectedHatchDate;
    }

    // Sinkronkan slider fase di tab AI
    if (sliderDay && Number(sliderDay.value) !== batch.currentDay) {
      sliderDay.value = batch.currentDay;
    }
    if (sliderLabel) {
      let stageName = 'Fase Awal';
      if (batch.currentDay >= 30) stageName = 'Fase Lockdown (Siap Menetas)';
      else if (batch.currentDay >= 15) stageName = 'Fase Pertumbuhan & Cooling';
      sliderLabel.textContent = `Hari ke-${batch.currentDay} (${stageName})`;
    }

    highlightActiveStageRow(batch.currentDay);
  }

  function highlightActiveStageRow(day) {
    const rowEarly = document.getElementById('rowStageEarly');
    const rowMid = document.getElementById('rowStageMid');
    const rowLockdown = document.getElementById('rowStageLockdown');

    [rowEarly, rowMid, rowLockdown].forEach(r => {
      if (r) r.style.backgroundColor = 'transparent';
    });

    if (day >= 30 && rowLockdown) {
      rowLockdown.style.backgroundColor = 'var(--rose-subtle)';
    } else if (day >= 15 && rowMid) {
      rowMid.style.backgroundColor = 'var(--sky-subtle)';
    } else if (rowEarly) {
      rowEarly.style.backgroundColor = 'var(--emerald-subtle)';
    }
  }

  // =========================================================================
  // 9. Event Listeners: Kontrol Aktuator (Tab IoT)
  // =========================================================================
  function initActuatorControls() {
    // Mode Toggle (Auto vs Manual)
    const modeToggle = document.getElementById('modeToggleCheckbox');
    if (modeToggle) {
      modeToggle.addEventListener('change', (e) => {
        const newMode = e.target.checked ? 'MANUAL' : 'AUTO';
        sendControlCommand({ control_mode: newMode });
      });
    }

    // Tombol Lampu Pijar
    bindButtonCommand('btnHeaterOn', { heater: true, control_mode: 'MANUAL' });
    bindButtonCommand('btnHeaterOff', { heater: false, control_mode: 'MANUAL' });

    // Tombol Fan DC
    bindButtonCommand('btnFanOn', { fan: true, control_mode: 'MANUAL' });
    bindButtonCommand('btnFanOff', { fan: false, control_mode: 'MANUAL' });

    // Tombol Humidifier
    bindButtonCommand('btnHumidifierOn', { humidifier: true, control_mode: 'MANUAL' });
    bindButtonCommand('btnHumidifierOff', { humidifier: false, control_mode: 'MANUAL' });

    // Tombol Servo Pembalik Telur
    bindButtonCommand('btnServoLeft', { servo_angle: -45, control_mode: 'MANUAL' });
    bindButtonCommand('btnServoFlat', { servo_angle: 0, control_mode: 'MANUAL' });
    bindButtonCommand('btnServoRight', { servo_angle: 45, control_mode: 'MANUAL' });

    const btnRotateNow = document.getElementById('btnRotateNow');
    if (btnRotateNow) {
      btnRotateNow.addEventListener('click', () => {
        const nextAngle = state.device.servo_angle === 45 ? -45 : 45;
        sendControlCommand({ servo_angle: nextAngle });
      });
    }

    // Uji Buzzer
    const btnTestBuzzer = document.getElementById('btnTestBuzzer');
    if (btnTestBuzzer) {
      btnTestBuzzer.addEventListener('click', () => {
        playBuzzerBeep(400, 1100);
        sendControlCommand({ buzzer: true });
        setTimeout(() => {
          sendControlCommand({ buzzer: false });
        }, 800);
      });
    }

    // Dismiss Alert
    const dismissBtn = document.getElementById('dismissAlertBtn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        const banner = document.getElementById('anomalyAlertBanner');
        if (banner) banner.style.display = 'none';
      });
    }

    // Quick Edit Batch Shortcut
    const quickEditBtn = document.getElementById('quickEditBatchBtn');
    if (quickEditBtn) {
      quickEditBtn.addEventListener('click', () => {
        switchTab('tab-integration');
        const inputTitle = document.getElementById('inputBatchTitle');
        if (inputTitle) inputTitle.focus();
      });
    }
  }

  function bindButtonCommand(elementId, commandPayload) {
    const btn = document.getElementById(elementId);
    if (btn) {
      btn.addEventListener('click', () => {
        sendControlCommand(commandPayload);
      });
    }
  }

  function sendControlCommand(payload) {
    // Kirim via WebSocket jika terhubung
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'CONTROL_COMMAND',
        controls: payload
      }));
    }

    // Kirim juga via HTTP POST untuk memastikan tersimpan
    fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => console.error("Gagal mengirim perintah kontrol:", err));
  }

  // =========================================================================
  // 10. Fault Injection Lab (Simulasi Anomali Sidang)
  // =========================================================================
  function initFaultLab() {
    bindFaultButton('faultHeaterBroken', 'heater_broken');
    bindFaultButton('faultLidOpen', 'lid_open');
    bindFaultButton('faultHumidifierEmpty', 'humidifier_empty');
    bindFaultButton('faultOverheat', 'overheat');
    bindFaultButton('faultReset', 'reset');
  }

  function bindFaultButton(btnId, faultType) {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => {
        fetch('/api/simulator/fault', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ faultType })
        })
          .then(res => res.json())
          .then(data => {
            console.log("Fault Injected:", data);
          })
          .catch(err => console.error("Fault error:", err));
      });
    }
  }

  // =========================================================================
  // 11. Tab AI: Slider Hari & Computer Vision Candling Simulator
  // =========================================================================
  function initAIInteractions() {
    // Slider Hari Inkubasi
    const slider = document.getElementById('sliderIncubationDay');
    if (slider) {
      slider.addEventListener('input', (e) => {
        const day = Number(e.target.value);
        sendControlCommand({ currentDay: day });
        highlightActiveStageRow(day);
      });
    }

    // Pemilih Sampel Foto Candling Telur
    const candlingBtns = document.querySelectorAll('.btn-candling-sample');
    candlingBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        candlingBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const sampleKey = btn.getAttribute('data-sample');
        fetchCandlingResult(sampleKey);
      });
    });

    // Chatbot Konsultasi AI
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInputText');
    const promptChips = document.querySelectorAll('.prompt-chip');

    promptChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const q = chip.getAttribute('data-query');
        if (chatInput) {
          chatInput.value = q;
          submitChatMessage(q);
        }
      });
    });

    if (chatForm) {
      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (text) {
          submitChatMessage(text);
          chatInput.value = '';
        }
      });
    }
  }

  function fetchCandlingResult(imageType) {
    fetch('/api/ai/candling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageType })
    })
      .then(res => res.json())
      .then(res => {
        const titleEl = document.getElementById('candlingResultTitle');
        const confEl = document.getElementById('candlingConfidence');
        const listEl = document.getElementById('candlingFeaturesList');
        const recEl = document.getElementById('candlingRecommendation');
        const eggVisual = document.getElementById('candlingVisualEgg');
        const veinsG = document.getElementById('candlingVeinsG');

        if (titleEl) titleEl.textContent = res.title;
        if (confEl) confEl.textContent = (res.confidence * 100).toFixed(1) + '%';
        if (recEl) recEl.textContent = ' ' + res.recommendation;

        if (listEl && res.featuresDetected) {
          listEl.innerHTML = res.featuresDetected.map(f => `<li>${f}</li>`).join('');
        }

        // Ubah visualisasi telur sesuai kategori candling
        if (eggVisual && veinsG) {
          if (imageType === 'infertile') {
            eggVisual.style.background = 'radial-gradient(circle at 45% 45%, #fef08a 0%, #facc15 60%, #ca8a04 100%)';
            veinsG.innerHTML = ''; // Telur bening tanpa pembuluh darah
          } else if (imageType === 'blood_ring') {
            eggVisual.style.background = 'radial-gradient(circle at 45% 45%, #fed7aa 0%, #ea580c 50%, #7f1d1d 100%)';
            veinsG.innerHTML = `<circle cx="80" cy="100" r="38" stroke="#b91c1c" stroke-width="4" fill="none" opacity="0.9"/>`;
          } else if (imageType === 'lockdown_ready') {
            eggVisual.style.background = '#1e1b4b';
            veinsG.innerHTML = `<path d="M30,120 Q80,110 130,125" stroke="#fde047" stroke-width="2" fill="none"/>`;
          } else {
            // Normal fertile
            eggVisual.style.background = 'radial-gradient(circle at 45% 45%, #fed7aa 0%, #ea580c 50%, #7c2d12 100%)';
            veinsG.innerHTML = `
              <circle cx="75" cy="95" r="7" fill="#7f1d1d"/>
              <path d="M75,95 Q50,75 30,85 M75,95 Q90,70 120,75 M75,95 Q60,130 45,150 M75,95 Q105,125 130,140 M75,95 Q115,100 145,105" stroke="#991b1b" stroke-width="2.5" fill="none"/>
            `;
          }
        }
      })
      .catch(err => console.error("Candling fetch error:", err));
  }

  function submitChatMessage(message) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;

    // Render pesan user
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user-msg';
    userBubble.textContent = message;
    container.appendChild(userBubble);
    container.scrollTop = container.scrollHeight;

    // Tampilkan placeholder loading AI
    const aiBubble = document.createElement('div');
    aiBubble.className = 'chat-bubble ai-msg';
    aiBubble.innerHTML = '<em>Sedang menganalisis kendala...</em>';
    container.appendChild(aiBubble);
    container.scrollTop = container.scrollHeight;

    fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    })
      .then(res => res.json())
      .then(res => {
        aiBubble.innerHTML = `<strong>Kategori: ${res.category}</strong><br>` +
          res.answer.replace(/\n/g, '<br>') +
          (res.suggestedActions ? `<br><br><span style="font-size: 0.75rem; color: var(--emerald-primary);"><strong>Saran Cepat:</strong> ${res.suggestedActions.join(', ')}</span>` : '');
        container.scrollTop = container.scrollHeight;
      })
      .catch(err => {
        aiBubble.textContent = "Maaf, terjadi kendala komunikasi dengan asisten AI.";
      });
  }

  // =========================================================================
  // 12. Tab Modul Sistem Terintegrasi: Batch & Telegram Webhook
  // =========================================================================
  function initIntegrationModule() {
    // Form Pengaturan Batch
    const batchForm = document.getElementById('batchSettingsForm');
    if (batchForm) {
      batchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const payload = {
          title: document.getElementById('inputBatchTitle').value,
          breed: document.getElementById('inputBatchBreed').value,
          totalEggs: Number(document.getElementById('inputTotalEggs').value),
          startDate: document.getElementById('inputStartDate').value,
          currentDay: Number(document.getElementById('inputCurrentDay').value)
        };

        fetch('/api/batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(res => res.json())
          .then(data => {
            alert('Data Batch Berhasil Disimpan!');
            updateBatchUI(data.activeBatch);
          })
          .catch(err => alert('Gagal menyimpan batch: ' + err.message));
      });
    }

    // Uji Coba Kirim Webhook Telegram
    const btnTestTg = document.getElementById('btnTestTelegramAlert');
    if (btnTestTg) {
      btnTestTg.addEventListener('click', () => {
        fetch('/api/telegram/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
          .then(res => res.json())
          .then(data => {
            alert(`✅ [TELEGRAM WEBHOOK DISPATCHED]\\nTarget Chat: ${data.targetChatId}\\nPesan dikirim ke gateway bot!`);
            // Refresh audit logs
            fetchInitialAuditLogs();
          })
          .catch(err => alert('Gagal memicu webhook: ' + err.message));
      });
    }

    // Tombol Cetak Dokumen Laporan Pengujian
    const printBtn = document.getElementById('btnPrintReportBtn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // Form Pengaturan Database Eksternal Cloud
    const extDbForm = document.getElementById('externalDbForm');
    const selectProvider = document.getElementById('selectDbProvider');
    const inputDbUrl = document.getElementById('inputDbUrl');
    const inputDbKey = document.getElementById('inputDbApiKey');
    const inputDbTable = document.getElementById('inputDbTable');
    const chkEnableDb = document.getElementById('chkEnableExternalDb');
    const btnTestDb = document.getElementById('btnTestExternalDb');
    const badgeDbStatus = document.getElementById('externalDbStatusBadge');
    const valTotalSynced = document.getElementById('valTotalSyncedDb');

    // Muat konfigurasi database saat ini
    fetch('/api/database/config')
      .then(res => res.json())
      .then(cfg => {
        if (selectProvider) selectProvider.value = cfg.provider || 'FIREBASE';
        if (inputDbUrl) inputDbUrl.value = cfg.url || '';
        if (inputDbKey) inputDbKey.value = cfg.apiKey || '';
        if (inputDbTable) inputDbTable.value = cfg.tableName || 'telemetry_logs';
        if (chkEnableDb) chkEnableDb.checked = Boolean(cfg.enabled);
        if (valTotalSynced) valTotalSynced.textContent = cfg.totalSyncedCount || 0;
        if (badgeDbStatus) {
          if (cfg.enabled) {
            badgeDbStatus.textContent = 'Cloud Sync Aktif (' + cfg.provider + ')';
            badgeDbStatus.style.backgroundColor = 'var(--emerald-subtle)';
            badgeDbStatus.style.color = 'var(--emerald-primary)';
          } else {
            badgeDbStatus.textContent = 'Lokal (Siap Sinkron Cloud)';
            badgeDbStatus.style.backgroundColor = 'var(--amber-subtle)';
            badgeDbStatus.style.color = 'var(--amber-heat)';
          }
        }
      })
      .catch(e => console.warn("Load DB config error:", e));

    if (extDbForm) {
      extDbForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const payload = {
          provider: selectProvider.value,
          url: inputDbUrl.value.trim(),
          apiKey: inputDbKey.value.trim(),
          tableName: inputDbTable.value.trim(),
          enabled: chkEnableDb.checked
        };

        fetch('/api/database/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(res => res.json())
          .then(data => {
            alert('Pengaturan Database Eksternal Berhasil Disimpan!');
            if (badgeDbStatus) {
              badgeDbStatus.textContent = data.config.enabled ? 'Cloud Sync Aktif (' + data.config.provider + ')' : 'Lokal (Cloud Dimatikan)';
              badgeDbStatus.style.color = data.config.enabled ? 'var(--emerald-primary)' : 'var(--amber-heat)';
            }
          })
          .catch(err => alert('Gagal menyimpan konfigurasi cloud: ' + err.message));
      });
    }

    if (btnTestDb) {
      btnTestDb.addEventListener('click', () => {
        btnTestDb.disabled = true;
        btnTestDb.textContent = 'Sedang Menguji Koneksi...';
        fetch('/api/database/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
          .then(res => {
            if (!res.ok) throw new Error("Status HTTP " + res.status);
            return res.json();
          })
          .then(res => {
            alert('✅ Berhasil Terhubung ke Database Eksternal (' + res.provider + ')!\nURL: ' + res.targetUrl);
          })
          .catch(err => {
            alert('❌ Pengujian Koneksi Database:\n' + err.message + '\n\nPastikan URL database cloud aktif dan dapat diakses.');
          })
          .finally(() => {
            btnTestDb.disabled = false;
            btnTestDb.textContent = '🧪 Uji Sambungan Cloud Database';
          });
      });
    }

    // Ambil dan Tampilkan Kode Firmware ESP32
    fetchFirmwareCode();
  }

  function fetchFirmwareCode() {
    fetch('/api/firmware')
      .then(res => res.json())
      .then(data => {
        const codeDisplay = document.getElementById('firmwareCodeDisplay');
        if (codeDisplay && data.code) {
          codeDisplay.textContent = data.code;
        }
      })
      .catch(e => console.warn("Firmware code error:", e));

    const copyBtn = document.getElementById('btnCopyFirmware');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const codeDisplay = document.getElementById('firmwareCodeDisplay');
        if (codeDisplay) {
          navigator.clipboard.writeText(codeDisplay.textContent).then(() => {
            alert('Kode Sumber Arduino C++ berhasil disalin ke clipboard!');
          });
        }
      });
    }
  }

  function renderAuditLogs(alerts) {
    const tbody = document.getElementById('auditLogsTableBody');
    if (!tbody) return;

    if (!alerts || alerts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Belum ada log anomali tercatat. Sistem beroperasi stabil.</td></tr>`;
      return;
    }

    tbody.innerHTML = alerts.map(a => {
      const timeStr = new Date(a.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
      const severityColor = a.severity === 'CRITICAL' ? 'var(--rose-danger)' : (a.severity === 'WARNING' ? 'var(--amber-heat)' : 'var(--emerald-primary)');

      return `
        <tr>
          <td style="font-family: monospace;">${timeStr}</td>
          <td><strong style="color: ${severityColor};">${a.severity || 'INFO'}</strong></td>
          <td>${a.title}</td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${a.message}</td>
        </tr>
      `;
    }).join('');
  }

  function fetchInitialAuditLogs() {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        if (data.anomalies) {
          renderAuditLogs(data.anomalies);
        }
      });
  }

  // =========================================================================
  // Inisialisasi Saat Dokumen Siap
  // =========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    initCharts();
    initActuatorControls();
    initFaultLab();
    initAIInteractions();
    initIntegrationModule();
    connectWebSocket();

    // Set tanggal default form batch ke hari ini jika kosong
    const inputDate = document.getElementById('inputStartDate');
    if (inputDate && !inputDate.value) {
      const d = new Date();
      d.setDate(d.getDate() - 8);
      inputDate.value = d.toISOString().split('T')[0];
    }
  });

})();

