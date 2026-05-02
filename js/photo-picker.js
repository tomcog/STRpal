// Unified photo input: drag & drop, paste, file browse, or URL.
// Usage:
//   const picker = PhotoPicker.mount(containerEl, { initialUrl, label });
//   const url = await picker.resolve(); // uploads file if needed, returns URL or null
//
// getValue()  -> { file: File|null, url: string|null }
// resolve()   -> Promise<string|null>  (uploads file via uploadPhoto if needed)
// clear()     -> void
// destroy()   -> void

(function () {
  let _nextId = 0;

  // Prevent the browser from intercepting file drops anywhere on the page —
  // without this, a file dragged slightly outside a dropzone opens in a new tab
  // and can also suppress the drop event on the intended target.
  if (!window.__ppDocDragInstalled) {
    window.__ppDocDragInstalled = true;
    document.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
      }
    });
    document.addEventListener('drop', (e) => {
      if (!e.target.closest('[data-pp-drop]')) {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
          e.preventDefault();
        }
      }
    });
  }

  function _isHeic(file) {
    if (!file) return false;
    const t = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    return t === 'image/heic' || t === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif');
  }

  function _isPdfFile(file) {
    if (!file) return false;
    const t = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    return t === 'application/pdf' || name.endsWith('.pdf');
  }

  function _isPdfUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /\.pdf(\?.*)?$/i.test(url.trim());
  }

  function _urlFilename(url) {
    try {
      const clean = url.split('?')[0].split('#')[0];
      const parts = clean.split('/');
      return decodeURIComponent(parts[parts.length - 1] || 'document.pdf');
    } catch (e) { return 'document.pdf'; }
  }

  async function _normalizeImageFile(file) {
    if (!_isHeic(file)) return file;
    if (typeof heic2any === 'undefined') {
      throw new Error('HEIC conversion unavailable');
    }
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    const baseName = (file.name || 'photo').replace(/\.(heic|heif)$/i, '');
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  }

  class PhotoPicker {
    constructor(root, opts = {}) {
      this.root = root;
      this.label = opts.label || 'Photo';
      this.bucket = opts.bucket || 'photos';
      this.acceptPdf = opts.acceptPdf !== false;
      this._file = null;
      this._url = opts.initialUrl || null;
      this._id = `pp-${++_nextId}`;
      this._render();
      this._wire();
    }

    _render() {
      const hasPhoto = !!this._url;
      const initialIsPdf = hasPhoto && this.acceptPdf && _isPdfUrl(this._url);
      this.root.classList.add('photo-picker');
      const acceptAttr = this.acceptPdf
        ? '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.heic,.heif,.pdf,image/jpeg,image/png,image/gif,image/webp,image/bmp,image/svg+xml,image/heic,image/heif,application/pdf'
        : 'image/*';
      const captureAttr = this.acceptPdf ? '' : 'capture="environment"';
      const placeholderTitle = this.acceptPdf ? 'Drop, paste, or click' : 'Drop, paste, or click';
      const placeholderSub = this.acceptPdf ? 'to add a photo or PDF' : 'to add a photo';
      const urlPlaceholder = this.acceptPdf ? 'Or paste an image or PDF URL' : 'Or paste an image URL';
      this.root.innerHTML = `
        <div class="pp-dropzone" data-pp-drop tabindex="0" role="button" aria-label="${escapeHtml(this.label)}: drop, paste, or click to browse">
          <img class="pp-preview" data-pp-preview draggable="false" ${hasPhoto && !initialIsPdf ? '' : 'hidden'} src="${escapeHtml(!initialIsPdf ? (this._url || '') : '')}" alt="">
          <div class="pp-doc-preview" data-pp-doc-preview ${initialIsPdf ? '' : 'hidden'} style="pointer-events:none">
            <i data-lucide="file-text" class="icon-24"></i>
            <div class="pp-doc-name" data-pp-doc-name>${initialIsPdf ? escapeHtml(_urlFilename(this._url)) : ''}</div>
          </div>
          <div class="pp-placeholder" data-pp-placeholder ${hasPhoto ? 'hidden' : ''} style="pointer-events:none">
            <i data-lucide="image" class="icon-24"></i>
            <div class="pp-placeholder-text">
              <strong>${placeholderTitle}</strong>
              <span>${placeholderSub}</span>
            </div>
          </div>
          <button type="button" class="pp-clear" data-pp-clear aria-label="Remove attachment" ${hasPhoto ? '' : 'hidden'}>&times;</button>
        </div>
        <input type="file" id="${this._id}-file" data-pp-file accept="${acceptAttr}" ${captureAttr} hidden>
        <div class="pp-url-row">
          <input type="url" class="pp-url" data-pp-url placeholder="${urlPlaceholder}" value="${escapeHtml(typeof this._url === 'string' ? this._url : '')}">
        </div>
      `;

      this._els = {
        drop: this.root.querySelector('[data-pp-drop]'),
        preview: this.root.querySelector('[data-pp-preview]'),
        docPreview: this.root.querySelector('[data-pp-doc-preview]'),
        docName: this.root.querySelector('[data-pp-doc-name]'),
        placeholder: this.root.querySelector('[data-pp-placeholder]'),
        clear: this.root.querySelector('[data-pp-clear]'),
        file: this.root.querySelector('[data-pp-file]'),
        url: this.root.querySelector('[data-pp-url]'),
      };
      this._defaultPlaceholderHTML = this._els.placeholder.innerHTML;
      if (typeof refreshIcons === 'function') refreshIcons();
    }

    _wire() {
      const { drop, file, url, clear } = this._els;

      drop.addEventListener('click', (e) => {
        if (e.target.closest('[data-pp-clear]')) return;
        file.click();
      });
      drop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
      });

      file.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) this._setFile(f);
      });

      ['dragenter', 'dragover'].forEach(ev => {
        drop.addEventListener(ev, (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
          drop.classList.add('pp-dragging');
        });
      });
      drop.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.relatedTarget && drop.contains(e.relatedTarget)) return;
        drop.classList.remove('pp-dragging');
      });
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.remove('pp-dragging');
        const dt = e.dataTransfer;
        if (!dt) return;
        const f = dt.files && dt.files[0];
        if (f && (f.type.startsWith('image/') || _isHeic(f) || (this.acceptPdf && _isPdfFile(f)))) { this._setFile(f); return; }
        const txt = dt.getData('text/uri-list') || dt.getData('text/plain');
        if (txt && /^https?:\/\//i.test(txt.trim())) this._setUrl(txt.trim());
      });

      this._pasteHandler = (e) => {
        if (!this.root.isConnected) return;
        if (!this.root.contains(document.activeElement) && document.activeElement !== document.body) return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
          const isImg = item.kind === 'file' && item.type.startsWith('image/');
          const isPdf = this.acceptPdf && item.kind === 'file' && item.type === 'application/pdf';
          if (isImg || isPdf) {
            const f = item.getAsFile();
            if (f) { this._setFile(f); e.preventDefault(); return; }
          }
        }
        const text = e.clipboardData.getData('text');
        const urlRe = this.acceptPdf
          ? /^https?:\/\/.+\.(png|jpe?g|gif|webp|bmp|svg|pdf)(\?.*)?$/i
          : /^https?:\/\/.+\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
        if (text && urlRe.test(text.trim())) {
          this._setUrl(text.trim());
        }
      };
      document.addEventListener('paste', this._pasteHandler);

      url.addEventListener('change', () => {
        const v = url.value.trim();
        if (!v) { this._setUrl(null); return; }
        this._setUrl(v);
      });

      clear.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clear();
      });
    }

    async _setFile(file) {
      this._file = file;
      this._url = null;
      this._els.url.value = '';
      this._els.clear.hidden = false;

      if (this.acceptPdf && _isPdfFile(file)) {
        this._els.preview.hidden = true;
        this._els.preview.src = '';
        this._els.placeholder.hidden = true;
        this._els.docName.textContent = file.name || 'document.pdf';
        this._els.docPreview.hidden = false;
        if (typeof refreshIcons === 'function') refreshIcons();
        return;
      }

      // Show an image preview immediately (even for HEIC, though it'll render blank on Chrome).
      this._els.docPreview.hidden = true;
      this._els.preview.hidden = false;
      this._els.placeholder.hidden = true;

      if (_isHeic(file)) {
        this._els.preview.src = '';
        this._els.placeholder.hidden = false;
        this._els.placeholder.innerHTML = '<div class="pp-placeholder-text"><strong>Converting HEIC…</strong></div>';
        try {
          const converted = await _normalizeImageFile(file);
          this._file = converted;
          this._els.preview.src = URL.createObjectURL(converted);
          this._els.placeholder.hidden = true;
          this._els.preview.hidden = false;
        } catch (err) {
          console.error('HEIC conversion failed:', err);
          this._els.placeholder.innerHTML = '<div class="pp-placeholder-text"><strong>Couldn\'t convert HEIC</strong><span>Try a JPG/PNG</span></div>';
          this._file = null;
          this._els.clear.hidden = true;
        }
        return;
      }

      this._els.preview.src = URL.createObjectURL(file);
    }

    _setUrl(url) {
      this._file = null;
      this._url = url;
      if (url) {
        this._els.url.value = url;
        if (this.acceptPdf && _isPdfUrl(url)) {
          this._els.preview.hidden = true;
          this._els.preview.src = '';
          this._els.placeholder.hidden = true;
          this._els.docName.textContent = _urlFilename(url);
          this._els.docPreview.hidden = false;
          if (typeof refreshIcons === 'function') refreshIcons();
        } else {
          this._els.docPreview.hidden = true;
          this._els.preview.src = url;
          this._els.preview.hidden = false;
          this._els.placeholder.hidden = true;
        }
        this._els.clear.hidden = false;
      } else {
        this._els.preview.src = '';
        this._els.preview.hidden = true;
        this._els.docPreview.hidden = true;
        this._els.placeholder.hidden = false;
        this._els.clear.hidden = true;
      }
    }

    clear() {
      this._file = null;
      this._url = null;
      this._els.file.value = '';
      this._els.url.value = '';
      this._els.preview.src = '';
      this._els.preview.hidden = true;
      this._els.docPreview.hidden = true;
      this._els.docName.textContent = '';
      this._els.placeholder.hidden = false;
      if (this._defaultPlaceholderHTML) this._els.placeholder.innerHTML = this._defaultPlaceholderHTML;
      this._els.clear.hidden = true;
    }

    getValue() {
      return { file: this._file, url: this._url };
    }

    async resolve() {
      if (this._file) return await uploadPhoto(this.bucket, this._file);
      return this._url || null;
    }

    destroy() {
      if (this._pasteHandler) document.removeEventListener('paste', this._pasteHandler);
    }

    static mount(elOrId, opts) {
      const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
      if (!el) return null;
      return new PhotoPicker(el, opts);
    }
  }

  window.PhotoPicker = PhotoPicker;
})();
