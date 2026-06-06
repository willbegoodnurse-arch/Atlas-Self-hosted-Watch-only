import type { FastifyInstance, FastifyRequest } from "fastify";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function registerTrustedOriginGuard(
  server: FastifyInstance,
  trustedOrigins: readonly string[]
): Promise<void> {
  server.addHook("onRequest", async (request, reply) => {
    if (!isStateChangingApiRequest(request)) {
      return;
    }

    const result = validateTrustedRequestOrigin({
      origin: request.headers.origin,
      referer: request.headers.referer,
      trustedOrigins
    });

    if (!result.ok) {
      request.log.warn(
        { event: "trusted_origin_rejected", reason: result.reason },
        "blocked state-changing API request from untrusted origin"
      );
      return reply.code(403).send({ error: "Trusted browser origin required" });
    }
  });
}

export function isStateChangingApiRequest(request: Pick<FastifyRequest, "method" | "url">): boolean {
  const path = request.url.split("?")[0] ?? "";
  return stateChangingMethods.has(request.method.toUpperCase()) && (path === "/api" || path.startsWith("/api/"));
}

export function validateTrustedRequestOrigin(input: {
  origin: string | string[] | undefined;
  referer: string | string[] | undefined;
  trustedOrigins: readonly string[];
}): { ok: true } | { ok: false; reason: "missing-origin" | "untrusted-origin" | "invalid-referer" } {
  const origin = firstHeader(input.origin);
  if (origin) {
    return input.trustedOrigins.includes(origin) ? { ok: true } : { ok: false, reason: "untrusted-origin" };
  }

  const referer = firstHeader(input.referer);
  if (!referer) {
    return { ok: false, reason: "missing-origin" };
  }

  try {
    const refererOrigin = new URL(referer).origin;
    return input.trustedOrigins.includes(refererOrigin)
      ? { ok: true }
      : { ok: false, reason: "untrusted-origin" };
  } catch {
    return { ok: false, reason: "invalid-referer" };
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  const header = Array.isArray(value) ? value[0] : value;
  const trimmed = header?.trim();
  return trimmed || undefined;
}
