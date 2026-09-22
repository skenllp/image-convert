/* ==========================================================================
   resizer.js
   Mode-specific behaviour for "Resize" — turns raw width/height inputs into
   the { targetWidth, targetHeight, lockAspect } shape ImageConvertCore
   expects, and keeps the two number fields in sync when aspect is locked.
   ========================================================================== */

const ResizerMode = (() => {

  /**
   * Given the field that just changed ('width' | 'height'), the new value,
   * the source dimensions, and whether aspect is locked, return the other
   * field's value (or null if it shouldn't be touched).
   */
  function syncDimension(changedField, newValue, srcWidth, srcHeight, lockAspect) {
    if (!lockAspect || !newValue || newValue <= 0) return null;
    const ratio = srcWidth / srcHeight;
    if (changedField === 'width') return Math.round(newValue / ratio);
    if (changedField === 'height') return Math.round(newValue * ratio);
    return null;
  }

  function validateDimensions(width, height) {
    if (!width || !height || width <= 0 || height <= 0) {
      return 'Enter a width and height greater than zero.';
    }
    if (width > 10000 || height > 10000) {
      return 'Dimensions above 10,000px are not supported in the browser.';
    }
    return null;
  }

  return { syncDimension, validateDimensions };
})();
