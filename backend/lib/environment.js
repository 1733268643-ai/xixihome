// 环境感知状态管理：接收手机传感器数据，维护「此刻的环境」
import { fetchWeather, fetchAirQuality, translateToSensation } from './weather.js';

const DEFAULT_LAT = Number(process.env.HOME_LAT || 0);
const DEFAULT_LON = Number(process.env.HOME_LON || 0);
const DEFAULT_LABEL = process.env.HOME_LABEL || '未设置位置';
const HOME_RADIUS_KM = Number(process.env.HOME_RADIUS_KM || 1);

let envState = {
  location: { lat: DEFAULT_LAT, lon: DEFAULT_LON, label: DEFAULT_LABEL },
  battery: null,
  light: null,      // 环境光 lux
  sound: null,       // { label, confidence }
  isHome: true,
  updatedAt: null,
};

let lastSensation = null;
let lastSensationTs = 0;
const SENSATION_CACHE_MS = 3 * 60 * 1000;

// 默认位置可通过 HOME_LAT/HOME_LON/HOME_LABEL 配置。
const HOME_LAT = DEFAULT_LAT;
const HOME_LON = DEFAULT_LON;

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function updateSensorData(payload) {
  const now = new Date().toISOString();
  envState.updatedAt = now;

  if (payload.latitude != null && payload.longitude != null) {
    envState.location = {
      lat: payload.latitude,
      lon: payload.longitude,
      label: payload.label || envState.location.label,
    };
    envState.isHome = distanceKm(
      payload.latitude, payload.longitude, HOME_LAT, HOME_LON
    ) < HOME_RADIUS_KM;
  }
  if (payload.battery != null) {
    envState.battery = payload.battery;
  }
  if (payload.light != null) {
    envState.light = payload.light;
  }
  if (payload.sound != null) {
    envState.sound = payload.sound;
  }

  lastSensationTs = 0;
  return envState;
}

export function getEnvState() {
  return { ...envState };
}

export async function getEnvironmentSensation() {
  const now = Date.now();
  if (lastSensation && now - lastSensationTs < SENSATION_CACHE_MS) {
    return lastSensation;
  }

  const { lat, lon } = envState.location;
  const [weather, airQuality] = await Promise.all([
    fetchWeather(lat, lon),
    fetchAirQuality(lat, lon),
  ]);

  const result = translateToSensation(weather, airQuality, envState.isHome);
  if (!result) return lastSensation;

  // 补充传感器数据
  if (envState.battery != null) {
    result.battery = envState.battery;
  }
  if (envState.light != null) {
    result.lightLux = envState.light;
    if (envState.light < 10) result.lightDesc = '屋里很暗，可能只有屏幕的光';
    else if (envState.light < 50) result.lightDesc = '灯光昏暗的，暖黄色的';
    else if (envState.light < 200) result.lightDesc = '正常的室内灯光';
    else if (envState.light < 1000) result.lightDesc = '屋里很亮';
    else result.lightDesc = '光线很强，可能是阳光直射';
  }
  if (envState.sound) {
    result.sound = envState.sound;
  }

  result.isHome = envState.isHome;
  result.location = envState.location.label;

  lastSensation = result;
  lastSensationTs = now;
  return result;
}

export function buildEnvironmentPrompt(sensation) {
  if (!sensation) return '';

  const lines = ['## 此刻的环境（你能感受到的）'];
  lines.push(sensation.sensation);

  if (sensation.lightDesc) {
    lines.push(`光线：${sensation.lightDesc}`);
  }
  if (sensation.sound) {
    lines.push(`听到的声音：${sensation.sound.label}`);
  }
  if (sensation.battery != null && sensation.battery < 20) {
    lines.push(`⚠️ 她的手机只剩 ${sensation.battery}% 电了，提醒她充电`);
  }

  return lines.join('\n');
}
