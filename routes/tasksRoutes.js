import express from 'express';
import taskController from '../controllers/testController/TaskController.js';

const router = express.Router();

router
  .route('/tasks')
  .get(taskController.get_all_task)
  .post(taskController.post_new_task)

router
  .route("/tasks/info")
  .get(taskController.get_new_task_Info)
  .post(taskController.post_new_task_Info); // 新增額外的任務資訊

router
  .route('/tasks/:id')
  .get(taskController.get_target_task)
  .put(taskController.put_target_task)
  .delete(taskController.delete_tartget_task)
  
export default router;
