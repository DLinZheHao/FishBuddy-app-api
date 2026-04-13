# Frontend Forecast Integration

## 串接規則 v1

### 首頁 `/forecast/36-hour`

首頁目前只應使用單城市模式，不使用列表模式。

#### 優先順序

1. 若已取得使用者定位：

```http
/forecast/36-hour?lat={lat}&lon={lon}
```

預期：
- `meta.selectionMode === "nearest"`
- `data` 是單筆 object

2. 若定位失敗或使用者拒絕授權：

不要打無參數 `/forecast/36-hour`，改打：

```http
/forecast/36-hour?city={lastSelectedCity || defaultCity}
```

預期：
- `meta.selectionMode === "city"`
- `data` 是單筆 object

3. 目前前端暫時不要使用：

```http
/forecast/36-hour
```

因為這會回列表 `data: []`，而目前沒有列表 UI。

#### 首頁前端規則

- 首頁只處理單筆資料
- 不要從列表中取第一筆當預設
- 建議保存：
  - `lastSelectedCity`
  - `locationPermissionGranted`
  - `autoLocationEnabled`

### 城市切換

使用者手動選城市時呼叫：

```http
/forecast/36-hour?city=新北市
```

規則：
- 成功後更新 `lastSelectedCity`
- 不要立刻被定位模式覆蓋，除非使用者主動點「回到目前位置」

### 詳細頁 `/forecast/tidy_info`

呼叫：

```http
/forecast/tidy_info?location={cityOrLocation}
```

#### 目前後端行為

- 如果該地點有資料：直接回
- 如果該地點沒有直接資料：後端自動 fallback 到最近可用地點
- 所以前端拿到 response 時，fallback 可能已經發生

#### 前端判斷欄位

看 `meta`：
- `requestedLocation`
- `resolvedLocation`
- `fallbackUsed`
- `fallbackReason`
- `resolvedSources`
- `nearestStation`

#### 詳細頁 UI 規則

- 若 `fallbackUsed === false`
  - 正常顯示
- 若 `fallbackUsed === true`
  - 顯示 toast 或 notice：
    - `目前地點資料不足，已改用最近可用地點資料`
  - 可加副標：
    - `requestedLocation -> resolvedLocation`
- 不需要再問使用者要不要切換，因為後端已經自動切好了
- 只有在 API 真正失敗時才顯示 error page

## 最新 Response 範例

### 1. `/forecast/36-hour?lat=25.03&lon=121.56`

這是單筆模式，`meta.selectionMode = "nearest"`。

```json
{
  "meta": {
    "updatedAt": "2026-04-13T06:17:43.752Z",
    "timezone": "Asia/Taipei",
    "sourceDatasets": [
      "F-C0032-001",
      "A-B0062-001",
      "A-B0063-001",
      "O-A0001-001",
      "O-A0002-001"
    ],
    "partialSources": {
      "sun": true,
      "moon": true,
      "landObservation": true,
      "rainObservation": true
    },
    "selectionMode": "nearest",
    "requestedCity": null,
    "requestedLat": 25.03,
    "requestedLon": 121.56,
    "resolvedCity": "臺北市",
    "distanceKm": 0.64
  },
  "data": {
    "city": "臺北市",
    "dateRange": {
      "from": "2026-04-13",
      "to": "2026-04-15"
    },
    "sun": {
      "sunrise": "05:28",
      "sunset": "18:16",
      "civilDawn": "05:04",
      "civilDusk": "18:40",
      "solarNoon": "11:52",
      "minutesToSunrise": null,
      "minutesToSunset": 119
    },
    "moon": {
      "moonrise": "01:56",
      "moonTransit": "07:01",
      "moonset": "12:10"
    },
    "currentObservation": {
      "station": {
        "weather": {
          "id": "466920",
          "name": "臺北",
          "countyName": "臺北市",
          "townName": "中正區",
          "observedAt": "2026-04-13T14:00:00+08:00"
        },
        "rain": {
          "id": "466920",
          "name": "臺北",
          "countyName": "臺北市",
          "townName": "中正區",
          "observedAt": "2026-04-13T14:10:00+08:00"
        }
      },
      "weatherText": "晴",
      "temperatureC": 27.4,
      "humidityPercent": 61,
      "windSpeedMs": 3.8,
      "windDirectionDeg": 120,
      "pressureHpa": 1008.6,
      "peakGustSpeedMs": 8.2,
      "dailyHighC": 29.1,
      "dailyLowC": 20.8,
      "rainNowMm": 0,
      "rainPast1hMm": 0,
      "rainPast3hMm": 0,
      "rainPast24hMm": 0
    },
    "summary": {
      "headline": "目前晴，短時降雨風險低",
      "bestWindow": {
        "startTime": "2026-04-13T18:00:00+08:00",
        "endTime": "2026-04-14T06:00:00+08:00",
        "score": 75,
        "reason": "降雨風險較低"
      }
    },
    "timeline": [
      {
        "startTime": "2026-04-13T18:00:00+08:00",
        "endTime": "2026-04-14T06:00:00+08:00",
        "weather": {
          "description": "多雲時晴",
          "detail": "舒適",
          "icon": "cloud.sun.fill"
        },
        "temperature": {
          "minC": 22,
          "maxC": 27,
          "avgC": 24.5
        },
        "rain": {
          "pop12hPercent": 10,
          "riskLevel": "low"
        },
        "comfort": {
          "text": "舒適",
          "level": "comfortable"
        },
        "derived": {
          "outdoorScore": 75,
          "isDaylight": false,
          "heatRisk": "low",
          "rainRisk": "low"
        }
      },
      {
        "startTime": "2026-04-14T06:00:00+08:00",
        "endTime": "2026-04-14T18:00:00+08:00",
        "weather": {
          "description": "晴時多雲",
          "detail": "舒適至悶熱",
          "icon": "cloud.sun.fill"
        },
        "temperature": {
          "minC": 22,
          "maxC": 31,
          "avgC": 26.5
        },
        "rain": {
          "pop12hPercent": 20,
          "riskLevel": "low"
        },
        "comfort": {
          "text": "舒適至悶熱",
          "level": "warm"
        },
        "derived": {
          "outdoorScore": 67,
          "isDaylight": null,
          "heatRisk": "moderate",
          "rainRisk": "low"
        }
      }
    ]
  }
}
```

