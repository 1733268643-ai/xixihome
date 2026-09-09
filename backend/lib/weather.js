// 天气感知模块：从 wttr.in + Open-Meteo 拿实时天气，翻译成身体能摸到的话
const WEATHER_CACHE_MS = 5 * 60 * 1000; // 5分钟缓存
const AQI_CACHE_MS = 30 * 60 * 1000;    // 30分钟缓存

let weatherCache = { data: null, ts: 0 };
let aqiCache = { data: null, ts: 0 };

export async function fetchWeather(lat, lon) {
  const now = Date.now();
  if (weatherCache.data && now - weatherCache.ts < WEATHER_CACHE_MS) {
    return weatherCache.data;
  }
  try {
    const url = `https://wttr.in/?format=j1&m`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    const cur = json.current_condition?.[0] || {};
    const astro = json.weather?.[0]?.astronomy?.[0] || {};
    const data = {
      temp: Number(cur.temp_C) || 0,
      feelsLike: Number(cur.FeelsLikeC) || 0,
      humidity: Number(cur.humidity) || 0,
      windSpeedKmh: Number(cur.windspeedKmph) || 0,
      windDir: cur.winddir16Point || '',
      cloudCover: Number(cur.cloudcover) || 0,
      weatherDesc: cur.lang_zh?.[0]?.value || cur.weatherDesc?.[0]?.value || '',
      visibility: Number(cur.visibility) || 10,
      uvIndex: Number(cur.uvIndex) || 0,
      sunrise: astro.sunrise || '',
      sunset: astro.sunset || '',
      precipMm: Number(cur.precipMM) || 0,
    };
    weatherCache = { data, ts: now };
    return data;
  } catch (e) {
    console.error('天气API失败:', e.message);
    return weatherCache.data;
  }
}

