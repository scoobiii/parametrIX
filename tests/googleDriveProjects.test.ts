import { describe, expect, it } from 'vitest';
import { extractGoogleDriveFileId } from '../src/services/googleDriveProjects';

describe('googleDriveProjects - extractGoogleDriveFileId', () => {
  it('extracts file ID from /file/d/<id>/view URLs', () => {
    expect(
      extractGoogleDriveFileId('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz_123/view?usp=sharing')
    ).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz_123');
  });

  it('extracts file ID from open?id=<id> and uc?id=<id> URLs', () => {
    expect(
      extractGoogleDriveFileId('https://drive.google.com/open?id=9ZyXwVuTsRqPoNmLkJiHg_456')
    ).toBe('9ZyXwVuTsRqPoNmLkJiHg_456');
    expect(
      extractGoogleDriveFileId('https://docs.google.com/uc?export=download&id=0123456789abcdef')
    ).toBe('0123456789abcdef');
  });

  it('returns null for non-Google-Drive URLs and invalid inputs', () => {
    expect(extractGoogleDriveFileId('https://cadrepo.example.org/models/turbine-1.step')).toBeNull();
    expect(extractGoogleDriveFileId('not-a-valid-url')).toBeNull();
    expect(extractGoogleDriveFileId('https://drive.google.com/drive/my-drive')).toBeNull();
  });
});