### 2. `/forecast/36-hour`

這是列表模式，目前首頁先不要用。

```json
{
  "meta": {
    "updatedAt": "2026-04-13T06:17:43.436Z",
    "timezone": "Asia/Taipei",
    "sourceDatasets": [
      "F-C0032-001",
      "A-B0062-001",
      "A-B0063-001",
      "O-A0001-001",
      "O-A0002-001"
    ],
    "partialSources": {
      "sun": true,
      "moon": true,
      "landObservation": true,
      "rainObservation": true
    },
    "selectionMode": "list",
    "requestedCity": null,
    "requestedLat": null,
    "requestedLon": null,
    "resolvedCity": null,
    "distanceKm": null
  },
  "data": [
    {
      "city": "基隆市"
    },
    {
      "city": "臺北市"
    }
  ]
}
```

### 3. `/forecast/tidy_info?location=貢寮`

直接命中資料的情況。

```json
{
  "meta": {
    "updatedAt": "2026-04-13T06:17:59.904Z",
    "timezone": "Asia/Taipei",
    "sourceDatasets": [
      "cwa_weather_36h",
      "cwa_marine_station",
      "cwa_tide"
    ],
    "query": {
      "location": "貢寮",
      "from": "2026-04-13T14:17:59+08:00",
      "to": "2026-04-15T14:17:59+08:00"
    },
    "requestedLocation": "貢寮",
    "resolvedLocation": "新北市貢寮區",
    "fallbackUsed": false,
    "fallbackReason": null,
    "resolvedSources": {
      "tide": "requested_location",
      "marine": "nearest_available_station"
    },
    "nearestStation": {
      "id": "46694A",
      "name": "龍洞資料浮標",
      "distanceKm": 8.99
    },
    "units": {
      "temperature": "C",
      "waveHeight": "m",
      "wavePeriod": "s",
      "windSpeed": "m/s",
      "distance": "km",
      "tideHeight": "cm"
    }
  },
  "location": {
    "id": "65000260",
    "name": "新北市貢寮區",
    "city": "新北市",
    "latitude": 25.0217,
    "longitude": 121.95,
    "currentTime": "2026-04-13T06:17:59.904Z"
  },
  "ui": {
    "summary": {},
    "recommendation": {},
    "oceanConditions": {},
    "tide": {},
    "weather": {},
    "indicators": {}
  },
  "raw": {
    "marineStations": [],
    "weather36h": [],
    "tideDays": []
  }
}
```

### 4. `/forecast/tidy_info?location=臺北市`

發生 fallback 的情況，後端會直接回最近可用資料。

```json
{
  "meta": {
    "updatedAt": "2026-04-13T06:18:40.000Z",
    "timezone": "Asia/Taipei",
    "sourceDatasets": [
      "cwa_weather_36h",
      "cwa_marine_station",
      "cwa_tide"
    ],
    "query": {
      "location": "臺北市",
      "from": "2026-04-13T14:18:40+08:00",
      "to": "2026-04-15T14:18:40+08:00"
    },
    "requestedLocation": "臺北市",
    "resolvedLocation": "漁港大武崙",
    "fallbackUsed": true,
    "fallbackReason": "requested_location_has_no_direct_tide_data",
    "resolvedSources": {
      "tide": "nearest_available_location",
      "marine": "nearest_available_station"
    },
    "nearestStation": {
      "id": "OAC004",
      "name": "潮境浮標",
      "distanceKm": 10.38
    },
    "units": {
      "temperature": "C",
      "waveHeight": "m",
      "wavePeriod": "s",
      "windSpeed": "m/s",
      "distance": "km",
      "tideHeight": "cm"
    }
  },
  "location": {
    "id": "I02500",
    "name": "漁港大武崙",
    "city": "基隆市",
    "latitude": 25.167,
    "longitude": 121.708,
    "currentTime": "2026-04-13T06:18:40.000Z"
  },
  "ui": {
    "summary": {},
    "recommendation": {},
    "oceanConditions": {},
    "tide": {},
    "weather": {},
    "indicators": {}
  },
  "raw": {
    "marineStations": [],
    "weather36h": [],
    "tideDays": []
  }
}
```

## 給 Claude 的重點提醒

```text
Latest backend response rules:

1. `/forecast/36-hour?lat=...&lon=...`
   returns:
   - meta.selectionMode = "nearest"
   - data = single object

2. `/forecast/36-hour?city=...`
   returns:
   - meta.selectionMode = "city"
   - data = single object

3. `/forecast/36-hour`
   returns:
   - meta.selectionMode = "list"
   - data = array

4. `/forecast/tidy_info?location=...`
   may automatically fallback if direct data is unavailable.
   inspect:
   - meta.requestedLocation
   - meta.resolvedLocation
   - meta.fallbackUsed
   - meta.fallbackReason
   - meta.resolvedSources
   - meta.nearestStation

5. If meta.fallbackUsed is true, frontend should show a lightweight notice/toast, not an error page.
```
