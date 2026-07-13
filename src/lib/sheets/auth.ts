import crypto from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signAssertion(email: string, privateKeyPem: string): string {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${base64url(Buffer.from(JSON.stringify(header)))}.${base64url(Buffer.from(JSON.stringify(claims)))}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem);

  return `${signingInput}.${base64url(signature)}`;
}

/** Exchanges the service account's credentials for a short-lived Sheets API access token, caching it until near expiry. */
export async function getSheetsAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.accessToken;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error("missing_google_service_account_credentials");
  }
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const assertion = signAssertion(email, privateKey);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`google_token_error_${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const accessToken: string = json.access_token;
  const expiresIn: number = json.expires_in ?? 3600;
  cached = { accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}
