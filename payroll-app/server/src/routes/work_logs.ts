import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  validate,
  validateParams,
  validateQuery,
  idParamValidation,
  workLogValidation,
  workLogQueryValidation,
  workLogStatusValidation,
  workLogBulkSaveValidation,
  workLogCompleteAllValidation,
} from '../middleware/validate.js';
import { workLogController } from '../controllers/workLogController.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', validateQuery(workLogQueryValidation), workLogController.getAll);
router.post('/', validate(workLogValidation), workLogController.create);
router.put(
  '/:id',
  validateParams(idParamValidation),
  validate(workLogValidation),
  workLogController.update,
);
router.delete('/:id', validateParams(idParamValidation), workLogController.delete);
router.patch(
  '/:id/status',
  validateParams(idParamValidation),
  validate(workLogStatusValidation),
  workLogController.updateStatus,
);
router.post('/bulk_save', validate(workLogBulkSaveValidation), workLogController.bulkSave);
router.post('/complete_all', validate(workLogCompleteAllValidation), workLogController.completeAll);

export default router;
