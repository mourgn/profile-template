export function validateConfig(input, defaults) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid profile');
  const out = structuredClone(defaults);
  const textKeys = ['name','handle','tagline','bio','location','initials','corner','footnote','footer'];
  for (const key of textKeys) if (key in input) {
    if (typeof input[key] !== 'string' || input[key].length > (key === 'bio' ? 3000 : 300)) throw new Error(`Invalid ${key}`);
    out[key] = input[key];
  }
  const safeURL = (v) => {
    if (typeof v !== 'string' || v.length > 2048) throw new Error('Invalid URL');
    if (!v || /^\/api\/media\/[a-f0-9-]{36}\.(png|jpg|webp|gif|mp3|ogg|wav)$/.test(v)) return v;
    let u; try { u = new URL(v); } catch { throw new Error('Use a full HTTPS URL or upload a file'); }
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('Unsupported URL');
    return u.href;
  };
  for (const key of ['avatar','background','cursorImage','spotifyProfile']) if (key in input) out[key] = safeURL(input[key]);
  for (const key of ['accent','textColor','backgroundColor']) if (key in input) {
    if (!/^#[a-f0-9]{6}$/i.test(input[key])) throw new Error(`Invalid ${key}`);
    out[key] = input[key];
  }
  const ranges = {overlay:[0,90],glassOpacity:[3,60],glassBlur:[0,60],glassSaturation:[100,250],reflection:[0,100],borderOpacity:[0,80],radius:[0,50],cardWidth:[340,700],nameSize:[24,64],avatarSize:[48,140],avatarRadius:[0,50],volume:[0,100],glowStrength:[0,100],weatherDensity:[8,140],gridSize:[2,32]};
  for (const [key,[min,max]] of Object.entries(ranges)) if (key in input) {
    if (!Number.isFinite(input[key]) || input[key] < min || input[key] > max) throw new Error(`Invalid ${key}`);
    out[key] = input[key];
  }
  const enums = {surfaceStyle:['glass','solid','outline','frosted','flat'],backgroundMode:['aurora','midnight','rose','solid'],backgroundEffect:['none','rain','snow','stars'],font:['sans','serif','mono'],alignment:['center','left'],linkStyle:['glass','outline','solid'],linkLayout:['stack','grid'],cursor:['default','dot','crosshair','image'],repeat:['all','one','off']};
  for (const [key,values] of Object.entries(enums)) if (key in input) {
    if (!values.includes(input[key])) throw new Error(`Invalid ${key}`); out[key] = input[key];
  }
  for (const key of ['glow','softGlow','motion','float','showLocation','showPlayer','showBio','showLinks','showAccounts','snap']) if (key in input) {
    if (typeof input[key] !== 'boolean') throw new Error(`Invalid ${key}`); out[key] = input[key];
  }
  const lists = {links:['title','subtitle','url','icon'],accounts:['platform','url'],embeds:['title','url'],tracks:['title','artist','url']};
  for (const [key,fields] of Object.entries(lists)) if (key in input) {
    if (!Array.isArray(input[key]) || input[key].length > 50) throw new Error(`Maximum 50 ${key}`);
    out[key] = input[key].map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Invalid ${key}`);
      const result = { enabled: item.enabled !== false };
      for (const field of fields) {
        const value = item[field] ?? '';
        if (field === 'url') result[field] = safeURL(value);
        else { if (typeof value !== 'string' || value.length > 500) throw new Error(`Invalid ${field}`); result[field] = value; }
      }
      return result;
    });
  }
  return out;
}
