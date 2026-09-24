import { execFile } from 'node:child_process';
import { DOCUMENT_LIMITS } from '../supabase/functions/_shared/job-document-adapter.mjs';

/** Poppler runs without a shell or files: bounded PDF stdin -> plain-text stdout.
 * No passwords, scripts, embedded attachments or remote resources are executed.
 * Install poppler-utils on the scheduled Node runner; Edge does not use this.
 */
export function extractPdfText(bytes,{signal,timeoutMs = 15_000} = {}) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > DOCUMENT_LIMITS.maxBytes) {
    return Promise.reject(new Error('PDF fehlt oder überschreitet das Grössenlimit.'));
  }
  signal?.throwIfAborted();
  return new Promise((resolve,reject) => {
    const child = execFile('pdftotext',['-enc','UTF-8','-eol','unix','-nopgbrk','-','-'],
      {encoding:'utf8',timeout:timeoutMs,maxBuffer:DOCUMENT_LIMITS.maxTextChars * 4,signal,windowsHide:true},
      (error,stdout) => {
        if (error) {
          const message = error.code === 'ENOENT' ? 'PDF-Textleser nicht installiert (poppler-utils).' :
            error.killed || error.name === 'AbortError' ? 'PDF-Textauslesung abgebrochen oder Zeitlimit erreicht.' :
              'PDF kann nicht sicher und vollständig als Text gelesen werden.';
          reject(new Error(message,{cause:error}));
        } else if (stdout.length > DOCUMENT_LIMITS.maxTextChars) reject(new Error('PDF-Text überschreitet das Grössenlimit.'));
        else resolve(stdout);
      });
    child.stdin.on('error',() => {}); // A parser rejection can close stdin early; callback reports it.
    child.stdin.end(bytes);
  });
}
