import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import {
  validate,
  validateParams,
  idParamValidation,
  updatePasswordValidation,
  updateProfileValidation,
} from '../middleware/validate.js';
import { userController } from '../controllers/userController.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', requireAdmin, userController.getAll);
router.delete('/:id', validateParams(idParamValidation), userController.delete);
router.put(
  '/:id/profile',
  validateParams(idParamValidation),
  validate(updateProfileValidation),
  userController.updateProfile,
);
router.put(
  '/:id/password',
  validateParams(idParamValidation),
  validate(updatePasswordValidation),
  userController.updatePassword,
);
router.put('/:id/role', validateParams(idParamValidation), requireAdmin, userController.updateRole);

export default router;
