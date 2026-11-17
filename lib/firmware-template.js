/**
 * lib/firmware-template.js
 * Template Kode Sumber Arduino C++ untuk ESP32 (DHT22 & Humidifier Relay)
 * Protokol: MQTT ke Broker HiveMQ (broker.hivemq.com)
 */

function generateFirmwareCode(serverIp = "192.168.1.108", serverPort = 3100, wifiSsid = "POLDA MAGELANG", wifiPass = "12345678") {
  return `/* =========================================================================
 * FIRMWARE RESMI: SISTEM MONITORING INKUBATOR TELUR ENTOK (NETESIN)
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
const char* ssid        = "${wifiSsid}";
const char* password    = "${wifiPass}";

const char* mqtt_server = "broker.hivemq.com"; // Broker Publik HiveMQ
const int   mqtt_port   = 1883;

// Backup HTTP Langsung ke Server Netesin (IP Laptop: ${serverIp}:${serverPort})
const char* server_url   = "http://${serverIp}:${serverPort}/api/telemetry";
const bool  enable_http_backup = true;

// Topik MQTT
const char* topic_telemetry = "inkubator/mentok/telemetry";
const char* topic_status    = "inkubator/mentok/status";
const char* topic_control   = "inkubator/mentok/control";

// -------------------------------------------------------------------------
// 2. Konfigurasi Pin GPIO (DHT22 & Humidifier)
// -------------------------------------------------------------------------
#define PIN_DHT22         4   // Pin Data Sensor DHT22 (GPIO 4)
#define RELAY_HUMIDIFIER  27  // Pin Modul Relay Humidifier Ultrasonic (GPIO 27)

#define DHTTYPE DHT22

// Modul relay umumnya Active LOW
#define RELAY_ON   LOW
#define RELAY_OFF  HIGH

// Ambang Batas Kelembapan Default (Mikroklimat Telur Entok)
float hum_target_min = 60.0; // Humidifier ON jika RH < 60%
float hum_target_max = 66.0; // Humidifier OFF jika RH >= 66%

WiFiClient espClient;
PubSubClient client(espClient);
DHT dht(PIN_DHT22, DHTTYPE);

float currentTemp = 0.0;
float currentHumidity = 0.0;
bool humidifierState = false;

unsigned long lastPublishTime = 0;
const unsigned long publishInterval = 2500; // Kirim telemetri setiap 2.5 detik

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
    if (doc.containsKey("target_humidity")) {
      float newTarget = doc["target_humidity"];
      hum_target_min = newTarget - 3.0;
      hum_target_max = newTarget + 3.0;
      Serial.printf("-> Target kelembapan diperbarui: %.1f%%\\n", newTarget);
    }
  }
}

void setup_wifi() {
  delay(10);
  Serial.print("\\nMenghubungkan ke Wi-Fi: ");
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
    Serial.println("\\n[Wi-Fi] Terhubung! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\\n[Wi-Fi] Gagal terhubung (Timeout).");
  }
}

void reconnect_mqtt() {
  while (!client.connected() && WiFi.status() == WL_CONNECTED) {
    Serial.print("Menghubungkan ke MQTT HiveMQ...");
    String clientId = "ESP32_Netesin_" + String(random(0xffff), HEX);

    if (client.connect(clientId.c_str(), topic_status, 1, true, "{\\"status\\":\\"offline\\"}")) {
      Serial.println(" Terhubung!");
      client.publish(topic_status, "{\\"status\\":\\"online\\"}", true);
      client.subscribe(topic_control);
    } else {
      Serial.print(" Gagal, rc=");
      Serial.print(client.state());
      Serial.println(". Coba lagi dalam 4 detik...");
      delay(4000);
      break;
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\\n=== NETESIN: MONITORING DHT22 & HUMIDIFIER ===");

  pinMode(RELAY_HUMIDIFIER, OUTPUT);
  digitalWrite(RELAY_HUMIDIFIER, RELAY_OFF);

  dht.begin();
  setup_wifi();

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

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

    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (!isnan(t) && t > 0.0) currentTemp = t;
    if (!isnan(h) && h > 0.0) currentHumidity = h;

    // Kendali Kelembapan Otomatis
    if (currentHumidity > 0.0) {
      if (currentHumidity < hum_target_min) {
        humidifierState = true;
        digitalWrite(RELAY_HUMIDIFIER, RELAY_ON);
      } else if (currentHumidity >= hum_target_max) {
        humidifierState = false;
        digitalWrite(RELAY_HUMIDIFIER, RELAY_OFF);
      }
    }

    // Kirim Telemetri JSON
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
    }

    if (!mqttSent && enable_http_backup && WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(server_url);
      http.addHeader("Content-Type", "application/json");
      http.POST(buffer);
      http.end();
    }

    Serial.printf("[TELEMETRI REAL-TIME] Suhu: %.1f C | Lembap: %.1f %% | Humidifier: %s\\n",
                  currentTemp, currentHumidity, humidifierState ? "ON" : "OFF");
  }
}
`;
}

module.exports = { generateFirmwareCode };
