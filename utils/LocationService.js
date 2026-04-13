import fs from 'fs';

class LocationService {
    constructor(filePath) {
        this.filePath = filePath;
    }

    async getAllLocations() {
        const raw = await fs.promises.readFile(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.location) ? parsed.location : [];
    }


    /// 讀取 json 檔案中的所有地點，找到對應的地點名稱
    findLocationsByName(query) {
        return new Promise((resolve, reject) => {
            fs.readFile(this.filePath, 'utf8', (err, data) => {
                if (err) {
                    reject(`讀取 JSON 檔案失敗: ${err}`);
                    return;
                }

                try {
                    const locations = JSON.parse(data);
                    const results = locations.location
                        .filter(loc => loc.locationName.includes(query))  // 只篩選符合條件的
                        .map(loc => loc.locationName);  // 只回傳 locationName
                    
                    resolve(results.join(","));
                } catch (parseError) {
                    reject(`解析 JSON 失敗: ${parseError}`);
                }
            });
        });
    }
}

// 匯出 LocationService 類別
export default LocationService;
