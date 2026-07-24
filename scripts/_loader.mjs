// @/ 별칭 + 확장자 없는 import를 raw node에서 해석하는 로더
// 사용: node --loader ./scripts/_loader.mjs <script>
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = process.cwd();

export async function resolve(specifier, context, next) {
  let spec = specifier;
  if (spec.startsWith('@/')) {
    spec = pathToFileURL(path.join(ROOT, spec.slice(2))).href;
  }
  try {
    return await next(spec, context);
  } catch (err) {
    const noExt = !path.extname(spec.replace(/^file:\/\//, ''));
    if (noExt && (err?.code === 'ERR_MODULE_NOT_FOUND' || err?.code === 'ERR_UNSUPPORTED_DIR_IMPORT')) {
      return next(`${spec}.js`, context);
    }
    throw err;
  }
}
