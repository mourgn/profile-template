import { mkdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export function storage(root) {
  const cloud = Boolean(process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN);
  const dir = path.resolve(process.env.DATA_DIR || path.join(root, 'private'));
  const sdk = () => import('@vercel/blob');
  return {
    cloud, dir,
    async read(key) {
      if (cloud) {
        const blob = await (await sdk()).get(key, { access: 'private', useCache: false });
        if (!blob) return null;
        return { data: await new Response(blob.stream).json(), etag: blob.blob.etag };
      }
      try { return { data: JSON.parse(await readFile(path.join(dir, key), 'utf8')) }; }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async write(key, data, etag) {
      if (cloud) return (await sdk()).put(key, JSON.stringify(data), {
        access: 'private', contentType: 'application/json', addRandomSuffix: false,
        allowOverwrite: Boolean(etag), ...(etag ? { ifMatch: etag } : {}), cacheControlMaxAge: 60
      });
      const target = path.join(dir, key);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const temp = target + '.' + randomUUID() + '.tmp';
      await writeFile(temp, JSON.stringify(data), { mode: 0o600 });
      await rename(temp, target);
    },
    async remove(key) {
      if (cloud) await (await sdk()).del(key);
      else await unlink(path.join(dir, key)).catch(e => { if (e.code !== 'ENOENT') throw e; });
    },
    async putMedia(key, bytes) {
      await mkdir(path.join(dir, 'media'), { recursive: true });
      await writeFile(path.join(dir, key), bytes, { flag: 'wx', mode: 0o600 });
    },
    async media(key, range) {
      if (cloud) return (await sdk()).get(key, { access: 'private', ...(range ? { headers: { Range: range } } : {}) });
      try { return { path: path.join(dir, key), size: (await stat(path.join(dir, key))).size }; }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    }
  };
}
