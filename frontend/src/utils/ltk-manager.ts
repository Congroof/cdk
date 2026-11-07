import type { LtkManagerManifest } from '../types';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function positiveId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value)
    && value.length <= 20 && BigInt(value) <= 18446744073709551615n;
}

function signature(value: unknown, fileName: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return false;
  try {
    const lines = atob(value.trim()).trimEnd().split(/\r?\n/);
    return lines.length === 4 && lines[0].startsWith('untrusted comment:')
      && lines[2].startsWith('trusted comment: ') && lines[2].slice(17).split('\t').some((field) => field === `file:${fileName}` || (typeof fileName === 'string' && fileName.startsWith('LTK.Manager_') && field === `file:LTK Manager_${fileName.slice('LTK.Manager_'.length)}`)) && atob(lines[1]).length === 74
      && atob(lines[1]).startsWith('ED') && atob(lines[3]).length === 64;
  } catch { return false; }
}

export function isLtkManagerManifest(value: unknown): value is LtkManagerManifest {
  if (!record(value) || !record(value.artifact)) return false;
  const a = value.artifact;
  return value.schemaVersion === 1 && value.product === 'ltk-manager'
    && value.platform === 'windows-x86_64' && typeof value.version === 'string'
    && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version)
    && value.version.length <= 64 && value.version.split('.').every((n) => Number(n) <= 4294967295)
    && signature(value.signature, a.fileName) && positiveId(a.fileId) && positiveId(a.groupId) && positiveId(a.parentId)
    && typeof a.linkId === 'string' && a.linkId.trim() === a.linkId && a.linkId.length > 0 && [...a.linkId].length <= 128
    && a.fileName === `LTK.Manager_${value.version}_x64-setup.exe`
    && typeof a.fileSize === 'number' && Number.isSafeInteger(a.fileSize) && a.fileSize > 0 && a.fileSize <= 512 * 1024 * 1024
    && typeof a.sha256 === 'string' && /^[0-9a-fA-F]{64}$/.test(a.sha256);
}
