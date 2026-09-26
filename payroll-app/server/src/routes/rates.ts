import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  validate,
  validateParams,
  idParamValidation,
  ratesValidation,
} from '../middleware/validate.js';
import { cacheMiddleware, userCacheKey } from '../utils/cache.js';
import { rateController } from '../controllers/rateController.js';

const router = express.Router();

const ratesCache = cacheMiddleware({
  keyGenerator: userCacheKey('rates'),
  ttl: 300,
});

router.use(authenticateToken);

router.get('/', ratesCache, rateController.getAll);
router.post('/', validate(ratesValidation), rateController.create);
router.put(
  '/:id',
  validateParams(idParamValidation),
  validate(ratesValidation),
  rateController.update,
);
router.delete('/:id', validateParams(idParamValidation), rateController.delete);

export default router;
