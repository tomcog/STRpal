// Render page 1 of a PDF (File/Blob or URL) to a JPEG object URL, ~600px wide.
// PDF.js (~1MB) is a separate chunk, fetched the first time a PDF needs a
// thumbnail. The caller owns the returned URL (URL.revokeObjectURL when done).
export async function renderPdfThumb(source) {
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
