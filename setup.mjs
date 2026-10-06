import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCode, token, base32 } from './lib/security.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.env.DATA_DIR || path.join(root, 'private'));
await mkdir(dir, { recursive: true, mode: 0o700 });
let exists = false;
try { await access(path.join(dir, 'auth.json')); exists = true; } catch {}
if (exists && !process.argv.includes('--rotate')) {
  console.log('Already configured. Your customization code is in private/OWNER-CODE.txt. Use node setup.mjs --rotate to replace it, then restart the server.');
} else {
  const code = token();
  const credential = await hashCode(code);
  credential.totpSecret = base32(Buffer.from(token()));
  await writeFile(path.join(dir, 'auth.json'), JSON.stringify(credential), { mode: 0o600 });
  const uri=`otpauth://totp/Orbit%20Profile?secret=${credential.totpSecret}&issuer=Orbit%20Profile`;
  await writeFile(path.join(dir, 'AUTHENTICATOR-SETUP.txt'), `Add this as an authenticator / TOTP account (Microsoft Authenticator: Add account > Other account > enter setup key manually):\n\n${credential.totpSecret}\n\nUse time-based OTP, SHA-1, 30-second period, and 6 digits if those fields are shown.\n\nOr use this URI in a QR generator you trust:\n${uri}\n\nAfter setup, login uses the 6-digit authenticator code. Keep this file private.\n`, { mode: 0o600 });
  await writeFile(path.join(dir, 'VERCEL-SETUP.txt'), `Set this server-only environment variable in Vercel:\n\nCUSTOMIZATION_CODE_HASH\n${JSON.stringify(credential)}\n\nAlso set APP_ORIGIN to your exact HTTPS domain, such as https://yourdomain.com.\nConnect a PRIVATE Vercel Blob store and enable BLOB_READ_WRITE_TOKEN.\nNever add a PUBLIC_ or VITE_ prefix to any secret.\n`, { mode: 0o600 });
  await writeFile(path.join(dir, 'OWNER-CODE.txt'), `Your private customization code\n\n${code}\n\nEnter this at the white cross on your website. Keep this file private.\nThe server never serves this file. Restart after rotating the code.\n`, { mode: 0o600 });
  console.log(`Setup complete. Read your customization code in ${path.join(dir, 'OWNER-CODE.txt')}. It has not been printed to the terminal.`);
}
