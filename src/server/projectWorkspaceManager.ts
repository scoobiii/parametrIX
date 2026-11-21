import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LocalProjectFolderFile } from '../types/cad';

export function buildUserFolderSlug(userId: string, email?: string): string {
  const basis = (email && email.trim() ? email.trim() : userId.trim()) || 'local-operator';
  const cleaned = basis
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const digest = crypto.createHash('sha256').update(basis).digest('hex').slice(0, 8);
  return `${cleaned || 'user'}-${digest}`;
}

export function sanitizeProjectFilename(filename: string): string {
  const base = path.basename(String(filename || '').trim());
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 96);
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new Error('Nome de arquivo inválido para a pasta do projeto.');
  }
  return cleaned;
}

export function resolveProjectsRoot(baseRoot = process.cwd()): string {
  return path.resolve(baseRoot, 'data', 'projects');
}

export function ensureUserProjectFolder(
  userSlug: string,
  baseRoot = process.cwd()
): { folderPath: string; userSlug: string } {
  const safeSlug = String(userSlug || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!safeSlug) {
    throw new Error('Identificador de pasta de usuário inválido.');
  }
  const projectsRoot = resolveProjectsRoot(baseRoot);
  const resolved = path.resolve(projectsRoot, safeSlug);
  if (!resolved.startsWith(projectsRoot + path.sep)) {
    throw new Error('Caminho fora do diretório de projetos do usuário.');
  }
  fs.mkdirSync(resolved, { recursive: true });
  return { folderPath: resolved, userSlug: safeSlug };
}

function resolveConfinedFilePath(
  userSlug: string,
  filename: string,
  baseRoot = process.cwd()
): { folderPath: string; filePath: string; safeName: string } {
  const { folderPath } = ensureUserProjectFolder(userSlug, baseRoot);
  const safeName = sanitizeProjectFilename(filename);
  const filePath = path.resolve(folderPath, safeName);
  if (!filePath.startsWith(folderPath + path.sep)) {
    throw new Error('Travessia de diretório bloqueada.');
  }
  return { folderPath, filePath, safeName };
}

export function listUserProjectFiles(
  userSlug: string,
  baseRoot = process.cwd()
): LocalProjectFolderFile[] {
  const { folderPath } = ensureUserProjectFolder(userSlug, baseRoot);
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const files: LocalProjectFolderFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.resolve(folderPath, entry.name);
    const stat = fs.statSync(fullPath);
    const buf = fs.readFileSync(fullPath);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    files.push({
      name: entry.name,
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
      sha256,
    });
  }
  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return files;
}

export function writeUserProjectFile(
  userSlug: string,
  filename: string,
  content: string,
  baseRoot = process.cwd()
): LocalProjectFolderFile {
  const { filePath, safeName } = resolveConfinedFilePath(userSlug, filename, baseRoot);
  const payload = String(content ?? '');
  fs.writeFileSync(filePath, payload, 'utf8');
  const stat = fs.statSync(filePath);
  const sha256 = crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
  return {
    name: safeName,
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
    sha256,
  };
}

export function deleteUserProjectFile(
  userSlug: string,
  filename: string,
  baseRoot = process.cwd()
): boolean {
  const { filePath } = resolveConfinedFilePath(userSlug, filename, baseRoot);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}
