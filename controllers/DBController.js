import sqlite3 from 'sqlite3';
const _sqlite3 = sqlite3.verbose();
const { Database } = _sqlite3;

class CustomError extends Error {
    constructor(message, type) {
      super(message);
      this.type = type;
      this.name = this.constructor.name; // 設置錯誤名稱為自訂的類名
    }
  }

// 開啟或創建 SQLite 資料庫
const db = new Database('./taskDB.sqlite', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// **建立資料表（確保表存在）**
const createTable = () => {
  const sql = `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    completed BOOL
  )`;

  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// **插入新任務**
const insertTask = async (title, description, completed) => {
    try {
      // 先檢查是否有重複的 title
      const existingTask = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE title = ?', [title], (err, row) => {
          if (err) reject(err);
          else resolve(row); // 如果有找到資料，則返回該行
        });
      });
  
      if (existingTask) {
        // 如果找到重複的 title，返回錯誤
        throw new CustomError('上傳錯誤：已經存在相同 title 任務', 'DUPLICATE_TITLE');
      }
  
      // 如果沒有重複，插入新資料
      return new Promise((resolve, reject) => {
        const stmt = db.prepare('INSERT INTO users (title, description, completed) VALUES (?, ?, ?)');
        stmt.run(title, description, completed, function (err) {
          if (err) reject(err);
          else resolve(this.lastID); // 回傳新插入的 ID
        });
        stmt.finalize();
      });
    } catch (err) {
      console.error('Error:', err);
      throw err; // 抛出錯誤
    }
  };

// **查詢所有任務**
const getAllTasks = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM users', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// 搜尋指定任務資訊
const getTask = async (id) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
            if (err) {
                reject(err);
            } else {
                console.log("資料庫結果", row)
                resolve(row);
            }
        });
    });
};

// **關閉資料庫**
const closeDatabase = () => {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// **導出模組**
export { createTable, insertTask, getAllTasks, closeDatabase, getTask };
export default { createTable, insertTask, getAllTasks, closeDatabase, getTask };