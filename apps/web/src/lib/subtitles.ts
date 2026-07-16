import { subtitleTimestamp } from './format';
import type { DiarizedSegment, TranscriptionResponse } from './types';

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function segmentsToSrt(segments: DiarizedSegment[]): string {
  return segments
    .map((segment, index) => {
      const speaker = segment.speaker ? `${segment.speaker}: ` : '';
      return [
        String(index + 1),
        `${subtitleTimestamp(segment.start, ',')} --> ${subtitleTimestamp(segment.end, ',')}`,
        `${speaker}${cleanText(segment.text)}`,
      ].join('\n');
    })
    .join('\n\n');
}

export function segmentsToVtt(segments: DiarizedSegment[]): string {
  const cues = segments
    .map((segment) => {
      const speaker = segment.speaker ? `<v ${segment.speaker}>` : '';
      return [
        `${subtitleTimestamp(segment.start, '.')} --> ${subtitleTimestamp(segment.end, '.')}`,
        `${speaker}${cleanText(segment.text)}`,
      ].join('\n');
    })
    .join('\n\n');
  return `WEBVTT\n\n${cues}\n`;
}

export function transcriptionToTxt(result: TranscriptionResponse): string {
  if (!result.segments.length) return `${result.text.trim()}\n`;
  return `${result.segments
    .map((segment) => {
      const speaker = segment.speaker ? `${segment.speaker}: ` : '';
      return `[${subtitleTimestamp(segment.start, '.')}] ${speaker}${cleanText(segment.text)}`;
    })
    .join('\n')}\n`;
}

export function transcriptionToMarkdown(result: TranscriptionResponse): string {
  const heading = '# Transcripción\n\n';
  if (!result.segments.length) return `${heading}${result.text.trim()}\n`;

  return `${heading}${result.segments
    .map((segment) => {
      const label = segment.speaker ? `**${segment.speaker}** · ` : '';
      return `${label}${subtitleTimestamp(segment.start, '.')}\n\n${cleanText(segment.text)}`;
    })
    .join('\n\n')}\n`;
}
