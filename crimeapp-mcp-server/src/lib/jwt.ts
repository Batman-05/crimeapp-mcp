import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { WorkerEnv } from "../types/env";
import { resolveSecret } from "./secrets";

// TODO: this is the JWT payload structure for Cloudflare Access tokens taken from their docs.
// will need to implement it to restrict access to MCP endpoints later.

export type AccessJwtPayload = JWTPayload & {
	email?: string;
	identity?: {
		email?: string;
	};
};

export type AccessVerification =
	| { ok: true; payload: AccessJwtPayload }
	| { ok: false; response: Response };

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizeIssuer(teamDomain: string) {
	const trimmed = teamDomain.trim().replace(/\/+$/, "");
	if (/^https?:\/\//i.test(trimmed)) {
		return trimmed;
	}
	return `https://${trimmed}`;
}

async function resolveAccessConfig(env: WorkerEnv) {
	const [policyAud, teamDomain] = await Promise.all([
		resolveSecret(env.POLICY_AUD),
		resolveSecret(env.TEAM_DOMAIN),
	]);

	return { policyAud, teamDomain };
}

function getJwks(issuer: string) {
	const existing = jwksCache.get(issuer);
	if (existing) return existing;

	const remoteSet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
	jwksCache.set(issuer, remoteSet);
	return remoteSet;
}

export async function verifyAccessJwt(request: Request, env: WorkerEnv): Promise<AccessVerification> {
	if (request.method === "OPTIONS") {
		return { ok: true, payload: {} as AccessJwtPayload };
	}

	const { policyAud, teamDomain } = await resolveAccessConfig(env);

	if (!policyAud) {
		return {
			ok: false,
			response: new Response("Missing Cloudflare Access policy audience (POLICY_AUD).", {
				status: 500,
			}),
		};
	}

	if (!teamDomain) {
		return {
			ok: false,
			response: new Response("Missing Cloudflare Access team domain (TEAM_DOMAIN).", {
				status: 500,
			}),
		};
	}

	const issuer = normalizeIssuer(teamDomain);
	const token = request.headers.get("cf-access-jwt-assertion");

	if (!token) {
		return {
			ok: false,
			response: new Response("Missing required CF Access JWT.", {
				status: 403,
			}),
		};
	}

	try {
		const jwks = getJwks(issuer);
		const { payload } = await jwtVerify(token, jwks, {
			issuer,
			audience: policyAud,
		});

		const rawPayload = payload as AccessJwtPayload;
		const email = (rawPayload.email ?? rawPayload.identity?.email) ?? undefined;
		const normalizedPayload: AccessJwtPayload = { ...rawPayload, email };
		return { ok: true, payload: normalizedPayload };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown verification error";
		return {
			ok: false,
			response: new Response(`Invalid Cloudflare Access token: ${message}`, {
				status: 403,
			}),
		};
	}
}
