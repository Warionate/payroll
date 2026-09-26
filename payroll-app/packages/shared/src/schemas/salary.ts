import { z } from 'zod';

export const salaryAdjustmentSchema = z.object({
  year_month: z.string().regex(/^\d{4}-\d{2}$/, 'year_month must be in YYYY-MM format'),
  adjustment_type: z.enum(['incentive', 'correction', 'other'], {
    message: 'adjustment_type must be one of: incentive, correction, other',
  }),
  amount: z.coerce.number().int('amount must be an integer'),
  note: z.string().max(500, 'note must be a string with max 500 characters').nullable().optional(),
});

export type SalaryAdjustmentSchemaInput = z.infer<typeof salaryAdjustmentSchema>;
