import fs from 'fs';
import path from 'path';

/**
 * In Vercel serverless bundles, `data/` is deliberately NOT uploaded (see
 * `.vercelignore` / vercel.json `excludeFiles`) — city JSON is served from
 * DATA_BASE_URL instead. Only `generated/` is bundled via `includeFiles`.
 */
export function dataRoot() {
  return path.join(process.cwd(), 'data');
}

export function generatedRoot() {
  return path.join(process.cwd(), 'generated');
}

/**
 * Resolve a build asset, preferring the bundled `generated/` copy.
 *
 * Normalisation files used to be read from `data/` only, which silently
 * resolved to nothing in production because `data/**` is excluded from the
 * function bundle. Build copies them into `generated/`; `data/` stays as the
 * local-dev fallback.
 *
 * @returns {string|null} absolute path, or null when the asset is unavailable
 */
export function resolveAsset(filename) {
  for (const dir of [generatedRoot(), dataRoot()]) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
