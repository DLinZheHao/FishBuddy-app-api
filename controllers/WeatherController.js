import 'dotenv/config';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'node:url';
import LocationService from '../utils/LocationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const locationJsonPath = path.resolve(__dirname, '../Data/location.json');
const locationService = new LocationService(locationJsonPath);

const WEATHER_36H_DATASET = 'F-C0032-001';
const TIDE_DATASET = 'F-A0021-001';
const MARINE_OBS_DATASET = 'O-B0075-001';
const MARINE_STATION_DATASET = 'O-B0076-001';
const SUN_DATASET = 'A-B0062-001';
const MOON_DATASET = 'A-B0063-001';
const LAND_OBS_DATASET = 'O-A0001-001';
const RAIN_OBS_DATASET = 'O-A0002-001';
const TIMEZONE = 'Asia/Taipei';

const SUMMARY_LEVELS = ['good', 'moderate', 'danger', 'unknown'];
const RISK_LEVELS = ['safe', 'moderate', 'danger', 'unknown'];
const COLOR_BY_RISK = {
    safe: 'green',
    moderate: 'yellow',
    danger: 'red',
    unknown: 'gray'
};
const COUNTY_CENTERS = {
    '宜蘭縣': { latitude: 24.7021, longitude: 121.7378 },
    '花蓮縣': { latitude: 23.9872, longitude: 121.6015 },
    '臺東縣': { latitude: 22.7583, longitude: 121.1444 },
    '澎湖縣': { latitude: 23.5712, longitude: 119.5793 },
    '金門縣': { latitude: 24.4321, longitude: 118.3171 },
    '連江縣': { latitude: 26.1605, longitude: 119.9517 },
    '臺北市': { latitude: 25.033, longitude: 121.5654 },
    '新北市': { latitude: 25.012, longitude: 121.4657 },
    '桃園市': { latitude: 24.9937, longitude: 121.3009 },
    '臺中市': { latitude: 24.1477, longitude: 120.6736 },
    '臺南市': { latitude: 22.9999, longitude: 120.227 },
    '高雄市': { latitude: 22.6273, longitude: 120.3014 },
    '基隆市': { latitude: 25.1276, longitude: 121.7392 },
    '新竹縣': { latitude: 24.8387, longitude: 121.0177 },
    '新竹市': { latitude: 24.8138, longitude: 120.9675 },
    '苗栗縣': { latitude: 24.5602, longitude: 120.8214 },
    '彰化縣': { latitude: 24.0809, longitude: 120.5386 },
    '南投縣': { latitude: 23.9609, longitude: 120.9719 },
    '雲林縣': { latitude: 23.7089, longitude: 120.4313 },
    '嘉義縣': { latitude: 23.4518, longitude: 120.255 },
    '嘉義市': { latitude: 23.4801, longitude: 120.4491 },
    '屏東縣': { latitude: 22.5519, longitude: 120.5488 }
};

function formatLocalDateTime(date) {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && (value.trim() === '' || value === 'None')) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function parseObservationNumber(value) {
    const num = parseNumber(value);
    if (num === null) return null;
    return num <= -90 ? null : num;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => deg * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toTimeLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('zh-TW', {
        timeZone: TIMEZONE,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });
}

function toDateLabel(iso) {
    if (typeof iso === 'string') {
        const matched = iso.match(/^\d{4}-\d{2}-\d{2}/);
        if (matched) return matched[0];
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
}

function getLocalToday() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
}

function normalizeCountyName(name = '') {
    return name.trim().replaceAll('台', '臺');
}

function toSlotIso(dateTime) {
    if (!dateTime) return null;
    return dateTime.includes('T') ? `${dateTime}+08:00` : `${dateTime.replace(' ', 'T')}+08:00`;
}

function diffMinutes(fromIso, toIso) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    return Math.round((to.getTime() - from.getTime()) / 60000);
}

function weatherIconFromDescription(description = '') {
    if (description.includes('雷')) return 'cloud.bolt.rain.fill';
    if (description.includes('雨')) return 'cloud.rain.fill';
    if (description.includes('陰')) return 'cloud.fill';
    if (description.includes('多雲')) return 'cloud.sun.fill';
    if (description.includes('晴')) return 'sun.max.fill';
    return 'cloud.fill';
}

function normalizeTideType(tide) {
    if (tide === '滿潮') return 'HIGH';
    if (tide === '乾潮') return 'LOW';
    return 'UNKNOWN';
}

function tideStageLabel(stage) {
    if (stage === 'rising') return '漲潮中';
    if (stage === 'falling') return '退潮中';
    if (stage === 'slack') return '平潮';
    return '未知';
}

function tideStageIcon(stage) {
    if (stage === 'rising') return 'arrow.up';
    if (stage === 'falling') return 'arrow.down';
    if (stage === 'slack') return 'arrow.left.and.right';
    return 'questionmark';
}

function waveRiskLevel(waveHeightM) {
    if (waveHeightM === null) return 'unknown';
    if (waveHeightM <= 1.5) return 'safe';
    if (waveHeightM <= 2.5) return 'moderate';
    return 'danger';
}

function windRiskLevel(windSpeedMs) {
    if (windSpeedMs === null) return 'unknown';
    if (windSpeedMs <= 5) return 'safe';
    if (windSpeedMs <= 10) return 'moderate';
    return 'danger';
}

function buildTimeRange(days = 7, lookbackHours = 0) {
    const now = new Date();
    const from = new Date(now);
    if (lookbackHours > 0) {
        from.setHours(from.getHours() - lookbackHours);
    }
    const to = new Date(now);
    to.setDate(to.getDate() + days);
    return {
        from: formatLocalDateTime(from),
        to: formatLocalDateTime(to),
        now
    };
}

function buildTideTimeRange(days = 7, lookbackDays = 1) {
    const now = new Date();
    const localToday = toDateLabel(now) || getLocalToday();
    const from = new Date(`${localToday}T00:00:00+08:00`);
    from.setDate(from.getDate() - lookbackDays);
    const to = new Date(now);
    to.setDate(to.getDate() + days);
    return {
        from: formatLocalDateTime(from),
        to: formatLocalDateTime(to),
        now
    };
}

function normalizeWeatherFromRecords(locations = []) {
    return locations.map((location) => {
        const getElement = (name) => location.weatherElement.find((item) => item.elementName === name);
        const wx = getElement('Wx');
        const minT = getElement('MinT');
        const maxT = getElement('MaxT');
        const ci = getElement('CI');
        const pop = getElement('PoP');

        const timeSlots = (wx?.time || []).map((t, index) => {
            const minTempC = parseNumber(minT?.time?.[index]?.parameter?.parameterName);
            const maxTempC = parseNumber(maxT?.time?.[index]?.parameter?.parameterName);
            const avgTemp = minTempC !== null && maxTempC !== null
                ? Number(((minTempC + maxTempC) / 2).toFixed(1))
                : null;

            return {
                startTime: t.startTime,
                endTime: t.endTime,
                description: t.parameter?.parameterName || null,
                minTempC,
                maxTempC,
                avgTempC: avgTemp,
                comfort: ci?.time?.[index]?.parameter?.parameterName || null,
                popPercent: parseNumber(pop?.time?.[index]?.parameter?.parameterName)
            };
        });

        return {
            city: location.locationName,
            weather: timeSlots
        };
    });
}

async function fetchWeather36h() {
    const apiKey = process.env.WeatherKEY;
    const weatherApi = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${WEATHER_36H_DATASET}?Authorization=${apiKey}`;
    const response = await axios.get(weatherApi);
    return normalizeWeatherFromRecords(response.data?.records?.location || []);
}

async function fetchCountySunTimes(date) {
    const apiKey = process.env.WeatherKEY;
    const response = await axios.get(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/${SUN_DATASET}`, {
        params: {
            Authorization: apiKey,
            Date: date
        }
    });

    return response.data?.records?.locations?.location || [];
}

