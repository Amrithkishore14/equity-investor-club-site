// Front matter written by the robot is one "key: <JSON>" per line. Articles edited in the CMS
// may be written in normal YAML; for those, fall back to simple "key: value" parsing.
export function parse(src) {
  const out = {};
  for (const line of src.split('\n')) {
    const i = line.indexOf(':');
    if (i < 1 || /^\s/.test(line)) continue;
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    try { out[k] = JSON.parse(v); } catch (e) { out[k] = v.replace(/^['"]|['"]$/g, ''); }
  }
  return out;
}
