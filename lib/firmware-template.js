/**
 * lib/firmware-template.js
 * Template Kode Sumber Arduino C++ untuk ESP32 DevKit V1 (30 Pin)
 * Sesuai Skema Pin Interkoneksi Proposal Proyek Akhir Universitas Tidar 2026
 */

function generateFirmwareCode(serverIp = "192.168.227.36", serverPort = 3100, wifiSsid = "POLDA MAGELANG", wifiPass = "12345678") {
  return `/* ====================================================================
 * PROYEK AKHIR TEKNOLOGI INFORMASI - UNIVERSITAS TIDAR 2026
 * Rancang Bangun Sistem Inkubator Telur Entok Berbasis ESP32 dan IoT
 * Kolaborasi: T. Sistem Terintegrasi, Kecerdasan Buatan, dan IoT
 * Peneliti: Hakkan Azrul Suseno & Muhammad Ramdhan
 * Dosen Pengampu: Muhamad Maksum Hidayat, S.Kom., M.Kom.
 * ==================================================================== */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <DHT.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------------- KONFIGURASI JARINGAN & SERVER ----------------
const char* WIFI_SSID     = "${wifiSsid}";
const char* WIFI_PASSWORD = "${wifiPass}";
const char* SERVER_URL    = "http://${serverIp}:${serverPort}/api/telemetry";
const char* CONTROL_URL   = "http://${serverIp}:${serverPort}/api/control";

// ---------------- DEFINISI PIN (SESUAI PROPOSAL BAB 3.3) ----------------
#define PIN_DS18B20      4    // GPIO 4: DS18B20 Waterproof Data (Suhu Inti)
#define PIN_DHT22        5    // GPIO 5: DHT22 / AM2302 (Suhu & Kelembapan)
#define PIN_SERVO        18   // GPIO 18: Servo SG90 (Pembalik Telur Tilting Grid)
#define PIN_HUMIDIFIER   25   // GPIO 25: MOSFET Humidifier Ultrasonic 5V
#define PIN_RELAY_HEATER 26   // GPIO 26: Relay Modul (2x Lampu Pijar 5W)
#define PIN_FAN_DC       27   // GPIO 27: Driver Fan DC 6010 (Sirkulasi Udara)
#define PIN_BUZZER       14   // GPIO 14: Buzzer Indikator Suara Alarm
#define PIN_OLED_SDA     21   // GPIO 21: OLED 0.96" SDA (I2C)
#define PIN_OLED_SCL     22   // GPIO 22: OLED 0.96" SCL (I2C)

#define DHTTYPE DHT22
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

// Inisialisasi Objek Sensor & Aktuator
OneWire oneWire(PIN_DS18B20);
DallasTemperature ds18b20Sensor(&oneWire);
DHT dht(PIN_DHT22, DHTTYPE);
Servo eggServo;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// Variabel Telemetri & Kontrol
float tempCoreDS = 0.0;
float tempAmbientDHT = 0.0;
float humidityDHT = 0.0;
bool heaterState = false;
bool fanState = false;
bool humidifierState = false;
bool buzzerState = false;
int currentServoAngle = 45;
String controlMode = "AUTO"; // AUTO atau MANUAL

unsigned long lastSendMillis = 0;
const unsigned long SEND_INTERVAL = 2000; // Kirim data tiap 2 detik

void setup() {
  Serial.begin(115200);
  Serial.println("\\n[NETESIN] Sistem Inkubator Telur Entok Mulai...");

  // Konfigurasi Pin GPIO
  pinMode(PIN_RELAY_HEATER, OUTPUT);
  pinMode(PIN_FAN_DC, OUTPUT);
  pinMode(PIN_HUMIDIFIER, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // Inisialisasi Aktuator ke kondisi aman
  digitalWrite(PIN_RELAY_HEATER, LOW);
  digitalWrite(PIN_FAN_DC, HIGH); // Fan aktif sirkulasi
  digitalWrite(PIN_HUMIDIFIER, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  // Inisialisasi Servo
  eggServo.attach(PIN_SERVO);
  eggServo.write(currentServoAngle);

  // Inisialisasi Sensor
  ds18b20Sensor.begin();
  dht.begin();

  // Inisialisasi Layar OLED
  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("Gagal menginisialisasi OLED!");
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(WHITE);
    display.setCursor(10, 10);
    display.println("NETESIN IOT UNTIDAR");
    display.setCursor(10, 30);
    display.println("Connecting WiFi...");
    display.display();
  }

  // Koneksi Wi-Fi
  connectToWiFi();
}

void loop() {
  // 1. Baca Sensor Fisik
  readSensors();

  // 2. Tampilkan ke Layar OLED Lokal
  updateOledDisplay();

  // 3. Kirim Telemetri ke Gateway Server Web Terintegrasi
  if (millis() - lastSendMillis >= SEND_INTERVAL) {
    lastSendMillis = millis();
    sendTelemetryToServer();
  }

  delay(50);
}

void connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Menghubungkan ke Wi-Fi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\\nWi-Fi Terhubung! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\\nGagal terhubung Wi-Fi, menjalankan mode lokal mandiri...");
  }
}

void readSensors() {
  // Baca DS18B20
  ds18b20Sensor.requestTemperatures();
  float tDS = ds18b20Sensor.getTempCByIndex(0);
  if (tDS != DEVICE_DISCONNECTED_C && tDS > -10.0 && tDS < 80.0) {
    tempCoreDS = tDS;
  }

  // Baca DHT22
  float tDHT = dht.readTemperature();
  float hDHT = dht.readHumidity();
  if (!isnan(tDHT)) tempAmbientDHT = tDHT;
  if (!isnan(hDHT)) humidityDHT = hDHT;
}

void updateOledDisplay() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("NETESIN - INKUBATOR");
  display.drawLine(0, 10, 128, 10, WHITE);

  display.setCursor(0, 16);
  display.printf("Suhu DS: %.1f C\\n", tempCoreDS);
  display.setCursor(0, 28);
  display.printf("Suhu DHT: %.1f C\\n", tempAmbientDHT);
  display.setCursor(0, 40);
  display.printf("Lembap: %.1f %%\\n", humidityDHT);

  display.setCursor(0, 52);
  display.printf("Heat:%s Fan:%s\\n", heaterState ? "ON" : "OFF", fanState ? "ON" : "OFF");
  display.display();
}

void sendTelemetryToServer() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  // Siapkan Payload JSON Telemetri
  StaticJsonDocument<512> doc;
  doc["device_id"] = "ESP32-INKUBATOR-ENTOK-01";
  doc["ip_address"] = WiFi.localIP().toString();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["temp_ds18b20"] = tempCoreDS;
  doc["temp_dht22"] = tempAmbientDHT;
  doc["humidity"] = humidityDHT;
  doc["heater"] = heaterState;
  doc["fan"] = fanState;
  doc["humidifier"] = humidifierState;
  doc["servo_angle"] = currentServoAngle;
  doc["buzzer"] = buzzerState;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  int httpCode = http.POST(jsonPayload);
  if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
    String response = http.getString();
    // Parse Perintah Balik dari Server (Jika Server mengubah aktuator)
    StaticJsonDocument<256> respDoc;
    DeserializationError error = deserializeJson(respDoc, response);
    if (!error) {
      if (respDoc.containsKey("control_mode")) controlMode = respDoc["control_mode"].as<String>();
      if (respDoc.containsKey("heater")) {
        heaterState = respDoc["heater"];
        digitalWrite(PIN_RELAY_HEATER, heaterState ? HIGH : LOW);
      }
      if (respDoc.containsKey("fan")) {
        fanState = respDoc["fan"];
        digitalWrite(PIN_FAN_DC, fanState ? HIGH : LOW);
      }
      if (respDoc.containsKey("humidifier")) {
        humidifierState = respDoc["humidifier"];
        digitalWrite(PIN_HUMIDIFIER, humidifierState ? HIGH : LOW);
      }
      if (respDoc.containsKey("servo_angle")) {
        currentServoAngle = respDoc["servo_angle"];
        eggServo.write(currentServoAngle);
      }
      if (respDoc.containsKey("buzzer")) {
        buzzerState = respDoc["buzzer"];
        digitalWrite(PIN_BUZZER, buzzerState ? HIGH : LOW);
      }
    }
  } else {
    Serial.printf("[HTTP] POST Gagal, kode: %d\\n", httpCode);
  }
  http.end();
}
`;
}

module.exports = { generateFirmwareCode };

