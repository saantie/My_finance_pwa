// js/pdf.js — pdf.js wrapper with password prompt support.
// Browser-only. Loads from CDN; SW caches it.
//
// Usage:
//   const { pages, fullText } = await PDF.loadFile(file, { onPasswordNeeded: askPassword });
//   const result = P.parsePdfPages(pages, fullText);

(function (root) {
  'use strict';
  if (typeof window === 'undefined') return; // not for Node

  const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

  let _lib = null;
  async function loadLib() {
    if (_lib) return _lib;
    // pdf.js v4 ships as ESM; we import dynamically.
    _lib = await import(PDFJS_URL);
    if (_lib.GlobalWorkerOptions) {
      _lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    }
    return _lib;
  }

  /** Read a File/Blob as ArrayBuffer. */
  function readArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsArrayBuffer(file);
    });
  }

  /** Load a PDF and return { pages: [{items}], fullText }.
   *  opts.onPasswordNeeded(reason) → Promise<string|null>
   *    Called when the PDF requests a password. Resolve with the password
   *    or null to abort. */
  async function loadFile(file, opts = {}) {
    const pdfjsLib = await loadLib();
    const data = await readArrayBuffer(file);

    const onPasswordNeeded = opts.onPasswordNeeded || (() => Promise.resolve(null));

    const loadingTask = pdfjsLib.getDocument({
      data,
      // Help non-Latin glyph mapping
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/cmaps/',
      cMapPacked: true
    });

    // pdf.js calls this if the doc is encrypted or the password was wrong.
    // reason: 1=NEED_PASSWORD, 2=INCORRECT_PASSWORD
    loadingTask.onPassword = async (updateCallback, reason) => {
      const pw = await onPasswordNeeded(reason);
      if (pw == null) {
        loadingTask.destroy();
        return;
      }
      updateCallback(pw);
    };

    const pdf = await loadingTask.promise;
    const pages = [];
    const fullTextParts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      pages.push({ items: tc.items });
      // Accumulate plain text for bank-detection.
      for (const it of tc.items) fullTextParts.push(it.str);
    }
    return { pages, fullText: fullTextParts.join('\n'), numPages: pdf.numPages };
  }

  root.PDF = { loadFile };
})(typeof window !== 'undefined' ? window : globalThis);
