import { z } from "zod";

/**
 * The server independently re-verifies decision === "REQUEST_TRUSTED_CONTACT"
 * — the client's decision claim is never trusted on its own. merchantName is
 * accepted for parity with the SDK's TrustedPerspectiveRequest shape but is
 * never forwarded into the Linq message text.
 */
export const linqTrustedPerspectiveRequestSchema = z.object({
  decision: z.literal("REQUEST_TRUSTED_CONTACT"),
  reasonCodes: z.array(z.string().max(64)).max(10),
  merchantName: z.string().max(120).optional(),
});

export type LinqTrustedPerspectiveRequestBody = z.infer<typeof linqTrustedPerspectiveRequestSchema>;