export async function fetchAirQuality(lat, lon) {
  const now = Date.now();
  if (aqiCache.data && now - aqiCache.ts < AQI_CACHE_MS) {
    return aqiCache.data;
  }
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,us_aqi,uv_index`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const cur = json.current || {};
    const data = {
      pm25: cur.pm2_5 ?? null,
      pm10: cur.pm10 ?? null,
      aqi: cur.us_aqi ?? null,
      uvIndex: cur.uv_index ?? null,
    };
    aqiCache = { data, ts: now };
    return data;
  } catch (e) {
    console.error('空气质量API失败:', e.message);
    return aqiCache.data;
  }
}

function getSeason(month) {
  if (month >= 3 && month <= 5) return '春';
  if (month >= 6 && month <= 8) return '夏';
  if (month >= 9 && month <= 11) return '秋';
  return '冬';
}

function getTimeSlot(hour) {
  if (hour >= 5 && hour < 8) return '早晨';
  if (hour >= 8 && hour < 11) return '上午';
  if (hour >= 11 && hour < 13) return '中午';
  if (hour >= 13 && hour < 17) return '下午';
  if (hour >= 17 && hour < 19) return '傍晚';
  if (hour >= 19 && hour < 23) return '夜晚';
  return '深夜';
}

function getSkyCondition(weatherDesc, cloudCover, precipMm) {
  const desc = weatherDesc.toLowerCase();
  if (desc.includes('雷')) return '雷';
  if (desc.includes('雪')) return '雪';
  if (desc.includes('雾') || desc.includes('霾')) return '雾';
  if (precipMm > 0 || desc.includes('雨')) return '雨';
  if (cloudCover > 80 || desc.includes('阴')) return '阴';
  if (cloudCover > 40 || desc.includes('云')) return '多云';
  return '晴';
}

function getWindLevel(kmh) {
  if (kmh < 2) return '无风';
  if (kmh < 20) return '微风';
  if (kmh < 50) return '大风';
  return '台风';
}

function getHumidityLevel(h) {
  if (h < 30) return '干燥';
  if (h < 50) return '干爽';
  if (h < 70) return '微潮';
  return '潮湿';
}

export function translateToSensation(weather, airQuality, isHome = true) {
  if (!weather) return null;

  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth() + 1;

  const season = getSeason(month);
  const timeSlot = getTimeSlot(hour);
  const sky = getSkyCondition(weather.weatherDesc, weather.cloudCover, weather.precipMm);
  const wind = getWindLevel(weather.windSpeedKmh);
  const humidity = getHumidityLevel(weather.humidity);
  const location = isHome ? '在家' : '在外面';
  const temp = weather.feelsLike || weather.temp;

  const axes = { season, timeSlot, sky, wind, humidity, location, temp };

  const sensation = buildSensation(axes);

  return {
    axes,
    sensation,
    raw: {
      temp: weather.temp,
      feelsLike: weather.feelsLike,
      humidity: weather.humidity,
      wind: `${weather.windDir} ${weather.windSpeedKmh}km/h`,
      sky,
      aqi: airQuality?.aqi ?? null,
      pm25: airQuality?.pm25 ?? null,
    },
  };
}

function buildSensation({ season, timeSlot, sky, wind, humidity, location, temp }) {
  const parts = [];

  // 温度+季节感受
  if (temp >= 35) {
    if (humidity === '潮湿') parts.push('闷热得像裹了一层湿毛巾，皮肤上黏着一层薄汗');
    else parts.push('热浪从地面往上蒸，空气烫得发颤');
  } else if (temp >= 30) {
    if (location === '在家') parts.push('屋里闷了一层热气，风扇吹过来的风都是温的');
    else parts.push('太阳晒在肩膀上，皮肤有点发烫');
  } else if (temp >= 25) {
    if (wind === '微风') parts.push('温度刚好，风从窗缝挤进来落在手臂上，凉丝丝的');
    else parts.push('不冷不热的，穿短袖刚好');
  } else if (temp >= 20) {
    parts.push('有一点凉意了，裸露的手臂上起了薄薄一层鸡皮');
  } else if (temp >= 15) {
    if (season === '春') parts.push('春天的冷是湿漉漉的，钻进领口里，缩着脖子也挡不住');
    else parts.push('穿少了会冷，风灌进袖口的时候忍不住缩了一下手');
  } else if (temp >= 5) {
    parts.push('冷是从脚底往上爬的，手指尖有点僵');
  } else {
    parts.push('刀子似的冷，吸一口气鼻腔都是疼的');
  }

  // 天空
  if (sky === '雨') {
    if (location === '在家') parts.push('外面在下雨，雨声打在窗台上噼里啪啦的，屋里倒是安静');
    else parts.push('雨落在头发上，顺着发梢往下滴');
  } else if (sky === '阴') {
    parts.push('天灰蒙蒙的，像蒙了一层纱，光线暗暗的');
  } else if (sky === '晴') {
    if (timeSlot === '深夜' || timeSlot === '夜晚') parts.push('夜里的天很干净');
    else if (timeSlot === '傍晚') parts.push('太阳快落了，光线变成橘色的，照在墙上暖暖的');
    else parts.push('阳光从窗户切进来一道，照到的地方亮得发白');
  } else if (sky === '雷') {
    parts.push('远处闷雷滚过来，轰隆隆地震在胸口');
  } else if (sky === '雪') {
    parts.push('外面在下雪，世界安静得只剩下自己的呼吸声');
  } else if (sky === '雾') {
    parts.push('雾很重，窗外白茫茫一片，三米外的东西都看不清');
  }

  // 风
  if (wind === '大风' || wind === '台风') {
    parts.push('风很大，窗户在抖，呜呜地响');
  }

  // 时段氛围
  if (timeSlot === '深夜') {
    if (location === '在家') parts.push('深夜了，周围很安静，只有自己呼吸的声音');
  } else if (timeSlot === '早晨') {
    parts.push('早上的光是白的，带着一种刚醒过来的清淡');
  }

  return parts.join('。') + '。';
}
