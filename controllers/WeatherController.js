import 'dotenv/config';
import axios from 'axios';
import LocationService from '../utils/LocationService.js';

const locationService = new LocationService('Data/location.json');  // 傳入檔案路徑

// 獲取未來 36 小時的全台天氣狀況
async function get_36_hour_weather(req, res) {
    try {
        const API_URL = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=${process.env.WeatherKEY}`;

        // 使用 axios 呼叫 API
        const response = await axios.get(API_URL);

        // 整理需要的資料
        const formattedData = response.data.records.location.map(location => ({
            city: location.locationName,
            weather: location.weatherElement[0].time.map((t, index) => ({
                startTime: t.startTime,
                endTime: t.endTime,
                description: t.parameter.parameterName,  // 天氣描述
                minTemp: location.weatherElement[2].time[index].parameter.parameterName, // 最低溫
                maxTemp: location.weatherElement[4].time[index].parameter.parameterName, // 最高溫
                comfort: location.weatherElement[3].time[index].parameter.parameterName  // 舒適度描述
            }))
        }));

        res.json({ data: formattedData });

    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "伺服器發生問題" });
    }
}

// 台灣未來一個月潮汐狀況
async function get_tide_info(req, res) {
    try {
        const API_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-A0021-001";
        const apiKey = process.env.WeatherKEY; // 你的 API 金鑰
        
        // 設定地點（可以從請求參數獲取）
        const targetLocation = req.query.location || "花蓮"; // 預設花蓮
        
        // 設定日期範圍
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);
        
        // 轉換成 API 需要的格式（yyyy-MM-ddThh:mm:ss）
        const timeFrom = today.toISOString().split(".")[0]; // 去掉毫秒部分
        const timeTo = nextWeek.toISOString().split(".")[0];

        // 正確的寫法，使用 await 等待返回的結果
        try {
            const locations = await locationService.findLocationsByName(targetLocation);

            // 發送 API 請求，確保只有在取得 locations 後才發送
            const response = await axios.get(API_URL, {
                params: {
                    Authorization: req.query.Authorization,
                    timeFrom: timeFrom,
                    timeTo: timeTo,
                    LocationName: locations
                }
            });

        // 解析 API 回應
        const tideForecasts = response.data.records.TideForecasts

        // 把資料攤平
        const TideData = tideForecasts.map(forecast => {
            const location = forecast.Location;
            const timePeriods = location.TimePeriods.Daily.map(timePeriod => ({
                LocationName: location.LocationName,
                Latitude: location.Latitude,
                Longitude: location.Longitude,
                TimePeriods: timePeriod                
            }));
            return timePeriods;
          });

        res.json({ TideData });
        } catch (error) {
            console.error("出錯了:", error);
            res.status(500).json({ error: "伺服器發生問題" });
        }

    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "伺服器發生問題" });
    }
}


export default { get_36_hour_weather, get_tide_info };