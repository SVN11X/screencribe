export function conversionSize(video) {
  let width = Number(video.width);
  let height = Number(video.height);
  if (!(
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ))
    throw new Error('No se pudo leer la resolución del video.');
  const rotation = Number(
    video.side_data_list?.find((item) => item.rotation != null)?.rotation ??
      video.tags?.rotate ??
      0,
  );
  if (Math.abs(rotation % 180) === 90) [width, height] = [height, width];
  const scale = Math.min(
    1,
    1920 / Math.max(width, height),
    1080 / Math.min(width, height),
  );
  return {
    width: Math.max(2, Math.floor((width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((height * scale) / 2) * 2),
  };
}

export function makeConversionPlan(
  metadata,
  { createMp4, createMp3 },
  input = '/input/source',
) {
  const streams = metadata.streams || [];
  const video = streams.find(
    (stream) =>
      stream.codec_type === 'video' && !stream.disposition?.attached_pic,
  );
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const outputs = [];
  const warnings = [];
  if (createMp4 && video) {
    const { width, height } = conversionSize(video);
    outputs.push({
      name: 'mp4',
      mimeType: 'video/mp4',
      path: 'output.mp4',
      args: [
        '-hide_banner',
        '-threads',
        '1',
        '-i',
        input,
        '-map',
        `0:${video.index}`,
        ...(audio ? ['-map', `0:${audio.index}`] : []),
        '-sn',
        '-dn',
        '-vf',
        `scale=${width}:${height}:force_original_aspect_ratio=decrease:eval=frame,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:eval=frame,setsar=1`,
        // MediaRecorder WebM may report 1000 fps. Preserve timestamps and avoid duplicates.
        '-r',
        '60',
        '-fps_mode',
        'vfr',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-threads',
        '1',
        ...(audio ? ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000'] : ['-an']),
        '-movflags',
        '+faststart',
        'output.mp4',
      ],
    });
  } else if (createMp4)
    warnings.push('Este archivo no tiene una pista de video; se omitió MP4.');
  if (createMp3 && audio) {
    outputs.push({
      name: 'mp3',
      mimeType: 'audio/mpeg',
      path: 'output.mp3',
      args: [
        '-hide_banner',
        '-threads',
        '1',
        '-i',
        input,
        '-map',
        `0:${audio.index}`,
        '-vn',
        '-sn',
        '-dn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        '-ar',
        '44100',
        '-ac',
        '2',
        'output.mp3',
      ],
    });
  } else if (createMp3)
    warnings.push('Este archivo no tiene audio; se omitió MP3.');
  if (!outputs.length)
    throw new Error(
      warnings.join(' ') || 'Selecciona MP4 o MP3 para convertir.',
    );
  const durationSeconds =
    Number(metadata.format?.duration) ||
    Math.max(0, ...streams.map((stream) => Number(stream.duration) || 0));
  return { outputs, warnings, durationSeconds };
}