async function fetchCountyMoonTimes(date) {
    const apiKey = process.env.WeatherKEY;
    const response = await axios.get(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/${MOON_DATASET}`, {
        params: {
            Authorization: apiKey,
            Date: date
        }
    });

    return response.data?.records?.locations?.location || [];
}

function normalizeCountySunTimes(locations = []) {
    return locations.reduce((acc, location) => {
        const countyName = location?.CountyName;
        const time = location?.time?.[0];
        if (!countyName || !time) return acc;

        acc[countyName] = {
            countyName,
            date: time.Date || null,
            civilDawn: time.BeginCivilTwilightTime || null,
            sunrise: time.SunRiseTime || null,
            solarNoon: time.SunTransitTime || null,
            solarAltitude: time.SunTransitAlt || null,
            sunset: time.SunSetTime || null,
            civilDusk: time.EndCivilTwilightTime || null
        };
        return acc;
    }, {});
}

function normalizeCountyMoonTimes(locations = []) {
    return locations.reduce((acc, location) => {
        const countyName = location?.CountyName;
        const time = location?.time?.[0];
        if (!countyName || !time) return acc;

        acc[countyName] = {
            countyName,
            date: time.Date || null,
            moonrise: time.MoonRiseTime || null,
            moonTransit: time.MoonTransitTime || null,
            moonTransitAltitude: time.MoonTransitAlt || null,
            moonset: time.MoonSetTime || null
        };
        return acc;
    }, {});
}

function pickCoordinate(geoInfo = {}) {
    const coordinates = Array.isArray(geoInfo.Coordinates) ? geoInfo.Coordinates : [];
    const wgs84 = coordinates.find((item) => item?.CoordinateName === 'WGS84') || coordinates[0] || {};
    return {
        latitude: parseNumber(wgs84.StationLatitude),
        longitude: parseNumber(wgs84.StationLongitude)
    };
}

function countPresent(values = []) {
    return values.filter((value) => value !== null && value !== undefined).length;
}

function scoreStationChoice(station = {}, category = 'weather') {
    let score = 0;
    if (/^\d+$/.test(station.stationId || '')) score += 20;
    if (station.countyName) score += 10;
    if (station.townName) score += 5;

    if (category === 'weather') {
        score += countPresent([
            station.airTemperatureC,
            station.relativeHumidityPercent,
            station.windSpeedMs,
            station.airPressureHpa,
            station.weatherText
        ]) * 10;
    } else {
        score += countPresent([
            station.nowMm,
            station.past1hrMm,
            station.past3hrMm,
            station.past24hrMm
        ]) * 10;
    }

    return score;
}

async function fetchLandObservations() {
    const apiKey = process.env.WeatherKEY;
    const response = await axios.get(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/${LAND_OBS_DATASET}`, {
        params: { Authorization: apiKey }
    });

    const stations = response.data?.records?.Station || [];
    return stations.map((station) => {
        const geoInfo = station.GeoInfo || {};
        const weather = station.WeatherElement || {};
        const gustInfo = weather.GustInfo || {};
        const dailyExtreme = weather.DailyExtreme || {};
        const coords = pickCoordinate(geoInfo);

        return {
            stationId: station.StationId || null,
            stationName: station.StationName || null,
            countyName: geoInfo.CountyName || null,
            townName: geoInfo.TownName || null,
            latitude: coords.latitude,
            longitude: coords.longitude,
            observedAt: station.ObsTime?.DateTime || null,
            weatherText: weather.Weather || null,
            precipitationNowMm: parseObservationNumber(weather.Now?.Precipitation),
            windDirectionDeg: parseObservationNumber(weather.WindDirection),
            windSpeedMs: parseObservationNumber(weather.WindSpeed),
            airTemperatureC: parseObservationNumber(weather.AirTemperature),
            relativeHumidityPercent: parseObservationNumber(weather.RelativeHumidity),
            airPressureHpa: parseObservationNumber(weather.AirPressure),
            peakGustSpeedMs: parseObservationNumber(gustInfo.PeakGustSpeed),
            dailyHighC: parseObservationNumber(dailyExtreme.DailyHigh?.TemperatureInfo?.AirTemperature),
            dailyLowC: parseObservationNumber(dailyExtreme.DailyLow?.TemperatureInfo?.AirTemperature)
        };
    }).filter((station) => station.stationId && station.countyName);
}

async function fetchRainObservations() {
    const apiKey = process.env.WeatherKEY;
    const response = await axios.get(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/${RAIN_OBS_DATASET}`, {
        params: { Authorization: apiKey }
    });

    const stations = response.data?.records?.Station || [];
    return stations.map((station) => {
        const geoInfo = station.GeoInfo || {};
        const rainfall = station.RainfallElement || {};
        const coords = pickCoordinate(geoInfo);

        return {
            stationId: station.StationId || null,
            stationName: station.StationName || null,
            countyName: geoInfo.CountyName || null,
            townName: geoInfo.TownName || null,
            latitude: coords.latitude,
            longitude: coords.longitude,
            observedAt: station.ObsTime?.DateTime || null,
            nowMm: parseObservationNumber(rainfall.Now?.Precipitation),
            past10MinMm: parseObservationNumber(rainfall.Past10Min?.Precipitation),
            past1hrMm: parseObservationNumber(rainfall.Past1hr?.Precipitation),
            past3hrMm: parseObservationNumber(rainfall.Past3hr?.Precipitation),
            past6hrMm: parseObservationNumber(rainfall.Past6Hr?.Precipitation),
            past12hrMm: parseObservationNumber(rainfall.Past12hr?.Precipitation),
            past24hrMm: parseObservationNumber(rainfall.Past24hr?.Precipitation),
            past2daysMm: parseObservationNumber(rainfall.Past2days?.Precipitation),
            past3daysMm: parseObservationNumber(rainfall.Past3days?.Precipitation)
        };
    }).filter((station) => station.stationId && station.countyName);
}

async function fetchTideForecasts(targetLocation, from, to) {
    const apiKey = process.env.WeatherKEY;
    const locations = await locationService.findLocationsByName(targetLocation);
    if (!locations) return null;

    const response = await axios.get(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/${TIDE_DATASET}`, {
        params: {
            Authorization: apiKey,
            timeFrom: from,
            timeTo: to,
            LocationName: locations
        }
    });

    return response.data?.records?.TideForecasts || [];
}

async function fetchMarineStations() {
    const apiKey = process.env.WeatherKEY;
    const url = `https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/${MARINE_STATION_DATASET}?Authorization=${apiKey}&downloadType=WEB&format=JSON`;
    const response = await axios.get(url);
    const locations = response.data?.cwaopendata?.Resources?.Resource?.Data?.SeaSurfaceObs?.Location || [];

    return locations.map((item) => {
        const station = item.Station || {};
        return {
            stationId: station.StationID || null,
            stationName: station.StationName || null,
            stationNameEN: station.StationNameEN || null,
            stationAttribute: station.StationAttribute || null,
            stationLongitude: parseNumber(station.StationLongitude),
            stationLatitude: parseNumber(station.StationLatitude),
            countyName: station.County?.CountyName || null,
            townName: station.Town?.TownName || null,
            areaName: station.Area?.AreaName || null
        };
    }).filter((station) => station.stationId);
}

function pickLatestMarineObs(stationObsTimes) {
    const obsList = Array.isArray(stationObsTimes?.StationObsTime)
        ? stationObsTimes.StationObsTime
        : [];
    if (obsList.length === 0) return null;

    const latest = [...obsList].sort((a, b) => new Date(b.DateTime) - new Date(a.DateTime))[0];
    const weather = latest.WeatherElements || {};
    const anemometer = weather.PrimaryAnemometer || {};
    const current = weather.SeaCurrents || {};

    return {
        observedAt: latest.DateTime || null,
        waveHeightM: parseNumber(weather.WaveHeight),
        waveDirectionDeg: parseNumber(weather.WaveDirection),
        waveDirectionText: weather.WaveDirectionDescription === 'None' ? null : (weather.WaveDirectionDescription || null),
        wavePeriodSec: parseNumber(weather.WavePeriod),
        seaTemperatureC: parseNumber(weather.SeaTemperature),
        windSpeedMs: parseNumber(anemometer.WindSpeed),
        windDirectionDeg: parseNumber(anemometer.WindDirection),
        windDirectionText: anemometer.WindDirectionDescription === 'None' ? null : (anemometer.WindDirectionDescription || null),
        maxWindSpeedMs: parseNumber(anemometer.MaximumWindSpeed),
        currentDirectionDeg: parseNumber(current.CurrentDirection),
        currentDirectionText: current.CurrentDirectionDescription === 'None' ? null : (current.CurrentDirectionDescription || null),
        currentSpeedMs: parseNumber(current.CurrentSpeed)
    };
}

