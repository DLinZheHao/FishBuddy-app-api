import 'dotenv/config';
import fs from 'fs';

async function upcoming_1(req, res) {
    try {
        const rawData = fs.readFileSync("fakeData/MemberOrder/upcomingOrder.json");
        const data = JSON.parse(rawData);
        count = 0
        res.status(200).json(data);
    } catch (err) {
        console.log('Error:', err);
        res.status(500).json({ error: '伺服器發生問題' });
    }
}

// https://mweb-t01.eztravel.com.tw/api/6/order/member/upcoming/1

export default { upcoming_1 };