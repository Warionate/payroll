/**
 * Calendar - route definitions (delegates to controller)
 */
import express from 'express';
import { calendarController } from '../controllers/calendarController.js';

const router = express.Router();

router.get(['/:token/feed.ics', '/:token/:ignore/feed.ics'], calendarController.getFeed);

export default router;
