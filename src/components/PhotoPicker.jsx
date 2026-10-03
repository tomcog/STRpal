import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { FileText, ImagePlus, X } from 'lucide-react';
import { uploadPhoto } from '../lib/supabase.js';
import './PhotoPicker.css';

/**
 * Unified photo/PDF input: drag & drop, paste, click to browse, or a pasted URL.
 *
 *   const picker = useRef();
 *   <PhotoPicker ref={picker} label="Invoice" initialUrl={url} showUrl={false} />
 *   const url = await picker.current.resolve(); // uploads if needed -> URL | null
 *
 * Ref API: resolve(), clear(), getValue() -> { file, url }, setUrl(url).
 * Once something is attached it must be removed (x) before another can be added.
 * Images are re-encoded to JPEG at most 1000px on the long edge before upload.
 */

const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.heic,.heif,image/jpeg,image/png,image/gif,image/webp,image/bmp,image/svg+xml,image/heic,image/heif';
const PDF_ACCEPT = ',.pdf,application/pdf';

function isHeic(file) {
  const t = (file?.type || '').toLowerCase();
  const name = (file?.name || '').toLowerCase();
  return t === 'image/heic' || t === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif');
}

function isPdfFile(file) {
  const t = (file?.type || '').toLowerCase();
  return t === 'application/pdf' || (file?.name || '').toLowerCase().endsWith('.pdf');
}

function isPdfUrl(url) {
  return typeof url === 'string' && /\.pdf(\?.*)?$/i.test(url.trim());
}

function urlFilename(url) {
  try {
    const parts = url.split('?')[0].split('#')[0].split('/');
    return decodeURIComponent(parts[parts.length - 1] || 'document.pdf');
  } catch { return 'document.pdf'; }
}

