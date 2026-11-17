/* =========================================================================
 * FIRMWARE RESMI: SISTEM INKUBATOR TELUR ENTOK (NETESIN)
 * Konfigurasi Hardware: ESP32 + Sensor DHT22 + Modul Relay Humidifier
 * Kolaborasi: Internet of Things, Kecerdasan Buatan & Sistem Terintegrasi
 * Protokol: MQTT ke Broker HiveMQ (broker.hivemq.com) & Web Gateway
 * =========================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// -------------------------------------------------------------------------
// 1. Konfigurasi Jaringan Wi-Fi, Broker MQTT HiveMQ & Server HTTP
// -------------------------------------------------------------------------
const char* ssid        = "POLDA MAGELANG";    // Ganti dengan SSID Wi-Fi Anda
const char* password    = "12345678";          // Ganti dengan Password Wi-Fi Anda

// Opsi 1: Broker Publik MQTT HiveMQ
const char* mqtt_server = "broker.hivemq.com";
const int   mqtt_port   = 1883;

// Opsi 2: Backup HTTP REST Langsung ke Laptop/Server (Ganti IP dengan IP Laptop Anda)
const char* server_url   = "http://192.168.1.108:3100/api/telemetry";
const bool  enable_http_backup = true; // Aktifkan HTTP jika MQTT tidak terjangkau

// Topik MQTT
const char* topic_telemetry = "inkubator/mentok/telemetry";
const char* topic_status    = "inkubator/mentok/status";
const char* topic_control   = "inkubator/mentok/control";

// -------------------------------------------------------------------------
// 2. Konfigurasi Pin GPIO (Hanya DHT22 & Humidifier)
// -------------------------------------------------------------------------
#define PIN_DHT22         4   // Pin Data Sensor DHT22 (GPIO 4)
#define RELAY_HUMIDIFIER  27  // Pin Modul Relay Humidifier Ultrasonic (GPIO 27)

#define DHTTYPE DHT22

// Modul relay umumnya Active LOW (nyala saat LOW).
// Jika relay Anda Active HIGH, cukup tukar LOW dan HIGH di bawah ini.
#define RELAY_ON   LOW
#define RELAY_OFF  HIGH

// -------------------------------------------------------------------------
// 3. Batas Ambang Kelembapan Default (Mikroklimat Telur Entok)
// -------------------------------------------------------------------------
float hum_target_min = 60.0; // Humidifier ON jika RH < 60%
float hum_target_max = 66.0; // Humidifier OFF jika RH >= 66%

// Objek Jaringan & Sensor
WiFiClient espClient;
PubSubClient client(espClient);
DHT dht(PIN_DHT22, DHTTYPE);

// Variabel Telemetri
float currentTemp = 0.0;
float currentHumidity = 0.0;
bool humidifierState = false;
bool manualOverride = false; // Mode kontrol manual dari web dashboard

unsigned long lastPublishTime = 0;
const unsigned long publishInterval = 2500; // Kirim telemetri setiap 2.5 detik

// -------------------------------------------------------------------------
// 4. Callback MQTT: Menerima Perintah dari Dashboard / AI Server
// -------------------------------------------------------------------------
void callback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.print("[MQTT Masuk] Topik: ");
  Serial.print(topic);
  Serial.print(" | Pesan: ");
  Serial.println(message);

  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);
  if (!error) {
    // 1. Kontrol Sakelar Manual Humidifier dari Web Dashboard
    if (doc.containsKey("humidifier")) {
      humidifierState = doc["humidifier"];
      manualOverride = true;
      digitalWrite(RELAY_HUMIDIFIER, humidifierState ? RELAY_ON : RELAY_OFF);
      Serial.printf("-> Humidifier diatur MANUAL: %s\n", humidifierState ? "ON" : "OFF");
    }

    // 2. Setpoint Dinamis dari AI Engine Sesuai Siklus Fase Telur Entok
    if (doc.containsKey("target_humidity")) {
      float newTarget = doc["target_humidity"];
      hum_target_min = newTarget - 3.0;
      hum_target_max = newTarget + 3.0;
      manualOverride = false; // Kembali ke kontrol otomatis AI
      Serial.printf("-> AI memperbarui setpoint kelembapan: %.1f%% (Rentang: %.1f - %.1f%%)\n",
                    newTarget, hum_target_min, hum_target_max);
    }

    // 3. Reset ke Mode Otomatis
    if (doc.containsKey("control_mode") && String(doc["control_mode"].as<const char*>()) == "AUTO") {
      manualOverride = false;
      Serial.println("-> Kembali ke Mode OTOMATIS");
    }
  }
}

// -------------------------------------------------------------------------
// 5. Inisialisasi Wi-Fi
// -------------------------------------------------------------------------
void setup_wifi() {
  delay(10);
  Serial.print("\nMenghubungkan ke Wi-Fi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 30) {
    delay(500);
    Serial.print(".");
    attempt++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi] Terhubung! IP Address: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[Wi-Fi] Gagal terhubung (Timeout). Cek SSID dan password.");
  }
}

// -------------------------------------------------------------------------
// 6. Koneksi Ulang MQTT
// -------------------------------------------------------------------------
void reconnect_mqtt() {
  while (!client.connected() && WiFi.status() == WL_CONNECTED) {
    Serial.print("Menghubungkan ke MQTT HiveMQ...");
    String clientId = "ESP32_Netesin_" + String(random(0xffff), HEX);

    // Kirim LWT (Last Will and Testament) jika perangkat tiba-tiba mati
    if (client.connect(clientId.c_str(), topic_status, 1, true, "{\"status\":\"offline\"}")) {
      Serial.println(" Terhubung!");
      client.publish(topic_status, "{\"status\":\"online\"}", true);
      client.subscribe(topic_control);
      Serial.printf("Berlangganan topik kontrol: %s\n", topic_control);
    } else {
      Serial.print(" Gagal, rc=");
      Serial.print(client.state());
      Serial.println(". Coba lagi dalam 4 detik...");
      delay(4000);
      break;
    }
  }
}

// -------------------------------------------------------------------------
// 7. Setup Awal
// -------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  Serial.println("\n========================================================");
  Serial.println("  NETESIN: INKUBATOR TELUR ENTOK BERBASIS ESP32 & AI    ");
  Serial.println("  Konfigurasi: DHT22 (GPIO 4) & Humidifier (GPIO 27)    ");
  Serial.println("========================================================");

  // Inisialisasi Relay Humidifier (Active LOW, awal mati)
  pinMode(RELAY_HUMIDIFIER, OUTPUT);
  digitalWrite(RELAY_HUMIDIFIER, RELAY_OFF);

  // Inisialisasi Sensor DHT22
  dht.begin();

  // Koneksi Jaringan
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

// -------------------------------------------------------------------------
// 8. Loop Utama
// -------------------------------------------------------------------------
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    setup_wifi();
  }

  if (!client.connected()) {
    reconnect_mqtt();
  }
  client.loop();

  unsigned long now = millis();
  if (now - lastPublishTime >= publishInterval) {
    lastPublishTime = now;

    // 1. Membaca Suhu & Kelembapan dari DHT22
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (!isnan(t) && t > 0.0) {
      currentTemp = t;
    } else {
      Serial.println("[WARNING] Gagal membaca suhu dari DHT22!");
    }

    if (!isnan(h) && h > 0.0) {
      currentHumidity = h;
    } else {
      Serial.println("[WARNING] Gagal membaca kelembapan dari DHT22!");
    }

    // 2. Logika Kontrol Kelembapan Otomatis (Jika tidak sedang manual override)
    if (!manualOverride) {
      if (currentHumidity > 0.0) {
        if (currentHumidity < hum_target_min) {
          humidifierState = true;
          digitalWrite(RELAY_HUMIDIFIER, RELAY_ON);
        } else if (currentHumidity >= hum_target_max) {
          humidifierState = false;
          digitalWrite(RELAY_HUMIDIFIER, RELAY_OFF);
        }
      }
    }

    // 3. Format dan Kirim Telemetri JSON
    StaticJsonDocument<256> payloadDoc;
    payloadDoc["temperature"]  = ((int)(currentTemp * 10)) / 10.0;
    payloadDoc["temp_dht22"]   = ((int)(currentTemp * 10)) / 10.0;
    payloadDoc["humidity"]     = ((int)(currentHumidity * 10)) / 10.0;
    payloadDoc["humidifier"]   = humidifierState;
    payloadDoc["status"]       = "online";
    payloadDoc["uptime_sec"]   = millis() / 1000;
    payloadDoc["device_id"]    = "ESP32-INKUBATOR-ENTOK-01";

    char buffer[256];
    serializeJson(payloadDoc, buffer);

    bool mqttSent = false;
    if (client.connected()) {
      mqttSent = client.publish(topic_telemetry, buffer);
      if (mqttSent) {
        Serial.printf("[MQTT SUKSES TERKIRIM KE WEB] %s\n", buffer);
      } else {
        Serial.println("[MQTT ERROR] Gagal publish ke HiveMQ!");
      }
    }

    // Jika MQTT gagal/terblokir, kirim langsung via HTTP POST ke Server Netesin
    if (!mqttSent && enable_http_backup && WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(server_url);
      http.addHeader("Content-Type", "application/json");
      int httpCode = http.POST(buffer);
      if (httpCode == 200 || httpCode == 201) {
        Serial.printf("[HTTP POST SUKSES REAL-TIME KE WEB] %s\n", buffer);
      } else {
        Serial.printf("[HTTP POST GAGAL] Kode respons: %d\n", httpCode);
      }
      http.end();
    }

    Serial.printf("[SENSOR DHT22] Suhu: %.1f C | Lembap: %.1f %% | Humidifier: %s (Mode: %s)\n",
                  currentTemp, currentHumidity, humidifierState ? "ON" : "OFF",
                  manualOverride ? "MANUAL" : "AUTO");
  }
}
