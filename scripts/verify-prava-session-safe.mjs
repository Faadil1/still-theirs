#!/usr/bin/env node
// Safe verification script for POST /api/prava/session.
//
// Never prints the raw response body, session_token, or iframe_url.
// Only invoked explicitly (node scripts/verify-prava-session-safe.mjs [port]).
// Does not retry automatically. Does not persist the response to disk.

const SENSITIVE_KEYS = new Set([
  "sessiontoken",
  "session_token",
  "iframeurl",
  "iframe_url",
  "authorization",
  "secret",
]);

export function suffix6(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.length <= 6 ? `...${value}` : `...${value.slice(-6)}`;
}

export function categorizeError(status, body) {
  if (status === 0) return "NETWORK_OR_TIMEOUT";
  if (body && typeof body === "object" && typeof body.error === "string") {
    if (/missing or invalid.*environment/i.test(body.error)) return "ENV_MISCONFIGURED";
    if (/timed out/i.test(body.error)) return "TIMEOUT";
    if (/network error/i.test(body.error)) return "NETWORK_ERROR";
    if (/schema validation/i.test(body.error)) return "SCHEMA_VALIDATION_FAILED";
  }
  if (status === 401) return "AUTH_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status >= 500) return "UPSTREAM_OR_SERVER_ERROR";
  if (status >= 400) return "CLIENT_ERROR";
  return "UNKNOWN";
}

export function sanitizeBody(body) {
  // Only ever extracts specific known-safe fields; never spreads or
  // stringifies the raw body anywhere in this script.
  const sessionIdPresent = Boolean(body && body.sessionId);
  const orderIdPresent = Boolean(body && body.orderId);
  const sessionTokenPresent = Boolean(body && body.sessionTokenPresent);
  const iframeUrlPresent = Boolean(body && body.iframeUrlPresent);

  return {
    sessionIdPresent,
    sessionIdSuffix: sessionIdPresent ? suffix6(body.sessionId) : null,
    orderIdPresent,
    orderIdSuffix: orderIdPresent ? suffix6(body.orderId) : null,
    expiresAt: body && typeof body.expiresAt === "string" ? body.expiresAt : null,
    sessionTokenPresent,
    iframeUrlPresent,
  };
}

async function main() {
  const port = process.argv[2] || "3000";
  const url = `http://localhost:${port}/api/prava/session`;

  let res;
  let bodyUnknown;

  try {
    res = await fetch(url, { method: "POST" });
  } catch {
    // Never include the raw caught error (could contain connection details
    // or partial response data) in output.
    console.log(
      JSON.stringify(
        {
          httpStatus: 0,
          success: false,
          responseSchemaValid: false,
          errorCategory: "NETWORK_OR_TIMEOUT",
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  try {
    bodyUnknown = await res.json();
  } catch {
    console.log(
      JSON.stringify(
        {
          httpStatus: res.status,
          success: false,
          responseSchemaValid: false,
          errorCategory: "MALFORMED_RESPONSE_BODY",
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  // Defense in depth: strip anything under a sensitive key before this
  // variable could ever be touched again in this process.
  if (bodyUnknown && typeof bodyUnknown === "object") {
    for (const key of Object.keys(bodyUnknown)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        delete bodyUnknown[key];
      }
    }
  }

  if (!res.ok) {
    console.log(
      JSON.stringify(
        {
          httpStatus: res.status,
          success: false,
          responseSchemaValid: false,
          errorCategory: categorizeError(res.status, bodyUnknown),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  const sanitized = sanitizeBody(bodyUnknown);
  const responseSchemaValid =
    sanitized.sessionIdPresent && sanitized.orderIdPresent && Boolean(sanitized.expiresAt);

  console.log(
    JSON.stringify(
      {
        httpStatus: res.status,
        success: true,
        ...sanitized,
        responseSchemaValid,
        errorCategory: null,
      },
      null,
      2
    )
  );
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`;
if (isDirectRun) {
  main();
}
