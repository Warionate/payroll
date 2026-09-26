import { z } from 'zod';

export const ratesSchema = z.object({
  start_date: z.string().date('開始日は有効な日付である必要があります'),
  wage_1_student: z.coerce.number().int().min(0, '1名指導の単価は0以上の整数である必要があります'),
  wage_2_students: z.coerce.number().int().min(0, '2名指導の単価は0以上の整数である必要があります'),
  wage_3_students: z.coerce.number().int().min(0, '3名指導の単価は0以上の整数である必要があります'),
  wage_4_students: z.coerce.number().int().min(0, '4名指導の単価は0以上の整数である必要があります'),
  hourly_wage: z.coerce.number().int().min(0, '時給は0以上の整数である必要があります'),
  allowance_day: z.coerce.number().int().min(0, '日額手当は0以上の整数である必要があります'),
  allowance_gap: z.coerce.number().int().min(0, '授業間手当は0以上の整数である必要があります'),
});

export type RatesSchemaInput = z.infer<typeof ratesSchema>;
