const { parse } = require("dotenv")
const DBController = require('../controllers/DBController');

/// 模擬資料庫資料
let tasks = [
    { id: 1, name: "Learn Node.js", completed: false },
    { id: 2, name: "Build an API", completed: false }
  ]
  
// 獲取全部任務
exports.get_all_task = (req, res) => {
    res.status(200).json(tasks)
}

// 獲取指定的任務
exports.get_target_task = (req, res) => {
    let target_task = tasks.find( task => parseInt(req.params.id) === task.id )
    if (!target_task) {
        return res.status(404).json({ message: 'Task 沒有被搜尋到' })
    } 
    res.status(200).json(target_task)
}

// 上傳新的任務
exports.post_new_task = (req, res) => {
    console.log('Received request body:', req.body)
    const { name, completed } = req.body
    if (typeof name !== 'string' || typeof completed !== 'boolean') {
        return res.status(400).json({ message: '無效的任務資料'})
    } 

    const new_task = {
        id: tasks.length + 1,
        name: name,
        completed: completed
    }
    tasks.push(new_task)

    res.status(200).json(new_task)
}

// 更新指定任務資料
exports.put_target_task = (req, res) => {
    const task = tasks.find( task => task.id === parseInt(req.params.id) )
    if (!task) {
        return res.status(404).json({ message: 'Task 沒有被搜尋到' })
    }

    const { name, completed } = req.body
    if (typeof name !== 'string' || typeof completed !== 'boolean') {
        return res.status(400).json({ message: '無效的 Task 資料'})
    } 

    task.name = name
    task.completed = completed
    res.json(task)
}

// 刪除特定任務 (DELETE /tasks/:id)
exports.delete_tartget_task = (req, res) => {
    const taskIndex = tasks.findIndex(t => t.id === parseInt(req.params.id));
    if (taskIndex === -1) {
      return res.status(404).json({ message: "Task not found" });
    }
  
    tasks.splice(taskIndex, 1);
    res.status(204).send();
  }

// 上傳新的資料，並且回傳目前所有的任務
exports.post_new_task_Info = async (req, res) => {
    try {
      // 建立表格（如果還沒建立）
      await DBController.createTable();
  
      // 從請求中獲取資料
      const { title, description, completed } = req.body;
  
      // 插入新任務
      const taskId = await DBController.insertTask(title, description, completed);
  
      // 查詢所有任務
      const tasks = await DBController.getAllTasks();
  
      res.status(200).json({
        message: 'Task added successfully',
        taskId: taskId,
        tasks: tasks,
      });
    } catch (error) {
      console.error('Error:', error);
      if (error.type === 'DUPLICATE_TITLE') {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    }
  };

exports.get_new_task_Info = async (req, res) => {
    try {
        // 建立表格（如果還沒建立）
        await DBController.createTable();
        const task = await DBController.getTask(req.body.id)
        console.log("結果：", task)
        res.status(200).json({
            message: '搜尋成功',
            task: task
        })
    } catch(err) {
        console.log('Error:', err)
        res.status(500).json({error: '伺服器發生問題'})
    }
};