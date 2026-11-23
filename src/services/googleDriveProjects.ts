import type { GoogleDriveFolderFile, GoogleDriveFolderInfo } from '../types/cad';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function ensureUserDriveProjectFolder(
  accessToken: string,
  userSlug: string
): Promise<GoogleDriveFolderInfo> {
  const folderName = `Parametrix_Projects_${userSlug}`;
  const query = encodeURIComponent(
    `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchResp = await fetch(
    `${DRIVE_FILES_API}?q=${query}&fields=files(id,name,webViewLink)&spaces=drive`,
    { headers: authHeaders(accessToken) }
  );
  if (!searchResp.ok) {
    const errText = await searchResp.text().catch(() => '');
    throw new Error(`Falha ao consultar pasta no Google Drive (${searchResp.status}): ${errText.slice(0, 140)}`);
  }
  const searchJson = (await searchResp.json()) as {
    files?: { id: string; name: string; webViewLink?: string }[];
  };
  const existing = searchJson.files?.[0];
  if (existing) {
    return {
      folderId: existing.id,
      folderName: existing.name,
      webViewLink: existing.webViewLink,
      files: [],
    };
  }

  const createResp = await fetch(`${DRIVE_FILES_API}?fields=id,name,webViewLink`, {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createResp.ok) {
    const errText = await createResp.text().catch(() => '');
    throw new Error(`Falha ao criar pasta no Google Drive (${createResp.status}): ${errText.slice(0, 140)}`);
  }
  const created = (await createResp.json()) as { id: string; name: string; webViewLink?: string };
  return {
    folderId: created.id,
    folderName: created.name,
    webViewLink: created.webViewLink,
    files: [],
  };
}

export async function listDriveProjectFiles(
  accessToken: string,
  folderId: string
): Promise<GoogleDriveFolderFile[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const resp = await fetch(
    `${DRIVE_FILES_API}?q=${query}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&orderBy=modifiedTime desc`,
    { headers: authHeaders(accessToken) }
  );
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Falha ao listar arquivos do Google Drive (${resp.status}): ${errText.slice(0, 140)}`);
  }
  const data = (await resp.json()) as { files?: GoogleDriveFolderFile[] };
  return data.files ?? [];
}

const CAD_DRIVE_EXT_FILTERS = [
  '.stl',
  '.step',
  '.stp',
  '.ipt',
  '.dxf',
  '.3dm',
  '.obj',
  '.ifc',
  '.svg',
  '.parametrix.json',
];

export async function listDriveCadFiles(
  accessToken: string,
  searchTerm?: string
): Promise<GoogleDriveFolderFile[]> {
  const cleanSearch = searchTerm?.trim().replace(/'/g, "\\'") || '';
  const extOr = CAD_DRIVE_EXT_FILTERS.map((ext) => `name contains '${ext}'`).join(' or ');
  const q = cleanSearch
    ? `trashed=false and mimeType!='application/vnd.google-apps.folder' and name contains '${cleanSearch}'`
    : `trashed=false and mimeType!='application/vnd.google-apps.folder' and (${extOr})`;

  const resp = await fetch(
    `${DRIVE_FILES_API}?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=30&spaces=drive`,
    { headers: authHeaders(accessToken) }
  );
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Falha ao pesquisar CAD no Google Drive (${resp.status}): ${errText.slice(0, 140)}`);
  }
  const data = (await resp.json()) as { files?: GoogleDriveFolderFile[] };
  return data.files ?? [];
}

export function extractGoogleDriveFileId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (!/(^|\.)(drive|docs)\.google\.com$/i.test(parsed.hostname)) {
      return null;
    }
    const idParam = parsed.searchParams.get('id');
    if (idParam && /^[a-zA-Z0-9_-]{10,}$/.test(idParam)) {
      return idParam;
    }
    const pathMatch = /\/d\/([a-zA-Z0-9_-]{10,})/i.exec(parsed.pathname);
    return pathMatch ? pathMatch[1] : null;
  } catch {
    return null;
  }
}

export async function fetchDriveFileMetadata(
  accessToken: string,
  fileId: string
): Promise<GoogleDriveFolderFile> {
  const resp = await fetch(
    `${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink`,
    { headers: authHeaders(accessToken) }
  );
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(
      `Falha ao consultar arquivo do Google Drive (${resp.status}): ${errText.slice(0, 140)}`
    );
  }
  return (await resp.json()) as GoogleDriveFolderFile;
}

export async function downloadDriveFileContent(
  accessToken: string,
  fileId: string,
  filename: string
): Promise<{ arrayBuffer: ArrayBuffer; mimeType: string }> {
  const resp = await fetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}?alt=media`, {
    headers: authHeaders(accessToken),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Falha ao baixar "${filename}" do Google Drive (${resp.status}): ${errText.slice(0, 140)}`);
  }
  return {
    arrayBuffer: await resp.arrayBuffer(),
    mimeType: resp.headers.get('content-type') || 'application/octet-stream',
  };
}

export async function saveFileToDriveFolder(
  accessToken: string,
  folderId: string,
  filename: string,
  content: string,
  mimeType = 'application/json',
  existingFileId?: string
): Promise<GoogleDriveFolderFile> {
  const boundary = `parametrix_${Date.now().toString(16)}`;
  const metadata = existingFileId
    ? { name: filename, mimeType }
    : { name: filename, parents: [folderId], mimeType };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink`
    : `${DRIVE_UPLOAD_API}&fields=id,name,mimeType,size,modifiedTime,webViewLink`;

  const resp = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Falha ao salvar "${filename}" no Google Drive (${resp.status}): ${errText.slice(0, 140)}`);
  }
  return (await resp.json()) as GoogleDriveFolderFile;
}

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const resp = await fetch(`${DRIVE_FILES_API}/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Falha ao excluir arquivo no Google Drive (${resp.status}): ${errText.slice(0, 140)}`);
  }
}
