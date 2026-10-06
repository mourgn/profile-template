import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { storage } from './storage.mjs';
import { token, checkCode, checkTotp } from './security.mjs';
import { validateConfig } from './config.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const store = storage(root);
const defaults = JSON.parse(await readFile(path.join(root, 'public/defaults.json'), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const types = { png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav' };
const mediaPattern = /^media\/[a-f0-9-]{36}\.(png|jpg|webp|gif|mp3|ogg|wav)$/;
const attempts = new Map(); let activeLogin = 0; let queue = Promise.resolve();
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function json(res, status, data) { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff' }); res.end(JSON.stringify(data)); }
async function body(req, limit = 256 * 1024) {
  if (Number(req.headers['content-length'] || 0) > limit) fail(413, 'File is too large');
  if (req.body !== undefined && !Buffer.isBuffer(req.body)) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > limit) fail(413, 'Request is too large'); return Buffer.from(raw);
  }
  if (Buffer.isBuffer(req.body)) { if (req.body.length > limit) fail(413, 'Request is too large'); return req.body; }
  const parts = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > limit) fail(413, 'File is too large'); parts.push(chunk); }
  return Buffer.concat(parts);
}
async function readJSON(req) { try { return JSON.parse((await body(req)).toString()); } catch (e) { if(e.status) throw e; fail(400,'Invalid JSON'); } }
function allowedOrigin(req) {
  const configured = process.env.APP_ORIGIN;
  const expected = configured || (!store.cloud ? `http://127.0.0.1:${process.env.PORT || 4173}` : '');
  if (!expected || req.headers.origin !== expected) fail(403, 'Request origin is not allowed');
}
async function authConfig() {
  let auth;
  if (process.env.CUSTOMIZATION_CODE_HASH) { try { auth = JSON.parse(process.env.CUSTOMIZATION_CODE_HASH); } catch {} }
  else if (!store.cloud) { try { auth = JSON.parse(await readFile(path.join(store.dir,'auth.json'),'utf8')); } catch {} }
  if (!auth || !/^[a-f0-9]{32}$/.test(auth.salt) || !/^[a-f0-9]{128}$/.test(auth.hash)) fail(503, 'Owner login is not configured. Follow the setup guide.');
  return auth;
}
const cookieName = () => store.cloud ? '__Host-orbit' : 'orbit';
function cookie(res, value, age) { res.setHeader('Set-Cookie', `${cookieName()}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${store.cloud ? '; Secure' : ''}`); }
async function session(req, required = true) {
  const match = (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName()+'='));
  const value = match?.slice(cookieName().length+1);
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) { if (required) fail(401,'Sign in to customize'); return null; }
  const key = `sessions/${sha(value)}.json`;
  const record = await store.read(key);
  if (!record || record.data.expires < Date.now() || record.data.version !== sha((await authConfig()).hash)) { if (required) fail(401,'Your session expired. Sign in again.'); return null; }
  return { ...record.data, key };
}
async function authorized(req) { allowedOrigin(req); const s = await session(req); if (req.headers['x-csrf-token'] !== s.csrf) fail(403,'Invalid request token'); return s; }
async function state() { return await store.read('state.json') || { data: { published: defaults, draft: defaults, previous:null, revision:'initial' } }; }
function mediaValid(buf, ext) {
  if (ext==='png') return buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (ext==='jpg') return buf[0]===255 && buf[1]===216 && buf[2]===255;
  if (ext==='gif') return /^GIF8[79]a/.test(buf.subarray(0,6).toString());
  if (ext==='webp') return buf.subarray(0,4).toString()==='RIFF' && buf.subarray(8,12).toString()==='WEBP';
  if (ext==='wav') return buf.subarray(0,4).toString()==='RIFF' && buf.subarray(8,12).toString()==='WAVE';
  if (ext==='ogg') return buf.subarray(0,4).toString()==='OggS';
  return ext==='mp3' && (buf.subarray(0,3).toString()==='ID3' || buf[0]===255 && (buf[1]&224)===224);
}
async function mediaResponse(req,res,key) {
  if (!mediaPattern.test(key)) fail(404,'Not found');
  const item = await store.media(key, req.headers.range);
  if (!item) fail(404,'File not found');
  res.setHeader('Content-Type',types[key.split('.').pop()]); res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','public, max-age=86400'); res.setHeader('Accept-Ranges','bytes');
  if (store.cloud) {
    for (const h of ['content-length','content-range']) if(item.headers.get(h)) res.setHeader(h,item.headers.get(h));
    res.statusCode = item.headers.has('content-range') ? 206 : item.statusCode;
    if(req.method==='HEAD') { await item.stream?.cancel(); res.end(); return; }
    await pipeline(Readable.fromWeb(item.stream),res); return;
  }
  let start=0,end=item.size-1;
  if(req.headers.range) {
    const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!m || (!m[1]&&!m[2])) { res.setHeader('Content-Range',`bytes */${item.size}`); res.writeHead(416).end(); return; }
    if(!m[1]) start=Math.max(0,item.size-Number(m[2])); else { start=Number(m[1]); if(m[2]) end=Math.min(Number(m[2]),end); }
    if(start>end || start>=item.size) { res.setHeader('Content-Range',`bytes */${item.size}`); res.writeHead(416).end(); return; }
    res.statusCode=206; res.setHeader('Content-Range',`bytes ${start}-${end}/${item.size}`);
  }
  res.setHeader('Content-Length',end-start+1);
  if(req.method==='HEAD') res.end(); else await pipeline(createReadStream(item.path,{start,end}),res);
}
export default async function api(req,res) {
  try {
    const u = new URL(req.url,'http://local');
    const route = u.searchParams.get('route') || u.pathname.replace(/^\/api\/?/,'');
    if ((req.method==='GET'||req.method==='HEAD') && route.startsWith('media/')) return await mediaResponse(req,res,route);
    if(req.method==='GET' && route==='profile') return json(res,200,{config:(await state()).data.published});
    if(req.method==='GET' && route==='session') { const s=await session(req,false); return json(res,200,{authenticated:!!s,csrf:s?.csrf,cloud:store.cloud}); }
    if(req.method==='POST' && route==='login') {
      allowedOrigin(req);
      const ip=store.cloud ? String(req.headers['x-real-ip']||'cloud') : req.socket.remoteAddress;
      const now=Date.now(); for(const [k,v] of attempts) if(v.until<now)attempts.delete(k);
      const a=attempts.get(ip)||{count:0,until:now+15*60*1000};
      if(a.count>=8 || activeLogin>=2 || attempts.size>10000) fail(429,'Too many attempts. Try again in 15 minutes.');
      a.count++; attempts.set(ip,a);
      const input=await readJSON(req); const auth=await authConfig();
      activeLogin++; let ok; try{ok=auth.totpSecret?checkTotp(input.code,auth.totpSecret):await checkCode(input.code,auth)}finally{activeLogin--}
      if(!ok) fail(401,'That customization code is not correct.');
      attempts.delete(ip); const raw=token();const csrf=token();
      await store.write(`sessions/${sha(raw)}.json`,{csrf,expires:now+3600000,version:sha(auth.hash)});
      cookie(res,raw,3600); return json(res,200,{authenticated:true,csrf,cloud:store.cloud});
    }
    if(req.method==='POST' && route==='logout') { const s=await authorized(req);await store.remove(s.key);cookie(res,'',0);return json(res,200,{ok:true}); }
    if(req.method==='GET' && route==='draft') { await session(req); return json(res,200,(await state()).data); }
    if(req.method==='POST' && ['draft','publish','restore'].includes(route)) {
      await authorized(req); const input=await readJSON(req);
      const change = async () => {
        const current=await state(); const data=current.data;
        if(input.revision!==data.revision) fail(409,'This profile changed in another tab. Reload the editor before saving.');
        if(route==='restore') { if(!data.previous)fail(400,'No previous version yet');const old=data.published;data.published=data.previous;data.previous=old;data.draft=data.published; }
        else { let cfg;try{cfg=validateConfig(input.config,defaults)}catch(e){fail(400,e.message)}data.draft=cfg;if(route==='publish'){data.previous=data.published;data.published=cfg} }
        data.revision=randomUUID();data.updatedAt=new Date().toISOString();
        try { await store.write('state.json',data,current.etag); } catch(e) { if(e.name==='BlobPreconditionFailedError'||e.name==='BlobAlreadyExistsError')fail(409,'Another save completed first. Reload the editor.');throw e; }
        return data;
      };
      const result=queue.then(change);queue=result.catch(()=>{});return json(res,200,await result);
    }
    if(req.method==='POST' && route==='upload-token') {
      if(!store.cloud)fail(400,'Use local uploads');
      const payload=await readJSON(req);
      const {handleUpload}=await import('@vercel/blob/client');
      const result=await handleUpload({body:payload,request:req,
        onBeforeGenerateToken:async pathname=>{await authorized(req);if(!mediaPattern.test(pathname))fail(400,'Invalid upload path');return {allowedContentTypes:[types[pathname.split('.').pop()]],maximumSizeInBytes:30*1024*1024,addRandomSuffix:false,allowOverwrite:false,validUntil:Date.now()+5*60*1000};},
        onUploadCompleted:async()=>{}
      });return json(res,200,result);
    }
    if(req.method==='POST' && route==='upload') {
      await authorized(req);if(store.cloud)fail(400,'Use direct uploads');
      const ext=String(req.headers['x-file-extension']||'').toLowerCase();if(!types[ext])fail(400,'Unsupported file type');
      const bytes=await body(req,30*1024*1024);if(!mediaValid(bytes,ext))fail(400,'File contents do not match the selected format');
      const key=`media/${randomUUID()}.${ext}`;await store.putMedia(key,bytes);return json(res,200,{url:'/api/'+key});
    }
    fail(404,'Not found');
  } catch(e) { if(res.headersSent){res.destroy();return;} if(!e.status)console.error('Request failed:',e.name);json(res,e.status||503,{error:e.status?e.message:'Storage is unavailable. Check server configuration and try again.'}); }
}
