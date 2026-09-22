/* ==========================================================================
   app.js
   Wires the DOM to ImageConvertCore / CompressorMode / ResizerMode / UI.
   Owns the only piece of application state: the list of selected files.
   ========================================================================== */

(() => {
  const LARGE_FILE_WARN_BYTES = 20 * 1024 * 1024; // 20MB

  const els = {
    dropzone: document.getElementById('dropzone'),
    chooseBtn: document.getElementById('chooseBtn'),
    fileInput: document.getElementById('fileInput'),

    singlePreviewArea: document.getElementById('singlePreviewArea'),
    previewImg: document.getElementById('previewImg'),
    metaName: document.getElementById('metaName'),
    metaFormat: document.getElementById('metaFormat'),
    metaSize: document.getElementById('metaSize'),
    metaDims: document.getElementById('metaDims'),

    resultArea: document.getElementById('resultArea'),
    resultImg: document.getElementById('resultImg'),
    statOriginal: document.getElementById('statOriginal'),
    statConverted: document.getElementById('statConverted'),
    statDims: document.getElementById('statDims'),
    statReduction: document.getElementById('statReduction'),
    downloadBtn: document.getElementById('downloadBtn'),

    multiArea: document.getElementById('multiArea'),
    fileList: document.getElementById('fileList'),
    convertAllBtn: document.getElementById('convertAllBtn'),
    downloadAllBtn: document.getElementById('downloadAllBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),

    transparencyNotice: document.getElementById('transparencyNotice'),
    formatField: document.getElementById('formatField'),
    outputFormat: document.getElementById('outputFormat'),
    bgField: document.getElementById('bgField'),
    customColor: document.getElementById('customColor'),
    qualityField: document.getElementById('qualityField'),
    qualitySlider: document.getElementById('qualitySlider'),
    qualityValue: document.getElementById('qualityValue'),
    qualityHint: document.getElementById('qualityHint'),
    resizeToggleField: document.getElementById('resizeToggleField'),
    resizeToggle: document.getElementById('resizeToggle'),
    resizeFields: document.getElementById('resizeFields'),
    widthInput: document.getElementById('widthInput'),
    heightInput: document.getElementById('heightInput'),
    aspectLock: document.getElementById('aspectLock'),
    convertBtn: document.getElementById('convertBtn'),
    toolHeading: document.getElementById('toolHeading'),
    toolSub: document.getElementById('toolSub'),
  };

  const state = {
    mode: 'convert',        // 'convert' | 'compress' | 'resize'
    files: [],              // [{ id, file, loaded, hasAlpha, status, resultBlob, resultName, resultDims, errorMsg }]
    bgColor: '#ffffff',
    nextId: 1,
  };

  const MODE_COPY = {
    convert: { heading: 'Image Converter', sub: 'Convert PNG, JPG and WebP files. Everything happens on your device.', btn: 'Convert Image' },
    compress: { heading: 'Compress Image', sub: 'Reduce file size while keeping the original format.', btn: 'Compress Image' },
    resize: { heading: 'Resize Image', sub: 'Set exact pixel dimensions before exporting.', btn: 'Resize Image' },
  };

  /* ---------------------------------------------------------------------
     Mode switching
     --------------------------------------------------------------------- */

  function setMode(mode) {
    state.mode = mode;
    const copy = MODE_COPY[mode];
    els.toolHeading.textContent = copy.heading;
    els.toolSub.textContent = copy.sub;
    els.convertBtn.textContent = copy.btn;

    // Reset selection when switching modes to avoid mismatched multi/single state.
    resetAllFiles();

    els.formatField.hidden = (mode === 'compress');
    els.resizeToggleField.hidden = (mode !== 'convert');
    els.resizeFields.hidden = (mode !== 'resize');
    if (mode === 'resize') {
      els.resizeToggle.checked = true;
    } else if (mode === 'convert') {
      els.resizeToggle.checked = false;
      els.resizeFields.hidden = true;
    }

    updateFormatDependentUI();
  }

  /* ---------------------------------------------------------------------
     Field visibility that depends on the chosen output format
     --------------------------------------------------------------------- */

  function currentOutputFormat() {
    if (state.mode === 'compress' && state.files[0]) {
      return CompressorMode.defaultOutputFormat(state.files[0].file.type);
    }
    return els.outputFormat.value;
  }

  function updateFormatDependentUI() {
    const fmt = currentOutputFormat();
    const isJpg = fmt === 'image/jpeg';

    els.qualityHint.textContent = (state.mode === 'compress')
      ? CompressorMode.qualityHint(fmt)
      : (fmt === 'image/png'
        ? 'PNG is generally lossless — this setting may not noticeably change file size.'
        : 'Lower quality means a smaller file. 80% is a good default for photos.');

    const anyAlpha = state.files.some(f => f.hasAlpha);
    els.bgField.hidden = !(isJpg && state.files.length > 0);
    els.transparencyNotice.hidden = !(isJpg && anyAlpha);
  }

  /* ---------------------------------------------------------------------
     File intake (drag/drop, picker, validation)
     --------------------------------------------------------------------- */

  function resetAllFiles() {
    state.files.forEach(f => { if (f.loaded) URL.revokeObjectURL(f.loaded.url); });
    state.files = [];
    els.singlePreviewArea.hidden = true;
    els.multiArea.hidden = true;
    els.resultArea.hidden = true;
    els.dropzone.hidden = false;
    els.convertBtn.disabled = true;
    els.convertBtn.hidden = false;
    els.fileInput.value = '';
    els.fileList.innerHTML = '';
    els.downloadAllBtn.hidden = true;
  }

  async function handleFiles(fileListRaw) {
    const incoming = Array.from(fileListRaw || []);
    if (incoming.length === 0) return;

    const valid = [];
    for (const file of incoming) {
      if (!ImageConvertCore.isSupportedInputFile(file)) {
        UI.showToast(`"${file.name}" isn't a supported image type.`, 'error');
        continue;
      }
      if (file.size === 0) {
        UI.showToast(`"${file.name}" is empty and can't be processed.`, 'error');
        continue;
      }
      if (file.size > LARGE_FILE_WARN_BYTES) {
        UI.showToast(`"${file.name}" is large (${ImageConvertCore.formatBytes(file.size)}) — processing may take a moment.`);
      }
      valid.push(file);
    }
    if (valid.length === 0) return;

    const restrictToOne = state.mode !== 'convert';
    if (restrictToOne && (valid.length > 1 || state.files.length >= 1)) {
      if (valid.length > 1) UI.showToast('Compress and resize handle one image at a time — using the first file.');
      resetAllFiles();
      await addFile(valid[0]);
    } else {
      for (const file of valid) {
        await addFile(file);
      }
    }
    render();
  }

  async function addFile(file) {
    const entry = {
      id: state.nextId++,
      file,
      loaded: null,
      hasAlpha: false,
      status: 'pending',
      resultBlob: null,
      resultName: null,
      resultDims: null,
      errorMsg: null,
    };
    try {
      entry.loaded = await ImageConvertCore.loadImageFile(file);
      entry.hasAlpha = ImageConvertCore.detectTransparency(entry.loaded.img, entry.loaded.width, entry.loaded.height);
    } catch (err) {
      entry.status = 'error';
      entry.errorMsg = 'We couldn\'t process this image. Please try another image or format.';
      UI.showToast(entry.errorMsg, 'error');
    }
    state.files.push(entry);

    if (state.mode === 'resize' && entry.loaded) {
      els.widthInput.value = entry.loaded.width;
      els.heightInput.value = entry.loaded.height;
    }
  }

  function removeFile(id) {
    const entry = state.files.find(f => f.id === id);
    if (entry && entry.loaded) URL.revokeObjectURL(entry.loaded.url);
    state.files = state.files.filter(f => f.id !== id);
    render();
  }

  /* ---------------------------------------------------------------------
     Rendering
     --------------------------------------------------------------------- */

  function render() {
    updateFormatDependentUI();

    if (state.files.length === 0) {
      els.dropzone.hidden = false;
      els.singlePreviewArea.hidden = true;
      els.multiArea.hidden = true;
      els.convertBtn.disabled = true;
      return;
    }

    els.dropzone.hidden = false; // keep visible so more files can be added
    els.convertBtn.disabled = false;

    if (state.mode !== 'convert' || state.files.length === 1) {
      els.multiArea.hidden = true;
      els.convertBtn.hidden = false;
      renderSingle(state.files[0]);
    } else {
      els.singlePreviewArea.hidden = true;
      els.convertBtn.hidden = true; // batch mode uses "Convert All" instead
      renderMulti();
    }
  }

  function renderSingle(entry) {
    els.singlePreviewArea.hidden = false;
    if (!entry.loaded) {
      els.metaName.textContent = entry.file.name;
      els.metaFormat.textContent = '—';
      els.metaSize.textContent = ImageConvertCore.formatBytes(entry.file.size);
      els.metaDims.textContent = '—';
      els.resultArea.hidden = true;
      return;
    }
    els.previewImg.src = entry.loaded.url;
    els.metaName.textContent = entry.file.name;
    els.metaFormat.textContent = ImageConvertCore.formatLabel(entry.file.type);
    els.metaSize.textContent = ImageConvertCore.formatBytes(entry.file.size);
    els.metaDims.textContent = `${entry.loaded.width} × ${entry.loaded.height}`;

    if (entry.resultBlob) {
      renderResult(entry);
    } else {
      els.resultArea.hidden = true;
    }
  }

  function renderResult(entry) {
    els.resultArea.hidden = false;
    els.resultImg.src = URL.createObjectURL(entry.resultBlob);
    els.statOriginal.textContent = ImageConvertCore.formatBytes(entry.file.size);
    els.statConverted.textContent = ImageConvertCore.formatBytes(entry.resultBlob.size);
    els.statDims.textContent = `${entry.resultDims.width} × ${entry.resultDims.height}`;

    const { percent, isReduction } = CompressorMode.describeReduction(entry.file.size, entry.resultBlob.size);
    els.statReduction.textContent = `${isReduction ? '-' : '+'}${percent.toFixed(1)}%`;
    els.statReduction.classList.toggle('increase', !isReduction);

    els.downloadBtn.onclick = (e) => {
      e.preventDefault();
      ImageConvertCore.triggerDownload(entry.resultBlob, entry.resultName);
    };
  }

  function renderMulti() {
    els.multiArea.hidden = false;
    els.fileList.innerHTML = '';
    state.files.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'file-row';

      const img = document.createElement('img');
      img.src = entry.loaded ? entry.loaded.url : '';
      img.alt = '';

      const name = document.createElement('div');
      name.className = 'fname';
      name.textContent = entry.file.name; // textContent only — never innerHTML with user data

      const size = document.createElement('div');
      size.className = 'fsize';
      size.textContent = ImageConvertCore.formatBytes(entry.file.size);

      const format = document.createElement('div');
      format.className = 'fformat mono';
      format.textContent = entry.loaded ? ImageConvertCore.formatLabel(entry.file.type) : '—';

      const status = document.createElement('div');
      status.className = 'fstatus';
      const statusText = { pending: 'Ready', converting: 'Converting…', done: 'Done', error: 'Error' }[entry.status];
      status.textContent = statusText;
      status.classList.toggle('status-done', entry.status === 'done');
      status.classList.toggle('status-error', entry.status === 'error');

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove';
      removeBtn.setAttribute('aria-label', `Remove ${entry.file.name}`);
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => removeFile(entry.id));

      li.append(img, name, format, size, status, removeBtn);
      els.fileList.appendChild(li);
    });

    els.downloadAllBtn.hidden = !state.files.some(f => f.status === 'done');
  }

  /* ---------------------------------------------------------------------
     Settings gathering
     --------------------------------------------------------------------- */

  function gatherSettings(sourceEntry) {
    const mode = state.mode;
    const mimeType = (mode === 'compress')
      ? CompressorMode.defaultOutputFormat(sourceEntry.file.type)
      : els.outputFormat.value;

    const quality = parseInt(els.qualitySlider.value, 10);
    const bgColor = state.bgColor;

    let resize = false, targetWidth = null, targetHeight = null, lockAspect = els.aspectLock.checked;
    if (mode === 'resize') {
      resize = true;
      targetWidth = parseInt(els.widthInput.value, 10) || null;
      targetHeight = parseInt(els.heightInput.value, 10) || null;
    } else if (mode === 'convert' && els.resizeToggle.checked) {
      resize = true;
      targetWidth = parseInt(els.widthInput.value, 10) || null;
      targetHeight = parseInt(els.heightInput.value, 10) || null;
    }

    return { mimeType, quality, bgColor, resize, targetWidth, targetHeight, lockAspect };
  }

  /* ---------------------------------------------------------------------
     Conversion actions
     --------------------------------------------------------------------- */

  async function convertEntry(entry, settings) {
    if (!entry.loaded) throw new Error('Image not loaded.');

    if (settings.resize) {
      const err = ResizerMode.validateDimensions(
        settings.targetWidth || entry.loaded.width,
        settings.targetHeight || entry.loaded.height
      );
      if (err) throw new Error(err);
    }

    const { blob, width, height } = await ImageConvertCore.convertLoadedImage(entry.loaded, settings);
    entry.resultBlob = blob;
    entry.resultDims = { width, height };
    entry.resultName = ImageConvertCore.buildOutputFilename(entry.file.name, settings.mimeType);
    entry.status = 'done';
  }

  async function onConvertClick() {
    if (state.files.length === 0) return;
    els.convertBtn.disabled = true;
    const originalLabel = els.convertBtn.textContent;
    els.convertBtn.innerHTML = `<span class="loader-inline"></span> Working…`;

    const entry = state.files[0];
    try {
      const settings = gatherSettings(entry);
      await convertEntry(entry, settings);
      renderSingle(entry);
    } catch (err) {
      entry.status = 'error';
      UI.showToast(err.message || 'We couldn\'t process this image. Please try another image or format.', 'error');
    } finally {
      els.convertBtn.disabled = false;
      els.convertBtn.textContent = originalLabel;
    }
  }

  async function onConvertAllClick() {
    if (state.files.length === 0) return;
    els.convertAllBtn.disabled = true;
    els.convertAllBtn.innerHTML = `<span class="loader-inline"></span> Converting…`;

    for (const entry of state.files) {
      entry.status = 'converting';
      renderMulti();
      try {
        const settings = gatherSettings(entry);
        await convertEntry(entry, settings);
      } catch (err) {
        entry.status = 'error';
        entry.errorMsg = err.message || 'Conversion failed.';
      }
      renderMulti();
    }

    els.convertAllBtn.disabled = false;
    els.convertAllBtn.textContent = 'Convert All';

    const failed = state.files.filter(f => f.status === 'error').length;
    if (failed > 0) {
      UI.showToast(`${failed} image${failed > 1 ? 's' : ''} couldn't be converted.`, 'error');
    }
  }

  async function onDownloadAllClick() {
    const done = state.files.filter(f => f.status === 'done' && f.resultBlob);
    if (done.length === 0) return;
    if (typeof JSZip === 'undefined') {
      UI.showToast('ZIP download isn\'t available right now. Try downloading images individually.', 'error');
      return;
    }
    els.downloadAllBtn.disabled = true;
    try {
      const zip = new JSZip();
      const usedNames = new Set();
      done.forEach(entry => {
        let name = entry.resultName;
        let i = 1;
        while (usedNames.has(name)) {
          const dot = entry.resultName.lastIndexOf('.');
          name = `${entry.resultName.slice(0, dot)}-${i}${entry.resultName.slice(dot)}`;
          i++;
        }
        usedNames.add(name);
        zip.file(name, entry.resultBlob);
      });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      ImageConvertCore.triggerDownload(zipBlob, 'converted-images.zip');
    } catch (err) {
      UI.showToast('We couldn\'t build the ZIP file. Try downloading images individually.', 'error');
    } finally {
      els.downloadAllBtn.disabled = false;
    }
  }

  /* ---------------------------------------------------------------------
     Event wiring
     --------------------------------------------------------------------- */

  function initEvents() {
    els.chooseBtn.addEventListener('click', () => els.fileInput.click());
    els.dropzone.addEventListener('click', (e) => {
      if (e.target === els.chooseBtn) return;
      els.fileInput.click();
    });
    els.dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
    });
    els.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    ['dragenter', 'dragover'].forEach(evt =>
      els.dropzone.addEventListener(evt, (e) => { e.preventDefault(); els.dropzone.classList.add('drag-over'); })
    );
    ['dragleave', 'drop'].forEach(evt =>
      els.dropzone.addEventListener(evt, (e) => { e.preventDefault(); els.dropzone.classList.remove('drag-over'); })
    );
    els.dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));

    els.outputFormat.addEventListener('change', () => { updateFormatDependentUI(); });

    els.qualitySlider.addEventListener('input', () => {
      els.qualityValue.textContent = els.qualitySlider.value;
    });

    els.resizeToggle.addEventListener('change', () => {
      els.resizeFields.hidden = !els.resizeToggle.checked;
      if (els.resizeToggle.checked && state.files[0] && state.files[0].loaded) {
        els.widthInput.value = state.files[0].loaded.width;
        els.heightInput.value = state.files[0].loaded.height;
      }
    });

    els.widthInput.addEventListener('input', () => {
      const ref = state.files[0] && state.files[0].loaded;
      if (!ref) return;
      const synced = ResizerMode.syncDimension('width', parseInt(els.widthInput.value, 10), ref.width, ref.height, els.aspectLock.checked);
      if (synced !== null) els.heightInput.value = synced;
    });
    els.heightInput.addEventListener('input', () => {
      const ref = state.files[0] && state.files[0].loaded;
      if (!ref) return;
      const synced = ResizerMode.syncDimension('height', parseInt(els.heightInput.value, 10), ref.width, ref.height, els.aspectLock.checked);
      if (synced !== null) els.widthInput.value = synced;
    });

    document.querySelectorAll('.color-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-opt').forEach(b => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        state.bgColor = btn.dataset.color;
        els.customColor.value = btn.dataset.color;
      });
    });
    els.customColor.addEventListener('input', () => {
      document.querySelectorAll('.color-opt').forEach(b => b.setAttribute('aria-pressed', 'false'));
      state.bgColor = els.customColor.value;
    });

    els.convertBtn.addEventListener('click', onConvertClick);
    els.convertAllBtn.addEventListener('click', onConvertAllClick);
    els.downloadAllBtn.addEventListener('click', onDownloadAllClick);
    els.clearAllBtn.addEventListener('click', resetAllFiles);
  }

  /* ---------------------------------------------------------------------
     Init
     --------------------------------------------------------------------- */

  function init() {
    UI.initNavToggle();
    UI.initFaq();
    UI.initModeTabs(setMode);
    initEvents();
    setMode('convert');

    if (!ImageConvertCore.supportsWebpEncode()) {
      const opt = els.outputFormat.querySelector('option[value="image/webp"]');
      if (opt) { opt.disabled = true; opt.textContent = 'WebP (not supported in this browser)'; }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
