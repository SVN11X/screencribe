import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, sanitizeFilename, subtitleTimestamp } from '../lib/format';

describe('format helpers', () => {
  it('formatea duración', () => {
    expect(formatDuration(3_661_000)).toBe('01:01:01');
  });

  it('formatea bytes', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
  });

  it('limpia nombres de archivo', () => {
    expect(sanitizeFilename('Clase: Energía Nº 1')).toBe('Clase-Energia-No-1');
  });

  it('crea timestamps SRT', () => {
    expect(subtitleTimestamp(65.25, ',')).toBe('00:01:05,250');
  });
});
