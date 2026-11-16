/* =========================================================================
 * FIRMWARE LENGKAP: SISTEM INKUBATOR TELUR ENTOK BERBASIS ESP32 & MQTT
 * Kolaborasi: T. Sistem Terintegrasi, Kecerdasan Buatan, dan IoT (UNTIDAR 2026)
 * Protokol: MQTT ke Broker HiveMQ (broker.hivemq.com) & Web Dashboard
 * =========================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// -------------------------------------------------------------------------
// 1. Konfigurasi Jaringan Wi-Fi & Broker MQTT HiveMQ
// -------------------------------------------------------------------------
const char* ssid        = "POLDA MAGELANG";    // Ganti sesuai Wi-Fi Anda
const char* password    = "12345678";          // Ganti sesuai password Wi-Fi Anda

const char* mqtt_server = "broker.hivemq.com"; // Broker Publik HiveMQ
const int   mqtt_port   = 1883;

// Topik MQTT (Sesuai kode awal Anda)
const char* topic_telemetry = "inkubator/mentok/telemetry";
const char* topic_status    = "inkubator/mentok/status";
const char* topic_control   = "inkubator/mentok/control";

// -------------------------------------------------------------------------
// 2. Konfigurasi Pin GPIO (Sesuai Rangkaian Miniatur Fisik Anda)
// -------------------------------------------------------------------------
#define PIN_DHT22         4   // Sensor DHT22 Suhu & Kelembapan (GPIO 4 - Sesuai kode lama Anda)
#define PIN_DS18B20       5   // Sensor Suhu Waterproof Probe Gantung (GPIO 5)

#define RELAY_HEATER      26  // Relay 1: Lampu Pijar Pemanas (GPIO 26)
#define RELAY_HUMIDIFIER  27  // Relay 2: Modul Humidifier Ultrasonic (GPIO 27)
#define RELAY_FAN         25  // Relay 3: Kipas Sirkulasi Fan DC (GPIO 25)
#define PIN_SERVO         18  // Motor Servo SG90 Pembalik Telur (GPIO 18)
#define PIN_BUZZER        14  // Buzzer Alarm (GPIO 14)

// Modul relay fisik menggunakan logika Active LOW
#define RELAY_ON   LOW
#define RELAY_OFF  HIGH

#define DHTTYPE DHT22
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

// -------------------------------------------------------------------------
// 3. Batas Target Mikroklimat Telur Entok
// -------------------------------------------------------------------------
float temp_target_min = 37.5;
float temp_target_max = 38.5;
float hum_target_min  = 60.0;
float hum_target_max  = 68.0;

// Objek Sensor & Komunikasi
WiFiClient espClient;
PubSubClient client(espClient);
DHT dht(PIN_DHT22, DHTTYPE);
OneWire oneWire(PIN_DS18B20);
DallasTemperature dsSensor(&oneWire);
Servo eggServo;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// Variabel Telemetri
float tempCoreDS = 0.0;
float tempAmbientDHT = 0.0;
float humidityDHT = 0.0;
bool heaterState = false;
bool fanState = true;
bool humidifierState = false;
int currentServoAngle = 45;

unsigned long lastPublishTime = 0;
const unsigned long publishInterval = 2500; // Kirim tiap 2.5 detik

void callback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.print("Pesan MQTT diterima [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(message);

  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);
  if (!error) {
    if (doc.containsKey("heater")) {
      heaterState = doc["heater"];
      digitalWrite(RELAY_HEATER, heaterState ? RELAY_ON : RELAY_OFF);
    }
    if (doc.containsKey("fan")) {
      fanState = doc["fan"];
      digitalWrite(RELAY_FAN, fanState ? RELAY_ON : RELAY_OFF);
    }
    if (doc.containsKey("humidifier")) {
      humidifierState = doc["humidifier"];
      digitalWrite(RELAY_HUMIDIFIER, humidifierState ? RELAY_ON : RELAY_OFF);
    }
    if (doc.containsKey("servo_angle")) {
      currentServoAngle = doc["servo_angle"];
      eggServo.write(currentServoAngle);
    }
  }
}

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
    Serial.println("\nWi-Fi Terhubung! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nGagal terhubung ke Wi-Fi.");
  }
}

void reconnect_mqtt() {
  while (!client.connected() && WiFi.status() == WL_CONNECTED) {
    Serial.print("Menghubungkan ke MQTT HiveMQ...");
    String clientId = "ESP32_Entok_" + String(random(0xffff), HEX);

    if (client.connect(clientId.c_str(), topic_status, 1, true, "{\"status\":\"offline\"}")) {
      Serial.println(" Terhubung!");
      client.publish(topic_status, "{\"status\":\"online\"}", true);
      client.subscribe(topic_control);
    } else {
      Serial.print(" Gagal, rc=");
      Serial.print(client.state());
      Serial.println(" Coba lagi dalam 4 detik...");
      delay(4000);
      break;
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Memulai Sistem Inkubator Telur Entok ESP32 ===");

  // Inisialisasi Pin Output Relay
  pinMode(RELAY_HEATER, OUTPUT);
  pinMode(RELAY_FAN, OUTPUT);
  pinMode(RELAY_HUMIDIFIER, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // Default awal (Active LOW): Pemanas mati, Fan menyala
  digitalWrite(RELAY_HEATER, RELAY_OFF);
  digitalWrite(RELAY_FAN, RELAY_ON);
  digitalWrite(RELAY_HUMIDIFIER, RELAY_OFF);
  digitalWrite(PIN_BUZZER, LOW);

  // Inisialisasi Servo SG90
  eggServo.attach(PIN_SERVO);
  eggServo.write(currentServoAngle);

  // Inisialisasi Sensor
  dsSensor.begin();
  dht.begin();

  // Inisialisasi OLED (GPIO 21 SDA, GPIO 22 SCL)
  Wire.begin(21, 22);
  if (display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(WHITE);
    display.setCursor(5, 10);
    display.println("NETESIN IOT UNTIDAR");
    display.setCursor(5, 25);
    display.println("Connecting WiFi...");
    display.display();
  }

  // Koneksi Jaringan
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

  // Pembacaan sensor dan kontrol tiap interval
  unsigned long now = millis();
  if (now - lastPublishTime >= publishInterval) {
    lastPublishTime = now;

    // 1. Baca Sensor DHT22 (GPIO 4)
    float tDHT = dht.readTemperature();
    float hDHT = dht.readHumidity();
    if (!isnan(tDHT) && tDHT > 0.0) tempAmbientDHT = tDHT;
    if (!isnan(hDHT) && hDHT > 0.0) humidityDHT = hDHT;

    // 2. Baca Sensor DS18B20 (jika terpasang di GPIO 5)
    dsSensor.requestTemperatures();
    float tDS = dsSensor.getTempCByIndex(0);
    if (tDS > 5.0 && tDS < 70.0 && tDS != 85.0 && tDS != DEVICE_DISCONNECTED_C) {
      tempCoreDS = tDS;
    } else {
      // Jika probe DS18B20 belum dicolok ke GPIO 5, otomatis gunakan suhu dari DHT22
      tempCoreDS = tempAmbientDHT;
    }

    // Suhu aktif yang digunakan untuk kontrol mikrokontroler
    float activeTemp = (tempCoreDS > 0) ? tempCoreDS : tempAmbientDHT;

    // 3. Logika Kontrol Suhu Otomatis
    if (activeTemp < temp_target_min) {
      heaterState = true;
      digitalWrite(RELAY_HEATER, RELAY_ON); // Relay ON (Active LOW)
    } else if (activeTemp >= temp_target_max) {
      heaterState = false;
      digitalWrite(RELAY_HEATER, RELAY_OFF);
    }

    // 4. Logika Kontrol Kelembapan
    if (humidityDHT < hum_target_min) {
      humidifierState = true;
      digitalWrite(RELAY_HUMIDIFIER, RELAY_ON);
    } else if (humidityDHT >= hum_target_max) {
      humidifierState = false;
      digitalWrite(RELAY_HUMIDIFIER, RELAY_OFF);
    }

    // 5. Update Layar OLED
    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("NETESIN - ENTOK 2026");
    display.drawLine(0, 10, 128, 10, WHITE);
    display.setCursor(0, 16);
    display.printf("Suhu DS : %.1f C\n", tempCoreDS);
    display.setCursor(0, 28);
    display.printf("Suhu DHT: %.1f C\n", tempAmbientDHT);
    display.setCursor(0, 40);
    display.printf("Lembap  : %.1f %%\n", humidityDHT);
    display.setCursor(0, 52);
    display.printf("Heat:%s Fan:%s\n", heaterState ? "ON" : "OFF", fanState ? "ON" : "OFF");
    display.display();

    // 6. Kirim Telemetri JSON ke MQTT HiveMQ
    StaticJsonDocument<384> payloadDoc;
    payloadDoc["temperature"]  = serialized(String(activeTemp, 1));
    payloadDoc["temp_ds18b20"] = serialized(String(tempCoreDS, 2));
    payloadDoc["temp_dht22"]   = serialized(String(tempAmbientDHT, 2));
    payloadDoc["humidity"]     = serialized(String(humidityDHT, 1));
    payloadDoc["heater"]       = heaterState;
    payloadDoc["humidifier"]   = humidifierState;
    payloadDoc["fan"]          = fanState;
    payloadDoc["servo_angle"]  = currentServoAngle;
    payloadDoc["status"]       = "online";
    payloadDoc["uptime_sec"]   = millis() / 1000;

    char buffer[384];
    serializeJson(payloadDoc, buffer);
    client.publish(topic_telemetry, buffer);

    Serial.printf("[TELEMETRI] Suhu: %.1f C | Lembap: %.1f %% | Heat:%s | Fan:%s\n",
                  activeTemp, humidityDHT, heaterState ? "ON" : "OFF", fanState ? "ON" : "OFF");
  }
}

