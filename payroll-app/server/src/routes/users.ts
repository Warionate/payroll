import express from 'express';
import {
  authenticateToken,
  requireAdmin,
  requireRecentAuth,
  requireRecentAuthForOthers,
} from '../middleware/auth.js';
import {
  validate,
  validateParams,
  idParamValidation,
  updatePasswordValidation,
  updateProfileValidation,
  updateLoginIdValidation,
} from '../middleware/validate.js';
import { userController } from '../controllers/userController.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', requireAdmin, userController.getAll);
router.delete(
  '/:id',
  validateParams(idParamValidation),
  requireRecentAuthForOthers,
  userController.delete,
);
router.put(
  '/:id/profile',
  validateParams(idParamValidation),
  validate(updateProfileValidation),
  userController.updateProfile,
);
// ユーザー ID はログインに使うので、変えるときは本人確認を求める。
// 文字種のルールより前の ID の人は、最初の設定でここを通る（/api/users はゲートの対象なので例外にする）
router.put(
  '/:id/login-id',
  validateParams(idParamValidation),
  requireRecentAuth,
  validate(updateLoginIdValidation),
  userController.updateLoginId,
);
router.put(
  '/:id/password',
  validateParams(idParamValidation),
  requireRecentAuthForOthers,
  validate(updatePasswordValidation),
  userController.updatePassword,
);
router.put(
  '/:id/role',
  validateParams(idParamValidation),
  requireAdmin,
  requireRecentAuth,
  userController.updateRole,
);
// 二段階認証のリセット（端末も回復コードも失くした人向け）。管理者だけ・本人確認つき
router.post(
  '/:id/mfa/reset',
  validateParams(idParamValidation),
  requireAdmin,
  requireRecentAuth,
  userController.resetMfa,
);

export default router;
