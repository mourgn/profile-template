import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
// Resolve with Node so portable builds don't need to scan unrelated parent folders.
const resolveModules = { name:'portable-resolution',setup(b) {
  b.onResolve({filter:/.*/},args=>{
    const req=createRequire(path.isAbsolute(args.importer)?args.importer:path.join(process.cwd(),'build.mjs'));
    let resolved;
    if(['crypto','stream','undici'].includes(args.path)) resolved=path.join(path.dirname(createRequire(import.meta.url).resolve('@vercel/blob/client')),args.path+'-browser.js');
    else if(args.path==='@vercel/oidc') resolved=path.join(path.dirname(req.resolve(args.path)),'index-browser.js');
    else if(args.path==='jose') resolved=req.resolve(args.path).replace(/dist[\\/]node[\\/]cjs[\\/]/,'dist/browser/');
    else if(args.path==='@vercel/blob/client') resolved=req.resolve(args.path).replace(/\.cjs$/,'.js');
    else resolved=req.resolve(args.path);
    return {path:resolved,namespace:'sdk'};
  });
  b.onLoad({filter:/.*/,namespace:'sdk'},async args=>({contents:await readFile(args.path,'utf8'),loader:args.path.endsWith('.json')?'json':'js'}));
}};
await build({stdin:{contents:"export { upload } from '@vercel/blob/client';"},plugins:[resolveModules],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'public/blob-client.js',minify:true});
console.log('Vercel upload client built.');

