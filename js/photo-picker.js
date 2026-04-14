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

  class PhotoPicker {
    constructor(root, opts = {}) {
      this.root = root;
      this.label = opts.label || 'Photo';
      this.bucket = opts.bucket || 'photos';
      this._file = null;
      this._url = opts.initialUrl || null;
      this._id = `pp-${++_nextId}`;
      this._render();
      this._wire();
    }

    _render() {
      const hasPhoto = !!this._url;
      this.root.classList.add('photo-picker');
      this.root.innerHTML = `
        <div class="pp-dropzone" data-pp-drop tabindex="0" role="button" aria-label="${escapeHtml(this.label)}: drop, paste, or click to browse">
          <img class="pp-preview" data-pp-preview ${hasPhoto ? '' : 'hidden'} src="${escapeHtml(this._url || '')}" alt="">
          <div class="pp-placeholder" data-pp-placeholder ${hasPhoto ? 'hidden' : ''}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            <div class="pp-placeholder-text">
              <strong>Drop, paste, or click</strong>
              <span>to add a photo</span>
            </div>
          </div>
          <button type="button" class="pp-clear" data-pp-clear aria-label="Remove photo" ${hasPhoto ? '' : 'hidden'}>&times;</button>
        </div>
        <input type="file" id="${this._id}-file" data-pp-file accept="image/*" capture="environment" hidden>
        <div class="pp-url-row">
          <input type="url" class="pp-url" data-pp-url placeholder="Or paste an image URL" value="${escapeHtml(typeof this._url === 'string' ? this._url : '')}">
        </div>
      `;

      this._els = {
        drop: this.root.querySelector('[data-pp-drop]'),
        preview: this.root.querySelector('[data-pp-preview]'),
        placeholder: this.root.querySelector('[data-pp-placeholder]'),
        clear: this.root.querySelector('[data-pp-clear]'),
        file: this.root.querySelector('[data-pp-file]'),
        url: this.root.querySelector('[data-pp-url]'),
      };
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
          drop.classList.add('pp-dragging');
        });
      });
      ['dragleave', 'drop'].forEach(ev => {
        drop.addEventListener(ev, (e) => {
          e.preventDefault();
          e.stopPropagation();
          drop.classList.remove('pp-dragging');
        });
      });
      drop.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (!dt) return;
        const f = dt.files && dt.files[0];
        if (f && f.type.startsWith('image/')) { this._setFile(f); return; }
        const txt = dt.getData('text/uri-list') || dt.getData('text/plain');
        if (txt && /^https?:\/\//i.test(txt.trim())) this._setUrl(txt.trim());
      });

      this._pasteHandler = (e) => {
        if (!this.root.isConnected) return;
        if (!this.root.contains(document.activeElement) && document.activeElement !== document.body) return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const f = item.getAsFile();
            if (f) { this._setFile(f); e.preventDefault(); return; }
          }
        }
        const text = e.clipboardData.getData('text');
        if (text && /^https?:\/\/.+\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(text.trim())) {
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

    _setFile(file) {
      this._file = file;
      this._url = null;
      this._els.url.value = '';
      this._els.preview.src = URL.createObjectURL(file);
      this._els.preview.hidden = false;
      this._els.placeholder.hidden = true;
      this._els.clear.hidden = false;
    }

    _setUrl(url) {
      this._file = null;
      this._url = url;
      if (url) {
        this._els.url.value = url;
        this._els.preview.src = url;
        this._els.preview.hidden = false;
        this._els.placeholder.hidden = true;
        this._els.clear.hidden = false;
      } else {
        this._els.preview.src = '';
        this._els.preview.hidden = true;
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
      this._els.placeholder.hidden = false;
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
