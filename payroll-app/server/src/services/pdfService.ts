/**
 * PDF Service - salary PDF generation
 */
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import logger from '../utils/logger.js';
import { decrypt } from '../utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FONT_PATH = path.join(__dirname, '..', '..', 'fonts', 'NotoSansJP-Regular.ttf');

let cachedFontBytes: Buffer | null = null;
const loadFont = (): Buffer => {
  if (!cachedFontBytes) {
    const loadStartTime = Date.now();
    cachedFontBytes = fs.readFileSync(FONT_PATH);
    logger.info('Font cached', {
      size: `${(cachedFontBytes.length / 1024 / 1024).toFixed(1)}MB`,
      loadTime: `${Date.now() - loadStartTime}ms`,
    });
  }
  return cachedFontBytes;
};

import {
  ADJUSTMENT_TYPE_LABELS,
  SALARY_PERIOD_START_DAY,
  SALARY_PERIOD_END_DAY,
} from '@payroll/shared/constants/salary';

interface RateRow {
  start_date: string;
  wage_1_student: string;
  wage_2_students: string;
  wage_3_students: string;
  wage_4_students: string;
  hourly_wage: string;
  allowance_day: string;
  allowance_gap: string;
}

interface DecryptedRate {
  start_date: string;
  wage_1_student: number;
  wage_2_students: number;
  wage_3_students: number;
  wage_4_students: number;
  hourly_wage: number;
  allowance_day: number;
  allowance_gap: number;
}

interface WorkLogRow {
  date: string;
  work_type: string;
  student_count: string;
  duration_minutes: string;
  note: string;
  schedule_slot_id: number | null;
  period_name: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface DecryptedLog {
  date: string;
  work_type: string;
  student_count: number;
  duration_minutes: number;
  note: string;
  schedule_slot_id: number | null;
  period_name: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface AdjustmentRow {
  adjustment_type: string;
  amount: number;
  note: string | null;
}

interface SalarySummary {
  classes: Record<number, { count: number; amount: number }>;
  hourly: { count: number; amount: number };
  allowance: { count: number; amount: number };
  total: number;
  totalClasses: number;
}

const getRateForDate = (dateStr: string, rates: DecryptedRate[]): DecryptedRate | undefined => {
  return rates.find((r) => r.start_date <= dateStr) || rates[rates.length - 1];
};

const formatDateJP = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
};

const getLastDayOfMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate();
};

const formatCurrency = (num: number): string => `¥${(num || 0).toLocaleString()}`;

/**
 * Calculate salary data for a user and month.
 * Extracted for testability.
 */
function calculateSalary(
  year: number,
  month: number,
  decryptedLogs: DecryptedLog[],
  rates: DecryptedRate[],
  adjustments: AdjustmentRow[],
) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const classStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${SALARY_PERIOD_START_DAY}`;
  const classEndDate = `${year}-${String(month).padStart(2, '0')}-${SALARY_PERIOD_END_DAY}`;
  const hourlyStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const lastDay = getLastDayOfMonth(prevYear, prevMonth);
  const hourlyEndDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${lastDay}`;

  const summary: SalarySummary = {
    classes: {},
    hourly: { count: 0, amount: 0 },
    allowance: { count: 0, amount: 0 },
    total: 0,
    totalClasses: 0,
  };
  const dailyClassCount: Record<string, { count: number; rate: DecryptedRate }> = {};
  const classWorkDays = new Set<string>();

  decryptedLogs.forEach((log) => {
    const rate = getRateForDate(log.date, rates);
    if (!rate) return;

    if (log.work_type === 'class' && log.date >= classStartDate && log.date <= classEndDate) {
      const count = log.student_count || 1;
      let wage = 0;
      if (count === 1) wage = rate.wage_1_student;
      else if (count === 2) wage = rate.wage_2_students;
      else if (count === 3) wage = rate.wage_3_students;
      else if (count >= 4) wage = rate.wage_4_students;

      if (!summary.classes[count]) summary.classes[count] = { count: 0, amount: 0 };
      summary.classes[count].count += 1;
      summary.classes[count].amount += wage;
      summary.total += wage;
      summary.totalClasses += 1;
      classWorkDays.add(log.date);

      if (!dailyClassCount[log.date]) dailyClassCount[log.date] = { count: 0, rate };
      dailyClassCount[log.date].count++;
    }

    if (log.work_type === 'hourly' && log.date >= hourlyStartDate && log.date <= hourlyEndDate) {
      const wage = Math.ceil((log.duration_minutes / 60) * rate.hourly_wage);
      summary.hourly.count += log.duration_minutes;
      summary.hourly.amount += wage;
      summary.total += wage;
    }
  });

  // Allowances
  Object.values(dailyClassCount).forEach(({ count, rate }) => {
    if (count > 0) {
      let allowance = rate.allowance_day || 0;
      if (count > 1) allowance += (count - 1) * (rate.allowance_gap || 0);
      summary.allowance.amount += allowance;
      summary.total += allowance;
    }
  });

  const adjustmentTotal = adjustments.reduce((sum, adj) => sum + adj.amount, 0);
  const finalTotal = summary.total + adjustmentTotal;
  const classWorkDayCount = classWorkDays.size;

  return {
    summary,
    adjustmentTotal,
    finalTotal,
    classWorkDayCount,
    classStartDate,
    classEndDate,
    hourlyStartDate,
    hourlyEndDate,
  };
}

