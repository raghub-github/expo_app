import crypto from 'crypto';

const SECRET = process.env.ONBOARD_JWT_SECRET || 'dev-onboard-secret-change-me';

function base64url(input: Buffer) {
	return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function signOnboardToken(payload: Record<string, any>, expiresInSeconds = 600) {
	const header = { alg: 'HS256', typ: 'JWT' };
	const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
	const body = { ...payload, exp };

	const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
	const bodyB64 = base64url(Buffer.from(JSON.stringify(body)));
	const data = `${headerB64}.${bodyB64}`;
	const sig = crypto.createHmac('sha256', SECRET).update(data).digest();
	const sigB64 = base64url(sig);
	return `${data}.${sigB64}`;
}

export function verifyOnboardToken(token: string) {
	if (!token) return null;
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [headerB64, bodyB64, sigB64] = parts;
	const data = `${headerB64}.${bodyB64}`;
	const expectedSig = base64url(crypto.createHmac('sha256', SECRET).update(data).digest());
	if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sigB64))) return null;
	try {
		const bodyJson = Buffer.from(bodyB64, 'base64').toString('utf8');
		const payload = JSON.parse(bodyJson);
		if (payload.exp && Date.now() / 1000 > payload.exp) return null;
		return payload;
	} catch {
		return null;
	}
}

export default { signOnboardToken, verifyOnboardToken };



