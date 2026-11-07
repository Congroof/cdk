import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/ltk-manager.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(js, { exports, atob });
const { isLtkManagerManifest } = exports;
const rawSignature = Buffer.concat([Buffer.from('ED'), Buffer.alloc(72)]).toString('base64');
const signature = Buffer.from(`untrusted comment: fixture\n${rawSignature}\ntrusted comment: timestamp:1\tfile:LTK.Manager_1.33.0_x64-setup.exe\n${Buffer.alloc(64).toString('base64')}`).toString('base64');
const fixture = () => ({ schemaVersion: 1, product: 'ltk-manager', platform: 'windows-x86_64', version: '1.33.0', signature,
  artifact: { fileId: '18446744073709551615', groupId: '2', parentId: '3', linkId: 'link', fileName: 'LTK.Manager_1.33.0_x64-setup.exe', fileSize: 123, sha256: 'a'.repeat(64) } });
assert.equal(isLtkManagerManifest(fixture()), true);
const originalName = fixture();
const sigText = Buffer.from(originalName.signature, 'base64').toString();
originalName.signature = Buffer.from(sigText.replace('file:LTK.Manager_', 'file:LTK Manager_')).toString('base64');
assert.equal(isLtkManagerManifest(originalName), true);
originalName.signature = Buffer.from(sigText.replace('1.33.0_x64', '1.32.0_x64')).toString('base64');
assert.equal(isLtkManagerManifest(originalName), false);
for (const value of [null, {}, { ...fixture(), version: '1.33.0-beta.1' }, { ...fixture(), product: 'skinforge' }, { ...fixture(), signature: 'bad' }]) assert.equal(isLtkManagerManifest(value), false);
for (const [key, value] of [['fileId', '18446744073709551616'], ['fileId', '01'], ['fileId', '+1'], ['linkId', 'a'.repeat(129)], ['fileSize', 0], ['fileSize', 536870913], ['fileSize', 1.5], ['sha256', 'z'.repeat(64)], ['fileName', '../setup.exe']]) {
  const f = fixture(); f.artifact[key] = value; assert.equal(isLtkManagerManifest(f), false, key);
}
const migration = await readFile(new URL('../../backend/migrations/012_create_skinforge_ltk_manager.sql', import.meta.url), 'utf8');
for (const path of ['../../backend/src/db.rs', '../../deploy/mysql-init/01_schema.sql']) {
  assert.ok((await readFile(new URL(path, import.meta.url), 'utf8')).includes(migration.trim().replace(/;$/, '')), path);
}
const handler = await readFile(new URL('../../backend/src/handlers/ltk_manager.rs', import.meta.url), 'utf8');
assert.match(handler, /resolve_download_url/);
assert.doesNotMatch(handler, /github\.com|download_url\s*=/);
console.log('LTK Manager admin checks passed: runtime JSON guard boundaries, signed filename binding and schema parity.');
