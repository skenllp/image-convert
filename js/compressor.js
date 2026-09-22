/* ==========================================================================
   compressor.js
   Mode-specific behaviour for "Compress" — keeps the source format by
   default and puts the focus on the quality slider. Actual encoding is
   delegated to ImageConvertCore so there is one conversion pipeline.
   ========================================================================== */

const CompressorMode = (() => {

  /** In compress mode we default the output format to the source format. */
  function defaultOutputFormat(sourceMimeType) {
    if (sourceMimeType === 'image/png') return 'image/png';
    if (sourceMimeType === 'image/webp') return 'image/webp';
    return 'image/jpeg';
  }

  function qualityHint(mimeType) {
    if (mimeType === 'image/png') {
      return 'PNG compression is lossless, so the quality slider has little effect on file size here. For much smaller files, convert to JPG or WebP instead.';
    }
    return 'Lower quality means a smaller file. A quality of 60–80 is usually a good balance for photos.';
  }

  function describeReduction(originalBytes, newBytes) {
    if (originalBytes === 0) return { percent: 0, isReduction: true };
    const diff = originalBytes - newBytes;
    const percent = Math.abs((diff / originalBytes) * 100);
    return { percent, isReduction: diff >= 0 };
  }

  return { defaultOutputFormat, qualityHint, describeReduction };
})();
