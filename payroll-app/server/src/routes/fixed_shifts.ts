import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { validateParams, idParamValidation } from '../middleware/validate.js';
import { fixedShiftController } from '../controllers/fixedShiftController.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', fixedShiftController.getAll);
router.post('/', fixedShiftController.create);
router.put('/bulk', fixedShiftController.bulkReplace);
router.delete('/:id', validateParams(idParamValidation), fixedShiftController.delete);

export default router;
