import { describe, it, expect } from 'vitest';
import {
  isImageUrl,
  parseLinks,
  getFileExtension,
  getFileIconType,
  getDownloadUrl,
} from './linkifyUtils';

describe('linkifyUtils', () => {
  describe('isImageUrl', () => {
    it.each([
      ['https://example.com/photo.jpg', true],
      ['https://example.com/photo.jpeg', true],
      ['https://example.com/photo.png', true],
      ['https://example.com/photo.gif', true],
      ['https://example.com/photo.webp', true],
      ['https://example.com/photo.svg', true],
      ['https://example.com/photo.bmp', true],
      ['https://example.com/photo.JPG', true],
      ['https://example.com/doc.pdf', false],
      ['https://example.com/page', false],
      ['not-a-url', false],
    ])('isImageUrl(%s) => %s', (url, expected) => {
      expect(isImageUrl(url)).toBe(expected);
    });
  });

  describe('parseLinks', () => {
    it('should return empty array for empty input', () => {
      expect(parseLinks('')).toEqual([]);
    });

    it('should return plain text for input without URLs', () => {
      const result = parseLinks('Hello world');
      expect(result).toEqual([{ type: 'text', content: 'Hello world' }]);
    });

    it('should detect HTTP URLs', () => {
      const result = parseLinks('Visit https://example.com please');
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'text', content: 'Visit ' });
      expect(result[1]).toEqual({ type: 'link', content: 'https://example.com' });
      expect(result[2]).toEqual({ type: 'text', content: ' please' });
    });

    it('should detect image URLs', () => {
      const result = parseLinks('Look at https://example.com/pic.png');
      expect(result[1]).toEqual({ type: 'image', content: 'https://example.com/pic.png' });
    });

    it('should detect /uploads/ paths', () => {
      const result = parseLinks('File: /uploads/doc.pdf');
      expect(result[1]).toEqual({ type: 'link', content: '/uploads/doc.pdf' });
    });

    it('should handle file attachment pattern', () => {
      const result = parseLinks('📎 report.pdf: /uploads/report.pdf');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('file');
      expect(result[0].filename).toBe('report.pdf');
      expect(result[0].content).toBe('/uploads/report.pdf');
    });

    it('should handle file attachment with expiry date', () => {
      const futureDate = '2099/12/31';
      const result = parseLinks(`📎 doc.pdf: /uploads/doc.pdf [有効期限: ${futureDate}]`);
      expect(result[0].type).toBe('file');
      expect(result[0].isExpired).toBe(false);
    });

    it('should detect expired file attachments', () => {
      const result = parseLinks('📎 old.pdf: /uploads/old.pdf [有効期限: 2020/01/01]');
      expect(result[0].type).toBe('file');
      expect(result[0].isExpired).toBe(true);
    });

    it('should handle multiline text with newlines', () => {
      const result = parseLinks('line1\nline2');
      expect(result).toEqual([
        { type: 'text', content: 'line1' },
        { type: 'text', content: '\n' },
        { type: 'text', content: 'line2' },
      ]);
    });

    it('should handle multiple URLs in one line', () => {
      const result = parseLinks('https://a.com and https://b.com');
      const links = result.filter((p) => p.type === 'link');
      expect(links).toHaveLength(2);
    });
  });

  describe('getFileExtension', () => {
    it('should return extension with leading dot', () => {
      expect(getFileExtension('file.pdf')).toBe('.pdf');
    });

    it('should return lowercase extension', () => {
      expect(getFileExtension('FILE.PDF')).toBe('.pdf');
    });

    it('should return empty string for no extension', () => {
      expect(getFileExtension('noext')).toBe('');
    });

    it('should return empty string for empty input', () => {
      expect(getFileExtension('')).toBe('');
    });

    it('should handle multiple dots', () => {
      expect(getFileExtension('archive.tar.gz')).toBe('.gz');
    });
  });

  describe('getFileIconType', () => {
    it('should return image for image mimetypes', () => {
      expect(getFileIconType('image/png')).toBe('image');
      expect(getFileIconType('image/jpeg')).toBe('image');
    });

    it('should return document for pdf', () => {
      expect(getFileIconType('application/pdf')).toBe('document');
    });

    it('should return document for word documents', () => {
      expect(getFileIconType('application/msword')).toBe('document');
    });

    it('should return document for spreadsheets', () => {
      expect(getFileIconType('application/vnd.ms-excel')).toBe('document');
    });

    it('should return file for unknown types', () => {
      expect(getFileIconType('application/octet-stream')).toBe('file');
    });

    it('should return file for empty string', () => {
      expect(getFileIconType('')).toBe('file');
    });
  });

  describe('getDownloadUrl', () => {
    it('should convert /uploads/ path to download endpoint', () => {
      expect(getDownloadUrl('/uploads/report.pdf')).toBe('/api/uploads/download/report.pdf');
    });

    it('should pass through non-upload URLs', () => {
      expect(getDownloadUrl('https://example.com/file.pdf')).toBe('https://example.com/file.pdf');
    });

    it('should return empty string for empty input', () => {
      expect(getDownloadUrl('')).toBe('');
    });
  });
});
