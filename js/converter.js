/* ==========================================================================
   converter.js
   Core, format-agnostic image processing built on the Canvas API.
   Every other module (compressor.js, resizer.js, app.js) calls into these
   functions rather than touching the canvas directly.
   ========================================================================== */

const ImageConvertCore = (() => {

  const SUPPORTED_OUTPUT = ['image/jpeg', 'image/png', 'image/webp'];
  const SUPPORTED_INPUT_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
  const MAX_RECOMMENDED_PIXELS = 40_000_000; // ~40MP before we warn about memory

  /** Feature-detect real WebP encode support (not just decode). */
  let _webpEncodeSupport = null;
  function supportsWebpEncode() {
    if (_webpEncodeSupport !== null) return _webpEncodeSupport;
    try {
      const c = document.createElement('canvas');
      c.width = 1; c.height = 1;
      const dataUrl = c.toDataURL('image/webp');
      _webpEncodeSupport = dataUrl.startsWith('data:image/webp');
    } catch (e) {
      _webpEncodeSupport = false;
    }
    return _webpEncodeSupport;
  }

  function formatLabel(mimeType) {
    const map = {
      'image/jpeg': 'JPG', 'image/jpg': 'JPG', 'image/png': 'PNG',
      'image/webp': 'WebP', 'image/gif': 'GIF', 'image/bmp': 'BMP'
    };
    return map[mimeType] || (mimeType || 'Unknown').split('/').pop().toUpperCase();
  }

  function extensionFor(mimeType) {
    const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    return map[mimeType] || 'img';
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(kb < 10 ? 2 : 1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  }

  /** Strip a filename to a safe base (no path separators, no control chars). */
  function sanitizeBaseName(name) {
    const withoutExt = name.replace(/\.[^./\\]+$/, '');
    return withoutExt
      .replace(/[\/\\]/g, '-')
      .replace(/[\u0000-\u001f]/g, '')
      .trim() || 'image';
  }

  function buildOutputFilename(originalName, mimeType) {
    const base = sanitizeBaseName(originalName);
    return `${base}.${extensionFor(mimeType)}`;
  }

  function isSupportedInputFile(file) {
    if (!file || !file.type) {
      // Some OSes omit MIME type for e.g. .webp — fall back to extension.
      const ext = (file && file.name || '').split('.').pop().toLowerCase();
      return SUPPORTED_INPUT_EXT.includes(ext);
    }
    return file.type.startsWith('image/');
  }

  /**
   * Load a File into an <img>, returning natural dimensions and an object URL.
   * Caller is responsible for calling revokeObjectURL(url) when done.
   */
  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file provided.'));
      if (!isSupportedInputFile(file)) {
        return reject(new Error('Unsupported file type.'));
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) {
          URL.revokeObjectURL(url);
          reject(new Error('Corrupted or empty image.'));
          return;
        }
        resolve({ img, url, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('We couldn\'t read this image. It may be corrupted or in an unsupported format.'));
      };
      img.src = url;
    });
  }

  /**
   * Sample the alpha channel of an image to see if it has any real transparency.
   * Downscales to a small canvas first so this stays cheap on large images.
   */
  function detectTransparency(img, width, height) {
    try {
      const sampleSize = 64;
      const c = document.createElement('canvas');
      c.width = sampleSize; c.height = sampleSize;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
      const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) return true;
      }
      return false;
    } catch (e) {
      // Cross-origin or tainted canvas — assume transparency may be present.
      return true;
    }
  }

  /**
   * Compute output dimensions given optional resize targets and aspect lock.
   */
  function computeDimensions(srcWidth, srcHeight, opts) {
    if (!opts || !opts.resize) return { width: srcWidth, height: srcHeight };
    let { targetWidth, targetHeight, lockAspect } = opts;
    const ratio = srcWidth / srcHeight;

    targetWidth = targetWidth && targetWidth > 0 ? Math.round(targetWidth) : null;
    targetHeight = targetHeight && targetHeight > 0 ? Math.round(targetHeight) : null;

    if (lockAspect) {
      if (targetWidth && !targetHeight) targetHeight = Math.round(targetWidth / ratio);
      else if (targetHeight && !targetWidth) targetWidth = Math.round(targetHeight * ratio);
      else if (targetWidth && targetHeight) targetHeight = Math.round(targetWidth / ratio);
    }

    return {
      width: targetWidth || srcWidth,
      height: targetHeight || srcHeight
    };
  }

  /**
   * Draw a loaded image onto a canvas at the given size, filling transparent
   * areas with bgColor when the target format cannot carry alpha.
   */
  function drawToCanvas(img, { width, height, mimeType, bgColor }) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (mimeType === 'image/jpeg') {
      ctx.fillStyle = bgColor || '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  }

  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
      const useQuality = (mimeType === 'image/jpeg' || mimeType === 'image/webp');
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Conversion failed for this format in your browser.'));
            return;
          }
          resolve(blob);
        },
        mimeType,
        useQuality ? Math.min(1, Math.max(0.1, quality / 100)) : undefined
      );
    });
  }

  /**
   * Full pipeline: load (already-loaded) image -> optional resize -> encode.
   * `loaded` is the result of loadImageFile(). Returns { blob, width, height }.
   */
  async function convertLoadedImage(loaded, options) {
    const { img, width: srcWidth, height: srcHeight } = loaded;
    const mimeType = options.mimeType;

    if (!SUPPORTED_OUTPUT.includes(mimeType)) {
      throw new Error('That output format isn\'t supported yet.');
    }
    if (mimeType === 'image/webp' && !supportsWebpEncode()) {
      throw new Error('Your browser can\'t create WebP files. Try Chrome, Edge or Firefox, or choose a different format.');
    }

    const { width, height } = computeDimensions(srcWidth, srcHeight, options);

    if (width * height > MAX_RECOMMENDED_PIXELS) {
      throw new Error('This image is too large to process reliably in the browser. Try a smaller image or reduce the target dimensions.');
    }

    const canvas = drawToCanvas(img, { width, height, mimeType, bgColor: options.bgColor });
    const blob = await canvasToBlob(canvas, mimeType, options.quality ?? 80);
    return { blob, width, height };
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    SUPPORTED_OUTPUT,
    MAX_RECOMMENDED_PIXELS,
    supportsWebpEncode,
    formatLabel,
    extensionFor,
    formatBytes,
    buildOutputFilename,
    isSupportedInputFile,
    loadImageFile,
    detectTransparency,
    computeDimensions,
    drawToCanvas,
    canvasToBlob,
    convertLoadedImage,
    triggerDownload
  };
})();
