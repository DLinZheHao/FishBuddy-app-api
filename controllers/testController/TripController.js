import 'dotenv/config';
import fs from 'fs';

async function get_plan(req, res) {
    try {
        const rawData = fs.readFileSync("fakeData/tripFake.json");
        const data = JSON.parse(rawData);
        count = 0
        res.status(200).json(data);
    } catch (err) {
        console.log('Error:', err);
        res.status(500).json({ error: '伺服器發生問題' });
    }
}

export default { get_plan };