async function heicToJpeg(file) {
  const { default: heic2any } = await import('heic2any');
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const baseName = (file.name || 'photo').replace(/\.(heic|heif)$/i, '');
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

// Downscale raster images to max 1000px on the longest edge and re-encode as JPEG q0.75.
// Skips PDFs, SVGs, and anything we can't decode (returns the original file).
async function compressImage(file) {
  if (!file || isPdfFile(file)) return file;
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (type === 'image/svg+xml' || name.endsWith('.svg')) return file;
  if (!type.startsWith('image/') && !isHeic(file)) return file;

  const MAX_EDGE = 1000;
  const QUALITY = 0.75;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // JPEG has no alpha - fill white so transparent PNGs don't turn black
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', QUALITY));
  if (!blob) return file;
  const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

// Render page 1 of a PDF (File or URL) to an object URL. PDF.js (~1MB) is a
// separate chunk, fetched the first time a PDF needs a thumbnail.
async function renderPdfThumb(source) {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const params = source instanceof Blob ? { data: new Uint8Array(await source.arrayBuffer()) } : { url: source };
  const doc = await pdfjs.getDocument(params).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 600 / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('PDF thumbnail encode failed');
    return URL.createObjectURL(blob);
  } finally {
    doc.destroy();
  }
}

export const PhotoPicker = forwardRef(function PhotoPicker(
  { label = 'Photo', initialUrl = null, acceptPdf = true, showUrl = true, bucket = 'photos', onChange },
  ref,
) {
  const id = useId();
  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [url, setUrlState] = useState(initialUrl || null);
  const [previewSrc, setPreviewSrc] = useState(initialUrl && !isPdfUrl(initialUrl) ? initialUrl : null);
  const [pdfName, setPdfName] = useState(initialUrl && isPdfUrl(initialUrl) ? urlFilename(initialUrl) : null);
  const [pdfThumb, setPdfThumb] = useState(null);
  const [status, setStatus] = useState(null); // 'converting' | 'heic-failed' | null
  const [dragging, setDragging] = useState(false);
  const [urlText, setUrlText] = useState(initialUrl || '');

  // Latest values for the imperative API and document-level paste handler
  const stateRef = useRef({ file, url });
  stateRef.current = { file, url };
  const filled = !!(file || url);

  // Object URLs we created, revoked when replaced or unmounted
  const objectUrls = useRef(new Set());
  const track = (u) => { objectUrls.current.add(u); return u; };
  useEffect(() => () => { objectUrls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  // PDF thumbnail for whichever PDF is attached
  const pdfSource = file && isPdfFile(file) ? file : (url && acceptPdf && isPdfUrl(url) ? url : null);
  useEffect(() => {
    setPdfThumb(null);
    if (!pdfSource) return;
    let cancelled = false;
    renderPdfThumb(pdfSource)
      .then((u) => { if (cancelled) URL.revokeObjectURL(u); else setPdfThumb(track(u)); })
      .catch((err) => { if (!cancelled) console.warn('PDF thumbnail unavailable:', err.message || err); });
    return () => { cancelled = true; };
  }, [pdfSource]);

  useEffect(() => { onChange?.({ file, url }); }, [file, url]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => {
    setFile(null);
    setUrlState(null);
    setUrlText('');
    setPreviewSrc(null);
    setPdfName(null);
    setStatus(null);
    if (fileInput.current) fileInput.current.value = '';
  }, []);

  const setUrl = useCallback((next) => {
    setFile(null);
    setStatus(null);
    setUrlState(next || null);
    setUrlText(next || '');
    if (next && acceptPdf && isPdfUrl(next)) {
      setPreviewSrc(null);
      setPdfName(urlFilename(next));
    } else {
      setPreviewSrc(next || null);
      setPdfName(null);
    }
  }, [acceptPdf]);

  const setPickedFile = useCallback(async (f) => {
    setUrlState(null);
    setUrlText('');
    setStatus(null);
    if (acceptPdf && isPdfFile(f)) {
      setFile(f);
      setPreviewSrc(null);
      setPdfName(f.name || 'document.pdf');
      return;
    }
    setPdfName(null);
    if (isHeic(f)) {
      setFile(f);
      setPreviewSrc(null);
      setStatus('converting');
      try {
        const converted = await heicToJpeg(f);
        setFile(converted);
        setPreviewSrc(track(URL.createObjectURL(converted)));
        setStatus(null);
      } catch (err) {
        console.error('HEIC conversion failed:', err);
        setFile(null);
        setStatus('heic-failed');
      }
      return;
    }
    setFile(f);
    setPreviewSrc(track(URL.createObjectURL(f)));
  }, [acceptPdf]);

  const accepts = (f) => f && (f.type.startsWith('image/') || isHeic(f) || (acceptPdf && isPdfFile(f)));

  useImperativeHandle(ref, () => ({
    async resolve() {
      const { file: f, url: u } = stateRef.current;
      if (f) return uploadPhoto(bucket, await compressImage(f));
      return u || null;
    },
    clear,
    getValue: () => ({ ...stateRef.current }),
    setUrl,
  }), [bucket, clear, setUrl]);

  // Paste an image/PDF (or an image URL) while this picker has focus or nothing does
  const rootRef = useRef(null);
  useEffect(() => {
    const onPaste = (e) => {
      const root = rootRef.current;
      if (!root || stateRef.current.file || stateRef.current.url) return;
      if (!root.contains(document.activeElement) && document.activeElement !== document.body) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        const isImg = item.kind === 'file' && item.type.startsWith('image/');
        const isPdf = acceptPdf && item.kind === 'file' && item.type === 'application/pdf';
        if (isImg || isPdf) {
          const f = item.getAsFile();
          if (f) { setPickedFile(f); e.preventDefault(); return; }
        }
      }
      const text = e.clipboardData.getData('text')?.trim();
      const urlRe = acceptPdf
        ? /^https?:\/\/.+\.(png|jpe?g|gif|webp|bmp|svg|pdf)(\?.*)?$/i
        : /^https?:\/\/.+\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
      if (text && urlRe.test(text)) setUrl(text);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [acceptPdf, setPickedFile, setUrl]);

  const browse = () => { if (!filled) fileInput.current?.click(); };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (filled) { if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'; return; }
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (filled) return;
    const dt = e.dataTransfer;
    const f = dt?.files?.[0];
    if (accepts(f)) { setPickedFile(f); return; }
    const txt = (dt?.getData('text/uri-list') || dt?.getData('text/plain') || '').trim();
    if (/^https?:\/\//i.test(txt)) setUrl(txt);
  };

  return (
    <div className="photo-picker" ref={rootRef}>
      <div
        className={`pp-dropzone${filled ? ' pp-filled' : ''}${dragging ? ' pp-dragging' : ''}`}
        tabIndex={0}
        role="button"
        aria-label={filled ? `${label} attached — remove it to add a different one` : `${label}: drop, paste, or click to browse`}
        onClick={browse}
        onKeyDown={(e) => { if (!filled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); browse(); } }}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={onDrop}
      >
        {previewSrc && <img className="pp-preview" src={previewSrc} alt="" draggable={false} />}

        {pdfName && (
          <div className="pp-doc-preview">
            {pdfThumb
              ? <img className="pp-doc-thumb" src={pdfThumb} alt="" draggable={false} />
              : <FileText className="pp-doc-icon" aria-hidden="true" />}
            <div className="pp-doc-name">{pdfName}</div>
          </div>
        )}

        {!previewSrc && !pdfName && (
          <div className="pp-placeholder">
            {status === 'converting' ? (
              <div className="pp-placeholder-text"><strong>Converting HEIC…</strong></div>
            ) : status === 'heic-failed' ? (
              <div className="pp-placeholder-text"><strong>Couldn't convert HEIC</strong><span>Try a JPG/PNG</span></div>
            ) : (
              <>
                <ImagePlus aria-hidden="true" />
                <div className="pp-placeholder-text">
                  <strong>Drop, paste, or click</strong>
                  <span>{acceptPdf ? 'to add a photo or PDF' : 'to add a photo'}</span>
                </div>
              </>
            )}
          </div>
        )}

        {filled && (
          <button
            type="button"
            className="pp-clear"
            aria-label="Remove attachment"
            onClick={(e) => { e.stopPropagation(); clear(); }}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>

      <input
        ref={fileInput}
        id={`${id}-file`}
        type="file"
        accept={acceptPdf ? IMAGE_ACCEPT + PDF_ACCEPT : 'image/*'}
        capture={acceptPdf ? undefined : 'environment'}
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setPickedFile(f); }}
      />

      {showUrl && (
        <input
          className="pp-url"
          type="url"
          placeholder={acceptPdf ? 'Or paste an image or PDF URL' : 'Or paste an image URL'}
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          onBlur={() => { const v = urlText.trim(); if (v !== (url || '')) setUrl(v || null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        />
      )}
    </div>
  );
});
