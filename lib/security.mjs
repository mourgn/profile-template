import { randomBytes, scrypt, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const token = () => randomBytes(32).toString('base64url');
export async function hashCode(code, salt = randomBytes(16).toString('hex')) {
  const key = await derive(code, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt, hash: key.toString('hex') };
}
export async function checkCode(code, saved) {
  if (typeof code !== 'string' || code.length < 16 || code.length > 256) return false;
  const candidate = await hashCode(code, saved.salt);
  return timingSafeEqual(Buffer.from(candidate.hash, 'hex'), Buffer.from(saved.hash, 'hex'));
}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes){let bits=0,value=0,out='';for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
export function decode32(input){let bits=0,value=0,out=[];for(const c of input.replace(/=+$/,'').toUpperCase()){const n=alphabet.indexOf(c);if(n<0)continue;value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8}}return Buffer.from(out);}
export function totp(secret,time=Date.now()){const counter=Math.floor(time/1000/30);const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(counter));const h=createHmac('sha1',decode32(secret)).update(b).digest();const o=h[h.length-1]&15;const n=((h[o]&127)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3];return String(n%1_000_000).padStart(6,'0');}
export function checkTotp(code,secret){const normalized=String(code||'').replace(/\s/g,'');return /^[0-9]{6}$/.test(normalized)&&[-2,-1,0,1,2].some(i=>totp(secret,Date.now()+i*30000)===normalized);}
