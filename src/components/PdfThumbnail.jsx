import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { renderPdfThumb } from '../lib/pdfThumb.js';
import './PdfThumbnail.css';

/**
 * A saved PDF shown as its first page; tapping opens the PDF in a new tab.
 * While it renders, or if it can't (password-protected, damaged, offline),
 * it shows the plain "View … PDF" link instead.
 *
 *   <PdfThumbnail url={r.receipt_image_url} label="View Receipt PDF" />
 *
 * `className` lands on the link (size the thumbnail from there, e.g.
 * `.my-class .pdf-thumb-img { max-height: … }`); other props such as onClick
 * pass through to it.
 */
export function PdfThumbnail({ url, label = 'View PDF', className, ...props }) {
  const [thumb, setThumb] = useState(null);

  useEffect(() => {
    setThumb(null);
    if (!url) return;
    let cancelled = false;
    let created = null;
    renderPdfThumb(url)
      .then((u) => { created = u; if (!cancelled) setThumb(u); else URL.revokeObjectURL(u); })
      .catch((err) => console.warn('PDF thumbnail unavailable:', err.message || err));
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  if (!url) return null;
  return (
    <a className={[thumb ? 'pdf-thumb' : 'pdf-chip', className].filter(Boolean).join(' ')}
      href={url} target="_blank" rel="noopener noreferrer"
      aria-label={thumb ? label : undefined} {...props}>
      {thumb ? (
        <>
          <img className="pdf-thumb-img" src={thumb} alt="" draggable={false} />
          <span className="pdf-thumb-caption"><FileText aria-hidden="true" />{label}</span>
        </>
      ) : (
        <>
          <FileText aria-hidden="true" />
          <span>{label}</span>
        </>
      )}
    </a>
  );
}
