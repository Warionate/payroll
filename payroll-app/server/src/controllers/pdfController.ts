/**
 * PDF Controller - salary PDF generation
 */
import type { Request, Response } from 'express';
import { pdfService } from '../services/pdfService.js';
import logger from '../utils/logger.js';

export const pdfController = {
  async generateSalaryPdf(req: Request, res: Response) {
    const year = parseInt(req.params.year as string, 10);
    const month = parseInt(req.params.month as string, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12 || year < 2000 || year > 2100) {
      res.status(400).json({ error: '無効な年月パラメータです' });
      return;
    }

    const userId = req.user!.id;

    try {
      const pdfBytes = await pdfService.generateSalaryPdf(userId, year, month);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=salary_${year}${String(month).padStart(2, '0')}.pdf`,
      );
      res.send(pdfBytes);
    } catch (err) {
      const error = err as Error;
      logger.error('PDF generation failed', { error: error.message, stack: error.stack });
      res.status(500).json({ error: 'PDF生成に失敗しました' });
    }
  },
};