async function fetchMarineObservations() {
    const apiKey = process.env.WeatherKEY;
    const response = await axios.get(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/${MARINE_OBS_DATASET}`, {
        params: { Authorization: apiKey }
    });

    const locations = response.data?.Records?.SeaSurfaceObs?.Location || [];
    return locations.map((item) => ({
        stationId: item.Station?.StationID || null,
        latest: pickLatestMarineObs(item.StationObsTimes)
    })).filter((item) => item.stationId);
}

function buildMarineMap(stations, observations) {
    const obsMap = observations.reduce((acc, obs) => {
        acc[obs.stationId] = obs.latest;
        return acc;
    }, {});

    return stations.map((station) => ({
        ...station,
        latest: obsMap[station.stationId] || null
    }));
}

function pickNearestMarineStationBy(lat, lon, marineStations = [], predicate) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    let nearest = null;
    for (const station of marineStations) {
        if (!Number.isFinite(station.stationLatitude) || !Number.isFinite(station.stationLongitude)) continue;
        if (!predicate(station.latest || {})) continue;
        const distanceKm = haversineKm(lat, lon, station.stationLatitude, station.stationLongitude);
        if (!nearest || distanceKm < nearest.distanceKm) {
            nearest = { station, distanceKm };
        }
    }
    return nearest;
}

function buildWeatherMap(weatherData = []) {
    return weatherData.reduce((acc, item) => {
        acc[item.city] = item.weather;
        return acc;
    }, {});
}

async function buildLocationIdMap() {
    const allLocations = await locationService.getAllLocations();
    return allLocations.reduce((acc, location) => {
        acc[location.locationName] = {
            locationId: location.locationId,
            latitude: parseNumber(location.latitude),
            longitude: parseNumber(location.longitude)
        };
        return acc;
    }, {});
}

function buildCountyCenterEntries() {
    return Object.entries(COUNTY_CENTERS).map(([city, coords]) => ({
        city,
        latitude: coords.latitude,
        longitude: coords.longitude
    }));
}

function findNearestCounty(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    let nearest = null;
    for (const entry of buildCountyCenterEntries()) {
        const distanceKm = haversineKm(lat, lon, entry.latitude, entry.longitude);
        if (!nearest || distanceKm < nearest.distanceKm) {
            nearest = { ...entry, distanceKm: Number(distanceKm.toFixed(2)) };
        }
    }
    return nearest;
}

function findForecastByCity(weatherItems = [], cityQuery = '') {
    const normalizedQuery = normalizeCountyName(cityQuery);
    if (!normalizedQuery) return null;

    return weatherItems.find((item) => item.city === normalizedQuery)
        || weatherItems.find((item) => item.city.includes(normalizedQuery))
        || null;
}

function buildForecastMeta(nowIso, partialSources, selection = {}) {
    return {
        updatedAt: nowIso,
        timezone: TIMEZONE,
        sourceDatasets: [
            WEATHER_36H_DATASET,
            SUN_DATASET,
            MOON_DATASET,
            LAND_OBS_DATASET,
            RAIN_OBS_DATASET
        ],
        partialSources,
        selectionMode: selection.mode || 'list',
        requestedCity: selection.requestedCity || null,
        requestedLat: selection.requestedLat ?? null,
        requestedLon: selection.requestedLon ?? null,
        resolvedCity: selection.resolvedCity || null,
        distanceKm: selection.distanceKm ?? null
    };
}

function findQueryCoordinate(query, locationMetaMap = {}) {
    const normalizedQuery = normalizeCountyName(query);
    const exact = locationMetaMap[normalizedQuery];
    if (Number.isFinite(exact?.latitude) && Number.isFinite(exact?.longitude)) {
        return {
            latitude: exact.latitude,
            longitude: exact.longitude,
            source: 'exact_location',
            label: normalizedQuery
        };
    }

    if (COUNTY_CENTERS[normalizedQuery]) {
        return {
            latitude: COUNTY_CENTERS[normalizedQuery].latitude,
            longitude: COUNTY_CENTERS[normalizedQuery].longitude,
            source: 'county_center',
            label: normalizedQuery
        };
    }

    const partial = Object.entries(locationMetaMap).find(([name]) => name.includes(normalizedQuery) || normalizedQuery.includes(name));
    if (Number.isFinite(partial?.[1]?.latitude) && Number.isFinite(partial?.[1]?.longitude)) {
        return {
            latitude: partial[1].latitude,
            longitude: partial[1].longitude,
            source: 'matched_location',
            label: partial[0]
        };
    }

    return null;
}

function findNearestLocationMeta(reference, locationMetaMap = {}) {
    if (!reference || !Number.isFinite(reference.latitude) || !Number.isFinite(reference.longitude)) return null;

    let nearest = null;
    for (const [locationName, meta] of Object.entries(locationMetaMap)) {
        if (!Number.isFinite(meta.latitude) || !Number.isFinite(meta.longitude)) continue;
        const distanceKm = haversineKm(reference.latitude, reference.longitude, meta.latitude, meta.longitude);
        if (!nearest || distanceKm < nearest.distanceKm) {
            nearest = {
                locationName,
                locationId: meta.locationId || null,
                latitude: meta.latitude,
                longitude: meta.longitude,
                distanceKm: Number(distanceKm.toFixed(2))
            };
        }
    }
    return nearest;
}

async function resolveTideForecastQuery(targetLocation, from, to, locationMetaMap) {
    const directForecasts = await fetchTideForecasts(targetLocation, from, to);
    if (Array.isArray(directForecasts) && directForecasts.length > 0) {
        return {
            forecasts: directForecasts,
            resolvedQuery: targetLocation,
            fallbackUsed: false,
            fallbackReason: null,
            resolutionSource: 'requested_location'
        };
    }

    const queryCoordinate = findQueryCoordinate(targetLocation, locationMetaMap);
    const nearestMeta = findNearestLocationMeta(queryCoordinate, locationMetaMap);
    if (!nearestMeta) {
        return {
            forecasts: null,
            resolvedQuery: null,
            fallbackUsed: false,
            fallbackReason: null,
            resolutionSource: null
        };
    }

    const fallbackForecasts = await fetchTideForecasts(nearestMeta.locationName, from, to);
    if (!Array.isArray(fallbackForecasts) || fallbackForecasts.length === 0) {
        return {
            forecasts: null,
            resolvedQuery: nearestMeta.locationName,
            fallbackUsed: true,
            fallbackReason: 'nearest_available_location_has_no_tide_data',
            resolutionSource: 'nearest_available_location'
        };
    }

    return {
        forecasts: fallbackForecasts,
        resolvedQuery: nearestMeta.locationName,
        fallbackUsed: true,
        fallbackReason: 'requested_location_has_no_direct_tide_data',
        resolutionSource: 'nearest_available_location',
        nearestMeta
    };
}

function pickNearestMarineStation(lat, lon, marineStations = []) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    let nearest = null;
    for (const station of marineStations) {
        if (!Number.isFinite(station.stationLatitude) || !Number.isFinite(station.stationLongitude)) continue;
        const distanceKm = haversineKm(lat, lon, station.stationLatitude, station.stationLongitude);
        if (!nearest || distanceKm < nearest.distanceKm) {
            nearest = { station, distanceKm };
        }
    }
    return nearest;
}

function buildMarineSelection(lat, lon, marineStations = []) {
    const wave = pickNearestMarineStationBy(
        lat,
        lon,
        marineStations,
        (latest) => latest.waveHeightM !== null || latest.wavePeriodSec !== null || latest.waveDirectionDeg !== null || latest.waveDirectionText !== null
    );
    const wind = pickNearestMarineStationBy(
        lat,
        lon,
        marineStations,
        (latest) => latest.windSpeedMs !== null || latest.maxWindSpeedMs !== null || latest.windDirectionDeg !== null || latest.windDirectionText !== null
    );
    const sea = pickNearestMarineStationBy(
        lat,
        lon,
        marineStations,
        (latest) => latest.seaTemperatureC !== null
    );
    const current = pickNearestMarineStationBy(
        lat,
        lon,
        marineStations,
        (latest) => latest.currentSpeedMs !== null || latest.currentDirectionDeg !== null || latest.currentDirectionText !== null
    );
    const fallback = pickNearestMarineStation(lat, lon, marineStations);

    const primary = wave || wind || sea || current || fallback || null;
    const mergedLatest = {
        observedAt: wave?.station.latest?.observedAt
            || wind?.station.latest?.observedAt
            || sea?.station.latest?.observedAt
            || current?.station.latest?.observedAt
            || fallback?.station.latest?.observedAt
            || null,
        waveHeightM: wave?.station.latest?.waveHeightM ?? null,
        waveDirectionDeg: wave?.station.latest?.waveDirectionDeg ?? null,
        waveDirectionText: wave?.station.latest?.waveDirectionText ?? null,
        wavePeriodSec: wave?.station.latest?.wavePeriodSec ?? null,
        seaTemperatureC: sea?.station.latest?.seaTemperatureC ?? null,
        windSpeedMs: wind?.station.latest?.windSpeedMs ?? null,
        windDirectionDeg: wind?.station.latest?.windDirectionDeg ?? null,
        windDirectionText: wind?.station.latest?.windDirectionText ?? null,
        maxWindSpeedMs: wind?.station.latest?.maxWindSpeedMs ?? null,
        currentDirectionDeg: current?.station.latest?.currentDirectionDeg ?? null,
        currentDirectionText: current?.station.latest?.currentDirectionText ?? null,
        currentSpeedMs: current?.station.latest?.currentSpeedMs ?? null
    };

    return {
        primary,
        byField: { wave, wind, sea, current, fallback },
        mergedLatest
    };
}

function buildTidyLocations(tideForecasts, locationMetaMap, weatherMap, marineStations, now) {
    const grouped = new Map();

    for (const forecast of tideForecasts) {
        const location = forecast?.Location;
        const locationName = location?.LocationName;
        if (!locationName) continue;

        const city = locationName.includes('市')
            ? `${locationName.split('市')[0]}市`
            : locationName.includes('縣')
                ? `${locationName.split('縣')[0]}縣`
                : locationName;
        const locationMeta = locationMetaMap[locationName] || {};
        const latitude = locationMeta.latitude ?? parseNumber(location?.Latitude);
        const longitude = locationMeta.longitude ?? parseNumber(location?.Longitude);

        if (!grouped.has(locationName)) {
            grouped.set(locationName, {
                locationName,
                locationId: locationMeta.locationId || null,
                city,
                latitude,
                longitude,
                dayMap: new Map()
            });
        }

        const target = grouped.get(locationName);
        for (const daily of location?.TimePeriods?.Daily || []) {
            if (!target.dayMap.has(daily.Date)) {
                target.dayMap.set(daily.Date, {
                    date: daily.Date,
                    lunarDate: daily.LunarDate || null,
                    tideRange: daily.TideRange || null,
                    events: []
                });
            }

            const day = target.dayMap.get(daily.Date);
            for (const event of daily.Time || []) {
                day.events.push({
                    dateTime: event.DateTime,
                    tide: event.Tide,
                    type: normalizeTideType(event.Tide),
                    tideHeights: {
                        aboveTWVDcm: parseNumber(event.TideHeights?.AboveTWVD),
                        aboveLocalMSLcm: parseNumber(event.TideHeights?.AboveLocalMSL),
                        aboveChartDatumcm: parseNumber(event.TideHeights?.AboveChartDatum)
                    }
                });
            }
        }
    }

    return Array.from(grouped.values()).map((entry) => {
        const days = Array.from(entry.dayMap.values())
            .map((day) => ({
                ...day,
                events: day.events.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const allEvents = days.flatMap((day) => day.events);
        const nextEvent = allEvents.find((event) => new Date(event.dateTime) > now) || null;
        const prevEvent = [...allEvents].reverse().find((event) => new Date(event.dateTime) <= now) || null;
        const tideStage = prevEvent?.type === 'LOW'
            ? 'rising'
            : prevEvent?.type === 'HIGH'
                ? 'falling'
                : 'unknown';
        const marineSelection = buildMarineSelection(entry.latitude, entry.longitude, marineStations);
        const nearestMarine = marineSelection.primary;

        return {
            locationId: entry.locationId,
            locationName: entry.locationName,
            city: entry.city,
            latitude: entry.latitude,
            longitude: entry.longitude,
            weather36h: weatherMap[entry.city] || [],
            marine: nearestMarine ? {
                source: {
                    stationId: nearestMarine.station.stationId,
                    stationName: nearestMarine.station.stationName,
                    stationAttribute: nearestMarine.station.stationAttribute,
                    countyName: nearestMarine.station.countyName,
                    townName: nearestMarine.station.townName,
                    areaName: nearestMarine.station.areaName,
                    distanceKm: Number(nearestMarine.distanceKm.toFixed(2))
                },
                latest: marineSelection.mergedLatest,
                sources: {
                    wave: marineSelection.byField.wave ? {
                        stationId: marineSelection.byField.wave.station.stationId,
                        stationName: marineSelection.byField.wave.station.stationName,
                        distanceKm: Number(marineSelection.byField.wave.distanceKm.toFixed(2))
                    } : null,
                    wind: marineSelection.byField.wind ? {
                        stationId: marineSelection.byField.wind.station.stationId,
                        stationName: marineSelection.byField.wind.station.stationName,
                        distanceKm: Number(marineSelection.byField.wind.distanceKm.toFixed(2))
                    } : null,
                    sea: marineSelection.byField.sea ? {
                        stationId: marineSelection.byField.sea.station.stationId,
                        stationName: marineSelection.byField.sea.station.stationName,
                        distanceKm: Number(marineSelection.byField.sea.distanceKm.toFixed(2))
                    } : null,
                    current: marineSelection.byField.current ? {
                        stationId: marineSelection.byField.current.station.stationId,
                        stationName: marineSelection.byField.current.station.stationName,
                        distanceKm: Number(marineSelection.byField.current.distanceKm.toFixed(2))
                    } : null
                }
            } : null,
            tide: {
                timezone: TIMEZONE,
                now: {
                    observedAt: now.toISOString(),
                    tideStage,
                    nextTide: nextEvent
                },
                days
            }
        };
    });
}

function pickBestLocation(locations, query) {
    if (!locations || locations.length === 0) return null;
    const q = (query || '').trim();
    if (!q) return locations[0];

    const scored = locations.map((location) => {
        let score = 0;
        if (location.locationName === q) score += 100;
        if (location.locationName.includes(q)) score += 60;
        if (location.city === q) score += 40;
        if (location.marine?.source?.distanceKm !== undefined) {
            score += clamp(20 - location.marine.source.distanceKm, 0, 20);
        }
        return { location, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].location;
}

function buildWeatherUI(weather36h, nowIso) {
    const now = new Date(nowIso);
    const currentSlot = weather36h.find((slot) => {
        const start = new Date(slot.startTime.replace(' ', 'T'));
        const end = new Date(slot.endTime.replace(' ', 'T'));
        return now >= start && now <= end;
    }) || weather36h[0] || {};

    const hourly = weather36h.map((slot) => {
        const dateTime = slot.startTime?.replace(' ', 'T') ? `${slot.startTime.replace(' ', 'T')}+08:00` : null;
        return {
            dateTime,
            displayTime: slot.startTime ? slot.startTime.slice(11, 16) : '--:--',
            icon: weatherIconFromDescription(slot.description || ''),
            description: slot.description || '未知',
            temperatureC: slot.avgTempC ?? null,
            popPercent: slot.popPercent ?? null
        };
    });

    return {
        current: {
            description: currentSlot.description || '未知',
            icon: weatherIconFromDescription(currentSlot.description || ''),
            temperatureC: currentSlot.avgTempC ?? null,
            feelsLikeC: null,
            popPercent: currentSlot.popPercent ?? null
        },
        hourly
    };
}

function buildTideUI(tideData, nowIso) {
    const now = new Date(nowIso);
    const days = tideData?.days || [];
    const todayDate = toDateLabel(nowIso) || getLocalToday();
    const today = days.find((day) => day.date === todayDate) || days[0] || { events: [] };
    const events = today.events || [];
    const allEvents = days.flatMap((day) => day.events || []);
    const nextEvent = allEvents.find((event) => new Date(event.dateTime) > now) || tideData?.now?.nextTide || null;
    const prevEvent = [...allEvents].reverse().find((event) => new Date(event.dateTime) <= now) || null;

    let stage = 'unknown';
    if (prevEvent?.type === 'LOW') stage = 'rising';
    if (prevEvent?.type === 'HIGH') stage = 'falling';
    if (nextEvent && prevEvent && prevEvent.type === nextEvent.type) stage = 'slack';

    let progressToNextEvent = null;
    if (prevEvent && nextEvent) {
        const total = new Date(nextEvent.dateTime).getTime() - new Date(prevEvent.dateTime).getTime();
        const passed = now.getTime() - new Date(prevEvent.dateTime).getTime();
        if (total > 0) {
            progressToNextEvent = Number(clamp(passed / total, 0, 1).toFixed(2));
        }
    }

    const startTime = `${today.date || todayDate}T00:00:00+08:00`;
    const endTime = `${today.date || todayDate}T23:59:59+08:00`;
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();

    const chartHeights = events.map((event) => parseNumber(event.tideHeights?.aboveChartDatumcm)).filter((n) => n !== null);
    const minH = chartHeights.length > 0 ? Math.min(...chartHeights) : 0;
    const maxH = chartHeights.length > 0 ? Math.max(...chartHeights) : 1;
    const spanH = maxH - minH || 1;

    const points = events.map((event) => {
        const ms = new Date(event.dateTime).getTime();
        const x = Number(clamp((ms - startMs) / (endMs - startMs), 0, 1).toFixed(3));
        const h = parseNumber(event.tideHeights?.aboveChartDatumcm);
        const y = h === null ? 0.5 : Number(clamp((h - minH) / spanH, 0, 1).toFixed(3));
        return { time: event.dateTime, x, y, type: event.type };
    });

    const nowX = Number(clamp((now.getTime() - startMs) / (endMs - startMs), 0, 1).toFixed(3));
    let nowY = 0.5;
    if (points.length >= 2) {
        const currentIdx = points.findIndex((point) => new Date(point.time) > now);
        if (currentIdx > 0) {
            const p1 = points[currentIdx - 1];
            const p2 = points[currentIdx];
            const t1 = new Date(p1.time).getTime();
            const t2 = new Date(p2.time).getTime();
            const ratio = t2 > t1 ? clamp((now.getTime() - t1) / (t2 - t1), 0, 1) : 0;
            nowY = Number((p1.y + (p2.y - p1.y) * ratio).toFixed(3));
        } else if (currentIdx === -1) {
            nowY = points[points.length - 1].y;
        } else {
            nowY = points[0].y;
        }
    } else if (points.length === 1) {
        nowY = points[0].y;
    }

    return {
        now: {
            observedAt: nowIso,
            stage,
            stageLabel: tideStageLabel(stage),
            icon: tideStageIcon(stage),
            progressToNextEvent,
            currentRelativePosition: prevEvent && nextEvent
                ? `between_${prevEvent.type.toLowerCase()}_and_${nextEvent.type.toLowerCase()}`
                : 'unknown'
        },
        nextEvent: nextEvent ? {
            dateTime: nextEvent.dateTime,
            type: nextEvent.type,
            label: nextEvent.type === 'HIGH' ? 'High Tide' : 'Low Tide',
            tideLabel: nextEvent.tide || (nextEvent.type === 'HIGH' ? '滿潮' : '乾潮'),
            height: {
                aboveTWVDcm: parseNumber(nextEvent.tideHeights?.aboveTWVDcm),
                aboveLocalMSLcm: parseNumber(nextEvent.tideHeights?.aboveLocalMSLcm),
                aboveChartDatumcm: parseNumber(nextEvent.tideHeights?.aboveChartDatumcm)
            },
            display: {
                time: toTimeLabel(nextEvent.dateTime),
                height: nextEvent.tideHeights?.aboveChartDatumcm !== null && nextEvent.tideHeights?.aboveChartDatumcm !== undefined
                    ? `${nextEvent.tideHeights.aboveChartDatumcm} cm`
                    : '--'
            }
        } : null,
        today: {
            date: today.date || todayDate,
            lunarDate: today.lunarDate || '',
            tideRange: today.tideRange || '',
            events: events.map((event, index) => ({
                id: `t${index + 1}`,
                dateTime: event.dateTime,
                type: event.type,
                label: event.type === 'HIGH' ? 'High Tide' : 'Low Tide',
                tideLabel: event.tide,
                heightAboveChartDatumCm: parseNumber(event.tideHeights?.aboveChartDatumcm)
            })),
            timeline: {
                startTime,
                endTime,
                currentTime: nowIso,
                points,
                currentMarker: {
                    x: nowX,
                    y: nowY
                }
            }
        }
    };
}

function buildCountyObservationMap(stations = [], category = 'weather') {
    const grouped = stations.reduce((acc, station) => {
        if (!acc[station.countyName]) acc[station.countyName] = [];
        acc[station.countyName].push(station);
        return acc;
    }, {});

    return Object.entries(grouped).reduce((acc, [countyName, countyStations]) => {
        const ranked = [...countyStations].sort((a, b) => {
            const scoreDiff = scoreStationChoice(b, category) - scoreStationChoice(a, category);
            if (scoreDiff !== 0) return scoreDiff;
            return (a.stationId || '').localeCompare(b.stationId || '');
        });
        acc[countyName] = ranked[0] || null;
        return acc;
    }, {});
}

function buildCountySunUI(sunInfo, nowIso) {
    if (!sunInfo?.date) {
        return {
            sunrise: null,
            sunset: null,
            civilDawn: null,
            civilDusk: null,
            solarNoon: null,
            minutesToSunrise: null,
            minutesToSunset: null
        };
    }

    const sunriseIso = sunInfo.sunrise ? `${sunInfo.date}T${sunInfo.sunrise}:00+08:00` : null;
    const sunsetIso = sunInfo.sunset ? `${sunInfo.date}T${sunInfo.sunset}:00+08:00` : null;

    const minutesToSunrise = sunriseIso ? diffMinutes(nowIso, sunriseIso) : null;
    const minutesToSunset = sunsetIso ? diffMinutes(nowIso, sunsetIso) : null;

    return {
        sunrise: sunInfo.sunrise,
        sunset: sunInfo.sunset,
        civilDawn: sunInfo.civilDawn,
        civilDusk: sunInfo.civilDusk,
        solarNoon: sunInfo.solarNoon,
        minutesToSunrise: minutesToSunrise !== null && minutesToSunrise >= 0 ? minutesToSunrise : null,
        minutesToSunset: minutesToSunset !== null && minutesToSunset >= 0 ? minutesToSunset : null
    };
}

function buildCountyMoonUI(moonInfo) {
    return {
        moonrise: moonInfo?.moonrise || null,
        moonTransit: moonInfo?.moonTransit || null,
        moonset: moonInfo?.moonset || null
    };
}

function buildCurrentObservationUI(weatherStation, rainStation) {
    return {
        station: {
            weather: weatherStation ? {
                id: weatherStation.stationId,
                name: weatherStation.stationName,
                countyName: weatherStation.countyName,
                townName: weatherStation.townName,
                observedAt: weatherStation.observedAt
            } : null,
            rain: rainStation ? {
                id: rainStation.stationId,
                name: rainStation.stationName,
                countyName: rainStation.countyName,
                townName: rainStation.townName,
                observedAt: rainStation.observedAt
            } : null
        },
        weatherText: weatherStation?.weatherText || null,
        temperatureC: weatherStation?.airTemperatureC ?? null,
        humidityPercent: weatherStation?.relativeHumidityPercent ?? null,
        windSpeedMs: weatherStation?.windSpeedMs ?? null,
        windDirectionDeg: weatherStation?.windDirectionDeg ?? null,
        pressureHpa: weatherStation?.airPressureHpa ?? null,
        peakGustSpeedMs: weatherStation?.peakGustSpeedMs ?? null,
        dailyHighC: weatherStation?.dailyHighC ?? null,
        dailyLowC: weatherStation?.dailyLowC ?? null,
        rainNowMm: rainStation?.nowMm ?? weatherStation?.precipitationNowMm ?? null,
        rainPast1hMm: rainStation?.past1hrMm ?? null,
        rainPast3hMm: rainStation?.past3hrMm ?? null,
        rainPast24hMm: rainStation?.past24hrMm ?? null
    };
}

function slotIntersectsDaylight(slotStartIso, slotEndIso, sunInfo) {
    if (!sunInfo?.date || !sunInfo?.sunrise || !sunInfo?.sunset) return null;
    if ((slotStartIso || '').slice(0, 10) !== sunInfo.date) return null;
    const sunriseMs = new Date(`${sunInfo.date}T${sunInfo.sunrise}:00+08:00`).getTime();
    const sunsetMs = new Date(`${sunInfo.date}T${sunInfo.sunset}:00+08:00`).getTime();
    const startMs = new Date(slotStartIso).getTime();
    const endMs = new Date(slotEndIso).getTime();
    if ([sunriseMs, sunsetMs, startMs, endMs].some((value) => Number.isNaN(value))) return null;
    const overlapMs = Math.max(0, Math.min(endMs, sunsetMs) - Math.max(startMs, sunriseMs));
    const slotMs = Math.max(0, endMs - startMs);
    if (slotMs === 0) return null;
    return overlapMs / slotMs >= 0.5;
}

function comfortLevelFromText(comfort = '') {
    if (!comfort) return 'unknown';
    if (comfort.includes('寒')) return 'cold';
    if (comfort.includes('熱')) return 'warm';
    if (comfort.includes('舒適')) return 'comfortable';
    return 'mixed';
}

function heatRiskLevel(avgTempC, comfort) {
    if (avgTempC === null) return 'unknown';
    if (avgTempC >= 32 || comfort.includes('炎熱')) return 'high';
    if (avgTempC >= 28 || comfort.includes('悶熱')) return 'moderate';
    return 'low';
}

function rainRiskLevel(popPercent, description = '') {
    if (popPercent === null && !description) return 'unknown';
    if (popPercent >= 60 || description.includes('雷') || description.includes('大雨')) return 'high';
    if (popPercent >= 30 || description.includes('雨')) return 'moderate';
    return 'low';
}

function computeOutdoorScore(slot, isDaylight) {
    let score = 75;
    const avgTemp = slot.avgTempC;
    const comfort = slot.comfort || '';
    const pop = slot.popPercent;
    const description = slot.description || '';

    if (pop !== null) {
        if (pop >= 70) score -= 35;
        else if (pop >= 50) score -= 25;
        else if (pop >= 30) score -= 15;
        else if (pop >= 10) score -= 5;
    }

    if (description.includes('雷')) score -= 30;
    else if (description.includes('雨')) score -= 18;

    if (avgTemp !== null) {
        if (avgTemp >= 33) score -= 18;
        else if (avgTemp >= 30) score -= 10;
        else if (avgTemp < 14) score -= 15;
        else if (avgTemp < 18) score -= 8;
    }

    if (comfort.includes('悶熱')) score -= 8;
    if (comfort.includes('寒冷')) score -= 10;
    if (isDaylight === true) score += 8;

    return Math.round(clamp(score, 0, 100));
}

function summarizeCountyHeadline(bestWindow, currentObservation) {
    const parts = [];
    if (currentObservation?.weatherText) parts.push(`目前${currentObservation.weatherText}`);
    if (bestWindow?.rainRisk === 'low') parts.push('短時降雨風險低');
    else if (bestWindow?.rainRisk === 'moderate') parts.push('有局部降雨機會');
    else if (bestWindow?.rainRisk === 'high') parts.push('降雨風險偏高');

    if (bestWindow?.heatRisk === 'high') parts.push('白天偏熱');
    else if (bestWindow?.heatRisk === 'moderate') parts.push('體感偏暖');

    return parts.slice(0, 3).join('，') || '天氣資料已更新';
}

function buildEnhanced36HourItem(cityWeather, sunInfo, moonInfo, weatherStation, rainStation, nowIso) {
    const timeline = (cityWeather.weather || []).map((slot) => {
        const startIso = toSlotIso(slot.startTime);
        const endIso = toSlotIso(slot.endTime);
        const isDaylight = startIso && endIso ? slotIntersectsDaylight(startIso, endIso, sunInfo) : null;
        const rainRisk = rainRiskLevel(slot.popPercent, slot.description);
        const heatRisk = heatRiskLevel(slot.avgTempC, slot.comfort || '');
        const outdoorScore = computeOutdoorScore(slot, isDaylight);

        return {
            startTime: startIso,
            endTime: endIso,
            weather: {
                description: slot.description || '未知',
                detail: slot.comfort || null,
                icon: weatherIconFromDescription(slot.description || '')
            },
            temperature: {
                minC: slot.minTempC ?? null,
                maxC: slot.maxTempC ?? null,
                avgC: slot.avgTempC ?? null
            },
            rain: {
                pop12hPercent: slot.popPercent ?? null,
                riskLevel: rainRisk
            },
            comfort: {
                text: slot.comfort || null,
                level: comfortLevelFromText(slot.comfort || '')
            },
            derived: {
                outdoorScore,
                isDaylight,
                heatRisk,
                rainRisk
            }
        };
    });

    const bestWindow = [...timeline].sort((a, b) => b.derived.outdoorScore - a.derived.outdoorScore)[0] || null;
    const currentObservation = buildCurrentObservationUI(weatherStation, rainStation);
    const dateRange = {
        from: timeline[0]?.startTime ? toDateLabel(timeline[0].startTime) : null,
        to: timeline[timeline.length - 1]?.endTime ? toDateLabel(timeline[timeline.length - 1].endTime) : null
    };

    return {
        city: cityWeather.city,
        dateRange,
        sun: buildCountySunUI(sunInfo, nowIso),
        moon: buildCountyMoonUI(moonInfo),
        currentObservation,
        summary: {
            headline: summarizeCountyHeadline(bestWindow?.derived, currentObservation),
            bestWindow: bestWindow ? {
                startTime: bestWindow.startTime,
                endTime: bestWindow.endTime,
                score: bestWindow.derived.outdoorScore,
                reason: bestWindow.derived.rainRisk === 'low'
                    ? '降雨風險較低'
                    : bestWindow.derived.heatRisk === 'low'
                        ? '體感較舒適'
                        : '整體條件相對較佳'
            } : null
        },
        timeline
    };
}

function buildOceanConditionsUI(location) {
    const station = location.marine?.source || {};
    const latest = location.marine?.latest || {};
    const sources = location.marine?.sources || {};
    const waveLevel = waveRiskLevel(latest.waveHeightM);
    const windLevel = windRiskLevel(latest.windSpeedMs);

    return {
        station: {
            id: station.stationId || null,
            name: station.stationName || null,
            attribute: station.stationAttribute || null,
            countyName: station.countyName || null,
            townName: station.townName || null,
            areaName: station.areaName || null,
            distanceKm: station.distanceKm ?? null,
            observedAt: latest.observedAt || null
        },
        sources: {
            wave: sources.wave || null,
            wind: sources.wind || null,
            sea: sources.sea || null,
            current: sources.current || null
        },
        wave: {
            heightM: latest.waveHeightM ?? null,
            periodSec: latest.wavePeriodSec ?? null,
            directionDeg: latest.waveDirectionDeg ?? null,
            directionText: latest.waveDirectionText ?? null,
            level: waveLevel,
            colorToken: COLOR_BY_RISK[waveLevel],
            display: {
                primary: latest.waveHeightM !== null ? `${latest.waveHeightM} m` : '--',
                secondary: latest.wavePeriodSec !== null ? `Period ${latest.wavePeriodSec} s` : 'Period --'
            }
        },
        wind: {
            speedMs: latest.windSpeedMs ?? null,
            maxSpeedMs: latest.maxWindSpeedMs ?? null,
            directionDeg: latest.windDirectionDeg ?? null,
            directionText: latest.windDirectionText ?? null,
            level: windLevel,
            colorToken: COLOR_BY_RISK[windLevel],
            display: {
                primary: latest.windSpeedMs !== null ? `${latest.windSpeedMs} m/s` : '--',
                secondary: latest.maxWindSpeedMs !== null ? `Max ${latest.maxWindSpeedMs} m/s` : 'Max --'
            }
        },
        sea: {
            temperatureC: latest.seaTemperatureC ?? null,
            display: {
                primary: latest.seaTemperatureC !== null ? `${latest.seaTemperatureC}°` : '--'
            }
        },
        current: {
            speedMs: latest.currentSpeedMs ?? null,
            directionDeg: latest.currentDirectionDeg ?? null,
            directionText: latest.currentDirectionText ?? null
        }
    };
}

function buildSummaryAndIndicators(uiOcean, uiTide, uiWeather) {
    const reasons = [];
    const warnings = [];
    let score = 50;

    if (uiOcean.wave.level === 'safe') {
        reasons.push({ code: 'LOW_WAVE', label: '浪高偏低' });
        score += 20;
    } else if (uiOcean.wave.level === 'moderate') {
        reasons.push({ code: 'WAVE_MODERATE', label: '浪高中等' });
        score += 5;
    } else if (uiOcean.wave.level === 'danger') {
        warnings.push({ code: 'HIGH_WAVE', label: '浪高偏大' });
        score -= 25;
    }

    if (uiOcean.wind.level === 'safe') {
        reasons.push({ code: 'LOW_WIND', label: '風速平穩' });
        score += 20;
    } else if (uiOcean.wind.level === 'moderate') {
        warnings.push({ code: 'WIND_MODERATE', label: '風勢普通，請留意' });
        score += 5;
    } else if (uiOcean.wind.level === 'danger') {
        warnings.push({ code: 'STRONG_WIND', label: '風勢偏強，請注意安全' });
        score -= 20;
    }

    if (uiTide.now.stage === 'rising' || uiTide.now.stage === 'falling') {
        reasons.push({ code: 'TIDE_MOVING', label: '目前潮汐有流動' });
        score += 10;
    }

    const currentPop = uiWeather.current.popPercent;
    if (currentPop !== null && currentPop >= 40) {
        warnings.push({ code: 'RAIN_PROBABILITY', label: '降雨機率偏高' });
        score -= 12;
    }

    score = Math.round(clamp(score, 0, 100));

    let overallLevel = 'unknown';
    if (score >= 75) overallLevel = 'good';
    else if (score >= 50) overallLevel = 'moderate';
    else overallLevel = 'danger';

    let headline = '資料不足，建議保守判斷';
    let shortLabel = '資料不足';
    if (overallLevel === 'good') {
        headline = '風浪平穩，適合釣魚活動';
        shortLabel = '適合釣魚';
    } else if (overallLevel === 'moderate') {
        headline = '條件普通，出行前建議再確認海況';
        shortLabel = '條件普通';
    } else if (overallLevel === 'danger') {
        headline = '風浪條件偏差，建議降低海上活動';
        shortLabel = '風浪偏強';
    }

    const recommendation = {
        primary: overallLevel === 'good'
            ? '適合岸釣'
            : overallLevel === 'moderate'
                ? '可岸釣，請留意風浪變化'
                : '不建議出海，岸邊活動需謹慎',
        secondary: uiOcean.wind.level === 'danger'
            ? '強風風險較高'
            : uiOcean.wave.level === 'danger'
                ? '浪況偏大'
                : '請持續關注即時海象更新',
        tags: [
            {
                code: 'SHORE_STATUS',
                label: overallLevel === 'danger' ? '岸釣需謹慎' : '岸釣可行',
                level: overallLevel === 'good' ? 'good' : overallLevel === 'moderate' ? 'caution' : 'danger'
            },
            {
                code: 'OFFSHORE_STATUS',
                label: uiOcean.wave.level === 'safe' && uiOcean.wind.level !== 'danger'
                    ? '外海條件尚可'
                    : '外海需特別留意',
                level: uiOcean.wave.level === 'danger' || uiOcean.wind.level === 'danger' ? 'danger' : 'caution'
            }
        ]
    };

    const indicators = {
        fishingSuitability: {
            level: SUMMARY_LEVELS.includes(overallLevel) ? overallLevel : 'unknown',
            score,
            label: overallLevel === 'good' ? '適合釣魚' : overallLevel === 'moderate' ? '尚可釣魚' : '不建議釣魚'
        },
        shoreSafety: {
            level: uiOcean.wave.level === 'danger' ? 'danger' : uiOcean.wind.level === 'danger' ? 'moderate' : 'safe',
            label: uiOcean.wave.level === 'danger' ? '岸邊風浪較大' : '岸邊條件穩定'
        },
        offshoreSafety: {
            level: uiOcean.wave.level === 'danger' || uiOcean.wind.level === 'danger' ? 'danger' : 'moderate',
            label: uiOcean.wave.level === 'danger' || uiOcean.wind.level === 'danger' ? '外海風浪風險高' : '外海需留意變化'
        },
        waveRisk: {
            level: RISK_LEVELS.includes(uiOcean.wave.level) ? uiOcean.wave.level : 'unknown',
            label: uiOcean.wave.level === 'safe' ? '浪況穩定' : uiOcean.wave.level === 'moderate' ? '浪況中等' : uiOcean.wave.level === 'danger' ? '浪況偏高' : '浪況未知'
        },
        windRisk: {
            level: RISK_LEVELS.includes(uiOcean.wind.level) ? uiOcean.wind.level : 'unknown',
            label: uiOcean.wind.level === 'safe' ? '風勢平穩' : uiOcean.wind.level === 'moderate' ? '風勢普通' : uiOcean.wind.level === 'danger' ? '風勢偏強' : '風勢未知'
        }
    };

    return {
        summary: { headline, shortLabel, overallLevel, score, reasons, warnings },
        recommendation,
        indicators
    };
}

function buildTidyDetailResponse(targetLocation, from, to, selectedLocation, usedMarineStations, nowIso, resolutionMeta = {}) {
    const oceanConditions = buildOceanConditionsUI(selectedLocation);
    const weather = buildWeatherUI(selectedLocation.weather36h || [], nowIso);
    const tide = buildTideUI(selectedLocation.tide || {}, nowIso);
    const { summary, recommendation, indicators } = buildSummaryAndIndicators(oceanConditions, tide, weather);

    return {
        meta: {
            updatedAt: new Date().toISOString(),
            timezone: TIMEZONE,
            sourceDatasets: ['cwa_weather_36h', 'cwa_marine_station', 'cwa_tide'],
            query: {
                location: targetLocation,
                from: `${from}+08:00`,
                to: `${to}+08:00`
            },
            requestedLocation: resolutionMeta.requestedLocation || targetLocation,
            resolvedLocation: resolutionMeta.resolvedLocation || selectedLocation.locationName,
            fallbackUsed: resolutionMeta.fallbackUsed || false,
            fallbackReason: resolutionMeta.fallbackReason || null,
            resolvedSources: resolutionMeta.resolvedSources || {
                tide: resolutionMeta.resolutionSource || 'requested_location',
                marine: oceanConditions.station.id ? 'nearest_available_station' : 'unavailable'
            },
            nearestStation: oceanConditions.station.id ? {
                id: oceanConditions.station.id,
                name: oceanConditions.station.name,
                distanceKm: oceanConditions.station.distanceKm
            } : null,
            units: {
                temperature: 'C',
                waveHeight: 'm',
                wavePeriod: 's',
                windSpeed: 'm/s',
                distance: 'km',
                tideHeight: 'cm'
            }
        },
        location: {
            id: selectedLocation.locationId,
            name: selectedLocation.locationName,
            city: selectedLocation.city,
            latitude: selectedLocation.latitude,
            longitude: selectedLocation.longitude,
            currentTime: nowIso
        },
        ui: {
            summary,
            recommendation,
            oceanConditions,
            tide,
            weather,
            indicators
        },
        raw: {
            marineStations: usedMarineStations,
            weather36h: selectedLocation.weather36h || [],
            tideDays: selectedLocation.tide?.days || []
        }
    };
}

function flattenTideData(tideForecasts = []) {
    return tideForecasts.flatMap((forecast) => {
        const location = forecast.Location;
        return (location?.TimePeriods?.Daily || []).map((timePeriod) => ({
            LocationName: location.LocationName,
            Latitude: location.Latitude,
            Longitude: location.Longitude,
            TimePeriods: timePeriod
        }));
    });
}

async function get_36_hour_weather(req, res) {
    try {
        if (!process.env.WeatherKEY) {
            return res.status(500).json({ error: 'WeatherKEY 尚未設定' });
        }

        const requestedCity = normalizeCountyName(req.query.city || '');
        const requestedLat = parseNumber(req.query.lat);
        const requestedLon = parseNumber(req.query.lon);
        const selectionMode = requestedCity
            ? 'city'
            : (Number.isFinite(requestedLat) && Number.isFinite(requestedLon) ? 'nearest' : 'list');
        const today = getLocalToday();
        const nowIso = new Date().toISOString();
        const [
            weather36h,
            sunResult,
            moonResult,
            landObsResult,
            rainObsResult
        ] = await Promise.allSettled([
            fetchWeather36h(),
            fetchCountySunTimes(today),
            fetchCountyMoonTimes(today),
            fetchLandObservations(),
            fetchRainObservations()
        ]);

        if (weather36h.status !== 'fulfilled') {
            throw weather36h.reason;
        }

        const sunMap = sunResult.status === 'fulfilled'
            ? normalizeCountySunTimes(sunResult.value)
            : {};
        const moonMap = moonResult.status === 'fulfilled'
            ? normalizeCountyMoonTimes(moonResult.value)
            : {};
        const weatherObsMap = landObsResult.status === 'fulfilled'
            ? buildCountyObservationMap(landObsResult.value, 'weather')
            : {};
        const rainObsMap = rainObsResult.status === 'fulfilled'
            ? buildCountyObservationMap(rainObsResult.value, 'rain')
            : {};
        const partialSources = {
            sun: sunResult.status === 'fulfilled',
            moon: moonResult.status === 'fulfilled',
            landObservation: landObsResult.status === 'fulfilled',
            rainObservation: rainObsResult.status === 'fulfilled'
        };

        const formattedData = weather36h.value.map((cityWeather) => buildEnhanced36HourItem(
            cityWeather,
            sunMap[cityWeather.city] || null,
            moonMap[cityWeather.city] || null,
            weatherObsMap[cityWeather.city] || null,
            rainObsMap[cityWeather.city] || null,
            nowIso
        ));

        if (selectionMode === 'city') {
            const selected = findForecastByCity(formattedData, requestedCity);
            if (!selected) {
                return res.status(404).json({ error: `找不到對應城市: ${requestedCity}` });
            }

            return res.json({
                meta: buildForecastMeta(nowIso, partialSources, {
                    mode: 'city',
                    requestedCity,
                    resolvedCity: selected.city
                }),
                data: selected
            });
        }

        if (selectionMode === 'nearest') {
            const nearest = findNearestCounty(requestedLat, requestedLon);
            const selected = nearest ? findForecastByCity(formattedData, nearest.city) : null;
            if (!nearest || !selected) {
                return res.status(404).json({ error: '找不到最近城市資料' });
            }

            return res.json({
                meta: buildForecastMeta(nowIso, partialSources, {
                    mode: 'nearest',
                    requestedLat,
                    requestedLon,
                    resolvedCity: selected.city,
                    distanceKm: nearest.distanceKm
                }),
                data: selected
            });
        }

        res.json({
            meta: buildForecastMeta(nowIso, partialSources, { mode: 'list' }),
            data: formattedData
        });
    } catch (err) {
        console.error('Error:', err?.response?.data || err.message);
        res.status(500).json({ error: '伺服器發生問題' });
    }
}

async function get_tide_info(req, res) {
    try {
        if (!process.env.WeatherKEY) {
            return res.status(500).json({ error: 'WeatherKEY 尚未設定' });
        }

        const targetLocation = req.query.location || '花蓮';
        const { from, to } = buildTideTimeRange(7, 1);
        const tideForecasts = await fetchTideForecasts(targetLocation, from, to);
        if (!tideForecasts) {
            return res.status(404).json({ error: `找不到對應地點: ${targetLocation}` });
        }
        if (!Array.isArray(tideForecasts) || tideForecasts.length === 0) {
            return res.status(502).json({ error: '潮汐資料回傳為空' });
        }
        res.json({ TideData: flattenTideData(tideForecasts) });
    } catch (err) {
        console.error('Error:', err?.response?.data || err.message);
        res.status(500).json({ error: '伺服器發生問題' });
    }
}

async function get_tidy_tide_info(req, res) {
    try {
        if (!process.env.WeatherKEY) {
            return res.status(500).json({ error: 'WeatherKEY 尚未設定' });
        }

        const targetLocation = req.query.location || '花蓮';
        const rangeDays = Number.parseInt(req.query.days || '7', 10);
        const safeDays = Number.isFinite(rangeDays) ? Math.min(Math.max(rangeDays, 1), 30) : 7;
        const { from, to, now } = buildTideTimeRange(safeDays, 1);
        const [weatherData, locationMetaMap, marineStationsMeta, marineObs] = await Promise.all([
            fetchWeather36h(),
            buildLocationIdMap(),
            fetchMarineStations(),
            fetchMarineObservations()
        ]);
        const tideResolution = await resolveTideForecastQuery(targetLocation, from, to, locationMetaMap);

        if (!Array.isArray(tideResolution.forecasts) || tideResolution.forecasts.length === 0) {
            return res.status(404).json({ error: `找不到可用詳細資料: ${targetLocation}` });
        }

        const marineStations = buildMarineMap(marineStationsMeta, marineObs);
        const weatherMap = buildWeatherMap(weatherData);
        const normalizedLocations = buildTidyLocations(tideResolution.forecasts, locationMetaMap, weatherMap, marineStations, now);
        const selectedLocation = pickBestLocation(normalizedLocations, tideResolution.resolvedQuery || targetLocation);

        if (!selectedLocation) {
            return res.status(404).json({ error: `找不到可用資料: ${targetLocation}` });
        }

        const usedStationIds = new Set(
            [
                selectedLocation.marine?.source?.stationId,
                selectedLocation.marine?.sources?.wave?.stationId,
                selectedLocation.marine?.sources?.wind?.stationId,
                selectedLocation.marine?.sources?.sea?.stationId,
                selectedLocation.marine?.sources?.current?.stationId
            ].filter(Boolean)
        );
        const usedMarineStations = marineStations.filter((station) => usedStationIds.has(station.stationId));
        const nowIso = new Date().toISOString();

        res.json(
            buildTidyDetailResponse(
                targetLocation,
                from,
                to,
                selectedLocation,
                usedMarineStations,
                nowIso,
                {
                    requestedLocation: targetLocation,
                    resolvedLocation: selectedLocation.locationName,
                    fallbackUsed: tideResolution.fallbackUsed || false,
                    fallbackReason: tideResolution.fallbackReason || null,
                    resolutionSource: tideResolution.resolutionSource || 'requested_location',
                    resolvedSources: {
                        tide: tideResolution.resolutionSource || 'requested_location',
                        marine: selectedLocation.marine?.source?.stationId ? 'nearest_available_station' : 'unavailable'
                    }
                }
            )
        );
    } catch (err) {
        console.error('Error:', err?.response?.data || err.message);
        res.status(500).json({ error: '伺服器發生問題' });
    }
}

export default { get_36_hour_weather, get_tide_info, get_tidy_tide_info };
