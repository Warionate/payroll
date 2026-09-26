/**
 * Calendar Controller - iCal feed generation
 */
import type { Request, Response, NextFunction } from 'express';
import { calendarService, InvalidTokenError } from '../services/calendarService.js';

export const calendarController = {
  getFeed(req: Request, res: Response, next: NextFunction) {
    const token = req.params.token as string;

    try {
      const calendarString = calendarService.generateFeed(token);

      res.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="calendar.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });
      res.end(calendarString);
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        res.status(404).send('Invalid token');
        return;
      }
      next(err);
    }
  },
};
