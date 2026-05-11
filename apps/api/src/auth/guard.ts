import type { FastifyReply, FastifyRequest } from "fastify";
import { authConfig } from "./config.js";
import { getSession, type SessionRecord } from "./sessions.js";

export function getAuthenticatedSession(request: FastifyRequest): SessionRecord | null {
  return getSession(getSessionToken(request));
}

export function requireAuthenticatedSession(
  request: FastifyRequest,
  reply: FastifyReply
): SessionRecord | null {
  const session = getAuthenticatedSession(request);
  if (!session) {
    reply.code(401).send({ error: "Authentication required" });
    return null;
  }

  return session;
}

function getSessionToken(request: FastifyRequest): string | undefined {
  const rawCookie = request.cookies[authConfig.sessionCookieName];
  if (!rawCookie) {
    return undefined;
  }

  const unsigned = request.unsignCookie(rawCookie);
  return unsigned.valid ? unsigned.value : undefined;
}
