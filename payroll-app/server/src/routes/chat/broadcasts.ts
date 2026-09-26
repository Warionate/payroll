/**
 * Chat broadcasts - route definitions (delegates to controller)
 */
import express from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import {
  validate,
  validateParams,
  idParamValidation,
  broadcastValidation,
} from '../../middleware/validate.js';
import { broadcastLimiter } from './helpers.js';
import { broadcastController } from '../../controllers/broadcastController.js';

const router = express.Router();

router.get('/broadcasts', broadcastController.getAll);
router.post(
  '/broadcasts',
  requireAdmin,
  broadcastLimiter,
  validate(broadcastValidation),
  broadcastController.create,
);
router.delete(
  '/broadcasts/:id',
  requireAdmin,
  validateParams(idParamValidation),
  broadcastController.delete,
);
router.put(
  '/broadcasts/:id',
  requireAdmin,
  validateParams(idParamValidation),
  validate(broadcastValidation),
  broadcastController.update,
);
router.post(
  '/broadcasts/:id/read',
  validateParams(idParamValidation),
  broadcastController.markAsRead,
);
router.get(
  '/broadcasts/:id/readers',
  requireAdmin,
  validateParams(idParamValidation),
  broadcastController.getReaders,
);
router.get('/unread', broadcastController.getUnreadCounts);

export default router;
