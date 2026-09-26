import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { cacheMiddleware } from '../utils/cache.js';
import {
  validate,
  validateParams,
  patternValidation,
  patternUpdateValidation,
  patternArchiveValidation,
  slotValidation,
  slotUpdateValidation,
  bulkSlotValidation,
  patternAssignmentValidation,
  idParamValidation,
  applyFixedShiftsValidation,
} from '../middleware/validate.js';
import {
  patternController,
  slotController,
  patternAssignmentController,
  applyFixedShiftsController,
} from '../controllers/scheduleController.js';

const router = express.Router();

const patternsCache = cacheMiddleware({
  keyGenerator: () => 'patterns:all',
  ttl: 600,
});

router.use(authenticateToken);

// --- Schedule Patterns (admin-only mutations) ---
router.get('/patterns', patternsCache, patternController.getAll);
router.post('/patterns', requireAdmin, validate(patternValidation), patternController.create);
router.put(
  '/patterns/:id',
  requireAdmin,
  validateParams(idParamValidation),
  validate(patternUpdateValidation),
  patternController.update,
);
router.patch(
  '/patterns/:id/archive',
  requireAdmin,
  validateParams(idParamValidation),
  validate(patternArchiveValidation),
  patternController.setArchived,
);
router.delete(
  '/patterns/:id',
  requireAdmin,
  validateParams(idParamValidation),
  patternController.delete,
);

// --- Schedule Slots (admin-only) ---
router.post('/slots', requireAdmin, validate(slotValidation), slotController.create);
router.put(
  '/slots/:id',
  requireAdmin,
  validateParams(idParamValidation),
  validate(slotUpdateValidation),
  slotController.update,
);
router.post('/slots/bulk', requireAdmin, validate(bulkSlotValidation), slotController.bulkCreate);
router.delete('/slots/:id', requireAdmin, validateParams(idParamValidation), slotController.delete);

// --- Pattern Assignments ---
router.get('/pattern_assignments', patternAssignmentController.getAll);
router.post(
  '/pattern_assignments',
  validate(patternAssignmentValidation),
  patternAssignmentController.create,
);
router.delete(
  '/pattern_assignments/:id',
  validateParams(idParamValidation),
  patternAssignmentController.delete,
);

// --- Bulk Apply Fixed Shifts ---
router.post(
  '/apply_fixed_shifts',
  validate(applyFixedShiftsValidation),
  applyFixedShiftsController.apply,
);

export default router;
