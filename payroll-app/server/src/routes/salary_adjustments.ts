import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  validate,
  validateParams,
  idParamValidation,
  salaryAdjustmentValidation,
} from '../middleware/validate.js';
import { salaryAdjustmentController } from '../controllers/salaryAdjustmentController.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', salaryAdjustmentController.getAll);
router.post('/', validate(salaryAdjustmentValidation), salaryAdjustmentController.create);
router.put(
  '/:id',
  validateParams(idParamValidation),
  validate(salaryAdjustmentValidation),
  salaryAdjustmentController.update,
);
router.delete('/:id', validateParams(idParamValidation), salaryAdjustmentController.delete);

export default router;
