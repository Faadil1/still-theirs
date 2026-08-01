import { z } from "zod";

/**
 * Whitelist for Gate A2 client-originated audit events. Any field not
 * listed here is stripped before the event ever reaches the audit logger
 * (which also independently redacts via src/lib/prava/redact.ts).
 */
export const gateA2EventSchema = z.object({
  event: z.enum([
    "gateA2.session.created",
    "gateA2.sdk.initialized",
    "gateA2.collection.opened",
    "gateA2.authentication.requested",
    "gateA2.flow.completed",
    "gateA2.flow.cancelled",
    "gateA2.flow.error",
  ]),
  sessionIdPresent: z.boolean().optional(),
  sessionIdSuffix: z.string().max(9).nullable().optional(),
  orderIdPresent: z.boolean().optional(),
  orderIdSuffix: z.string().max(9).nullable().optional(),
  sdkInitialized: z.boolean().optional(),
  collectionOpened: z.boolean().optional(),
  authenticationRequested: z.boolean().optional(),
  flowCompleted: z.boolean().optional(),
  cancelled: z.boolean().optional(),
  errorCategory: z.string().max(64).nullable().optional(),
});

export type GateA2Event = z.infer<typeof gateA2EventSchema>;
