import { describe, expect, it } from 'vitest';
import { segmentsToSrt, segmentsToVtt } from '../lib/subtitles';

const segments = [
  { id: '1', start: 0, end: 1.5, text: 'Hola mundo', speaker: 'A' },
  { id: '2', start: 1.5, end: 3, text: 'Segunda frase', speaker: 'B' },
];

describe('subtitle exports', () => {
  it('genera SRT con hablantes', () => {
    expect(segmentsToSrt(segments)).toContain('A: Hola mundo');
    expect(segmentsToSrt(segments)).toContain('00:00:01,500');
  });

  it('genera VTT válido', () => {
    expect(segmentsToVtt(segments)).toMatch(/^WEBVTT/);
    expect(segmentsToVtt(segments)).toContain('<v B>Segunda frase');
  });
});
