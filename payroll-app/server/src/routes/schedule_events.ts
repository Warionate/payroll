/**
 * Schedule Events routes - 塾内予定 (講師フォーラム、休講など)
 */
import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import {
  validate,
  validateParams,
  idParamValidation,
  scheduleEventValidation,
} from '../middleware/validate.js';
import { scheduleEventController } from '../controllers/scheduleEventController.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', scheduleEventController.getAll);
router.post('/', requireAdmin, validate(scheduleEventValidation), scheduleEventController.create);
router.put(
  '/:id',
  requireAdmin,
  validateParams(idParamValidation),
  validate(scheduleEventValidation),
  scheduleEventController.update,
);
router.delete(
  '/:id',
  requireAdmin,
  validateParams(idParamValidation),
  scheduleEventController.delete,
);

export default router;
