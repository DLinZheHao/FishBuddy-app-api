import 'dotenv/config';
import fs from 'fs';
let count = 0

async function get_hotel_list(req, res) {
    try {
        if (count > 1) {
            res.status(500).json({error: '伺服器發生問題'});
        } else {
            const rawData = fs.readFileSync("fakeData/pkgHotelEnd.json");
            const data = JSON.parse(rawData);
            
            res.status(200).json(data);
        }
        count++; 
        // 隨機延遲時間 (1 到 3 秒)
        // const delay = Math.floor(Math.random() * 5000) + 3000; // 1 到 3 秒
        // const delay = 1000
        // // 模擬延遲
        // setTimeout(() => {
        //     // 模擬載入失敗
        //     if (count == 5) {
        //         count++;
        //         res.status(500).json({error: '模擬呼叫失敗'});
        //     // 只跑 7 次呼叫
        //     } else if ( count == 0 || count == 1 || count == 2) {
        //         const rawData = fs.readFileSync("fakeData/pkgHotelResult.json");
        //         const data = JSON.parse(rawData);
        //         count++; 
        //         res.status(200).json(data);
        //     } else if (count > 2 && count < 8) {
        //         const rawData = fs.readFileSync("fakeData/pkgHotel.json");
        //         const data = JSON.parse(rawData);
        //         count++; 
        //         res.status(200).json(data);
        //     } else {
        //         const rawData = fs.readFileSync("fakeData/pkgHotelEnd.json");
        //         const data = JSON.parse(rawData);
        //         count = 0
        //         res.status(200).json(data);
        //     }
        // }, delay); // 模擬延遲

    } catch (err) {
        console.log('Error:', err);
        res.status(500).json({error: '伺服器發生問題'});
    }
}

export default { get_hotel_list };