export const pdfService = {
  async generateSalaryPdf(userId: number, year: number, month: number): Promise<Buffer> {
    const startTime = Date.now();

    // Calculate date ranges
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const classStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${SALARY_PERIOD_START_DAY}`;
    const classEndDate = `${year}-${String(month).padStart(2, '0')}-${SALARY_PERIOD_END_DAY}`;
    const hourlyStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    const lastDay = getLastDayOfMonth(prevYear, prevMonth);
    const hourlyEndDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${lastDay}`;

    // Fetch data
    const user = db
      .prepare('SELECT coalesce(display_name, username) AS name FROM users WHERE id = ?')
      .get(userId) as { name: string } | undefined;
    const username = user?.name || '不明';

    const minDate = classStartDate < hourlyStartDate ? classStartDate : hourlyStartDate;
    const maxDate = classEndDate > hourlyEndDate ? classEndDate : hourlyEndDate;

    const logs = db
      .prepare(
        `SELECT wl.*, ss.period_name, ss.start_time, ss.end_time
         FROM work_logs wl
         LEFT JOIN schedule_slots ss ON wl.schedule_slot_id = ss.id
         WHERE wl.user_id = ? AND wl.date BETWEEN ? AND ?
         ORDER BY wl.date ASC`,
      )
      .all(userId, minDate, maxDate) as WorkLogRow[];

    const decryptedLogs: DecryptedLog[] = logs.map((log) => ({
      ...log,
      student_count: parseInt(decrypt(log.student_count) ?? '0', 10) || 0,
      duration_minutes: parseInt(decrypt(log.duration_minutes) ?? '0', 10) || 0,
      note: decrypt(log.note) ?? '',
    }));

    const rawRates = db
      .prepare('SELECT * FROM rates WHERE user_id = ? ORDER BY start_date DESC')
      .all(userId) as RateRow[];

    const rates: DecryptedRate[] = rawRates.map((rate) => ({
      ...rate,
      wage_1_student: parseInt(decrypt(rate.wage_1_student) ?? '0', 10) || 0,
      wage_2_students: parseInt(decrypt(rate.wage_2_students) ?? '0', 10) || 0,
      wage_3_students: parseInt(decrypt(rate.wage_3_students) ?? '0', 10) || 0,
      wage_4_students: parseInt(decrypt(rate.wage_4_students) ?? '0', 10) || 0,
      hourly_wage: parseInt(decrypt(rate.hourly_wage) ?? '0', 10) || 0,
      allowance_day: parseInt(decrypt(rate.allowance_day) ?? '0', 10) || 0,
      allowance_gap: parseInt(decrypt(rate.allowance_gap) ?? '0', 10) || 0,
    }));

    const adjustments = db
      .prepare('SELECT * FROM salary_adjustments WHERE user_id = ? AND year_month = ?')
      .all(userId, `${year}-${String(month).padStart(2, '0')}`) as AdjustmentRow[];

    // Calculate salary
    const calc = calculateSalary(year, month, decryptedLogs, rates, adjustments);

    // Collect all texts for font subsetting
    const issueDate = new Date().toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const allTexts: string[] = [
      '給 与 明 細 書',
      `${year}年${month}月分`,
      '氏名',
      username,
      '発行日',
      issueDate,
      '稼働日数',
      `${calc.classWorkDayCount}日`,
      '【集計期間】',
      '授業給・手当',
      `${formatDateJP(calc.classStartDate)} ～ ${formatDateJP(calc.classEndDate)}`,
      '規定外給',
      `${formatDateJP(calc.hourlyStartDate)} ～ ${formatDateJP(calc.hourlyEndDate)}`,
      '項目',
      '内訳',
      '金額',
      '総支給額',
      formatCurrency(calc.finalTotal),
      'この明細書は給与計算システムにより発行されました',
    ];

    Object.entries(calc.summary.classes).forEach(([count, data]) => {
      allTexts.push(`授業給（1:${count}）`, `${data.count}コマ`, formatCurrency(data.amount));
    });

    if (calc.summary.hourly.count > 0) {
      const hours = Math.floor(calc.summary.hourly.count / 60);
      const mins = calc.summary.hourly.count % 60;
      allTexts.push(
        '規定外給',
        `${hours}時間${mins > 0 ? mins + '分' : ''}`,
        formatCurrency(calc.summary.hourly.amount),
      );
    }

    if (calc.summary.allowance.amount > 0) {
      allTexts.push('手当', '-', formatCurrency(calc.summary.allowance.amount));
    }

    adjustments.forEach((adj) => {
      const label = ADJUSTMENT_TYPE_LABELS[adj.adjustment_type] || '調整';
      const sign = adj.amount >= 0 ? '+' : '';
      allTexts.push(label, adj.note || '-', `${sign}${formatCurrency(adj.amount)}`);
    });

    // Subset font
    const uniqueChars = [...new Set(allTexts.join(''))].join('');
    const subsetFont = (await import('subset-font')).default;
    const fontBytes = loadFont();
    const subsetFontBytes = await subsetFont(Buffer.from(fontBytes), uniqueChars, {
      targetFormat: 'sfnt',
    });

    logger.info('Font subsetted', {
      originalSize: `${(fontBytes.length / 1024).toFixed(0)}KB`,
      subsetSize: `${(subsetFontBytes.length / 1024).toFixed(0)}KB`,
      chars: uniqueChars.length,
    });

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(subsetFontBytes, { subset: false });

    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    const fontSize = 10;
    const smallSize = 9;
    const titleSize = 16;
    const margin = 50;
    let y = height - margin;

    const drawLine = (x1: number, y1: number, x2: number, y2: number, thickness = 0.5) => {
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness,
        color: rgb(0, 0, 0),
      });
    };
    const textWidth = (text: string, size = fontSize) => font.widthOfTextAtSize(text, size);

    // Header
    const title = '給 与 明 細 書';
    page.drawText(title, {
      x: (width - textWidth(title, titleSize)) / 2,
      y,
      size: titleSize,
      font,
    });
    y -= 35;

    const monthLabel = `${year}年${month}月分`;
    page.drawText(monthLabel, { x: (width - textWidth(monthLabel, 14)) / 2, y, size: 14, font });
    y -= 40;

    // Basic info
    const col1 = margin;
    const col2 = 140;
    const col3 = 300;
    const col4 = 390;

    page.drawText('氏名', { x: col1, y, size: smallSize, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(username, { x: col2, y, size: fontSize, font });
    page.drawText('発行日', { x: col3, y, size: smallSize, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(issueDate, { x: col4, y, size: fontSize, font });
    y -= 20;

    page.drawText('稼働日数', { x: col1, y, size: smallSize, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(`${calc.classWorkDayCount}日`, { x: col2, y, size: fontSize, font });
    y -= 25;

    drawLine(margin, y, width - margin, y, 1);
    y -= 20;

    // Period info
    page.drawText('【集計期間】', {
      x: margin,
      y,
      size: smallSize,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 16;
    page.drawText('授業給・手当', {
      x: margin + 10,
      y,
      size: smallSize,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(`${formatDateJP(calc.classStartDate)} ～ ${formatDateJP(calc.classEndDate)}`, {
      x: 130,
      y,
      size: smallSize,
      font,
    });
    y -= 14;
    page.drawText('規定外給', {
      x: margin + 10,
      y,
      size: smallSize,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(`${formatDateJP(calc.hourlyStartDate)} ～ ${formatDateJP(calc.hourlyEndDate)}`, {
      x: 130,
      y,
      size: smallSize,
      font,
    });
    y -= 25;
    drawLine(margin, y, width - margin, y, 0.5);
    y -= 20;

    // Table header
    const tableLeft = margin;
    const tableRight = width - margin;
    const colItem = tableLeft;
    const colDetail = 250;

    page.drawText('項目', { x: colItem, y, size: smallSize, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawText('内訳', { x: colDetail, y, size: smallSize, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawText('金額', { x: 450, y, size: smallSize, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 8;
    drawLine(tableLeft, y, tableRight, y, 0.5);
    y -= 18;

    // Classes
    Object.entries(calc.summary.classes)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .forEach(([count, data]) => {
        page.drawText(`授業給（1:${count}）`, { x: colItem, y, size: fontSize, font });
        page.drawText(`${data.count}コマ`, { x: colDetail, y, size: fontSize, font });
        const amountText = formatCurrency(data.amount);
        page.drawText(amountText, {
          x: tableRight - textWidth(amountText),
          y,
          size: fontSize,
          font,
        });
        y -= 20;
      });

    // Hourly
    if (calc.summary.hourly.count > 0) {
      const hours = Math.floor(calc.summary.hourly.count / 60);
      const mins = calc.summary.hourly.count % 60;
      page.drawText('規定外給', { x: colItem, y, size: fontSize, font });
      page.drawText(`${hours}時間${mins > 0 ? mins + '分' : ''}`, {
        x: colDetail,
        y,
        size: fontSize,
        font,
      });
      const amountText = formatCurrency(calc.summary.hourly.amount);
      page.drawText(amountText, { x: tableRight - textWidth(amountText), y, size: fontSize, font });
      y -= 20;
    }

    // Allowance
    if (calc.summary.allowance.amount > 0) {
      page.drawText('手当', { x: colItem, y, size: fontSize, font });
      page.drawText('-', { x: colDetail, y, size: fontSize, font });
      const amountText = formatCurrency(calc.summary.allowance.amount);
      page.drawText(amountText, { x: tableRight - textWidth(amountText), y, size: fontSize, font });
      y -= 20;
    }

    // Adjustments
    if (adjustments.length > 0) {
      y -= 5;
      drawLine(tableLeft, y, tableRight, y, 0.3);
      y -= 18;

      adjustments.forEach((adj) => {
        const label = ADJUSTMENT_TYPE_LABELS[adj.adjustment_type] || '調整';
        page.drawText(label, { x: colItem, y, size: fontSize, font });
        page.drawText(adj.note || '-', { x: colDetail, y, size: fontSize, font });
        const sign = adj.amount >= 0 ? '+' : '';
        const amountText = `${sign}${formatCurrency(adj.amount)}`;
        page.drawText(amountText, {
          x: tableRight - textWidth(amountText),
          y,
          size: fontSize,
          font,
        });
        y -= 20;
      });
    }

    // Total
    y -= 10;
    drawLine(tableLeft, y, tableRight, y, 1);
    y -= 25;

    page.drawText('総支給額', { x: colItem, y, size: 12, font });
    const totalText = formatCurrency(calc.finalTotal);
    page.drawText(totalText, { x: tableRight - textWidth(totalText, 14), y, size: 14, font });
    y -= 15;
    drawLine(tableLeft, y, tableRight, y, 1);

    // Footer
    page.drawText('この明細書は給与計算システムにより発行されました', {
      x: margin,
      y: 40,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    const pdfBytes = await pdfDoc.save();
    const genTime = Date.now() - startTime;

    logger.info('PDF generated', {
      userId,
      year,
      month,
      size: `${(pdfBytes.length / 1024).toFixed(0)}KB`,
      genTime: `${genTime}ms`,
    });

    return Buffer.from(pdfBytes);
  },
};
