import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import api from './lib/api.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const files = { '/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/defaults.json':'defaults.json','/favicon.svg':'favicon.svg','/blob-client.js':'blob-client.js' };
const types = { html:'text/html',css:'text/css',js:'text/javascript',json:'application/json',svg:'image/svg+xml' };
http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');
  const url = new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/'))return api(req,res);
  const file=files[url.pathname];if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end('Not found');return;}
  try{const b=await readFile(path.join(root,'public',file));res.writeHead(200,{'Content-Type':types[file.split('.').pop()]+'; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:b)}catch{res.writeHead(404).end('Not found')}
}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${process.env.PORT||4173}`));
