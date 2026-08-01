import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const createSessionResponseSchema = z.object({
  session_id: z.string(),
  session_token: z.string(),
  iframe_url: z.string(),
  order_id: z.string(),
  expires_at: z.string(),
  authorizeOnly: z.boolean().optional(),
});
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;

const lineItemSchema = z.object({
  txn_ref_id: z.string(),
  merchant_name: z.string().nullable(),
  merchant_url: z.string().nullable(),
  total_amount: z.string(),
  status: z.string(),
  token: z.string().nullable(),
  dynamic_cvv: z.string().nullable(),
  expiry_month: z.string().nullable(),
  expiry_year: z.string().nullable(),
  products: z.array(z.unknown()),
});

const transactionSchema = z.object({
  txn_id: z.string(),
  status: z.string(),
  line_items: z.array(lineItemSchema),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export const paymentResultResponseSchema = z.object({
  session_id: z.string(),
  order_id: z.string().nullable(),
  status: z.enum(["pending", "awaiting_result", "completed", "failed"]),
  transactions: z.array(transactionSchema),
});
export type PaymentResultResponse = z.infer<typeof paymentResultResponseSchema>;

export const reportStatusResponseSchema = z.object({
  status: z.string(),
  txn_ref_id: z.string(),
  txn_status: z.enum(["APPROVED", "DECLINED"]),
  visa_confirmation: z.enum(["SUCCESS", "FAILURE"]),
});
export type ReportStatusResponse = z.infer<typeof reportStatusResponseSchema>;
