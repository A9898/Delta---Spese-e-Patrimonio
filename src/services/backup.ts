import type { Dump } from '../data/repos';

/**
 * Backup cifrato: JSON di tutte le tabelle, cifrato con AES-GCM e chiave derivata
 * dalla password utente (PBKDF2-SHA256, 250.000 iterazioni).
 */

const ITER = 250_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export interface BackupFile {
  format: 'patrimonio-backup';
  version: 1;
  created_at: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

export async function encryptBackup(dump: Dump, password: string): Promise<BackupFile> {
  if (password.length < 8) throw new Error('La password deve avere almeno 8 caratteri.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITER);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(dump))));
  return {
    format: 'patrimonio-backup', version: 1, created_at: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITER, salt: b64(salt) },
    cipher: { name: 'AES-GCM', iv: b64(iv) },
    data: b64(ct),
  };
}

export async function decryptBackup(file: BackupFile, password: string): Promise<Dump> {
  if (file?.format !== 'patrimonio-backup') throw new Error('File di backup non riconosciuto.');
  const key = await deriveKey(password, unb64(file.kdf.salt), file.kdf.iterations);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.cipher.iv) as BufferSource }, key, unb64(file.data) as BufferSource);
    return JSON.parse(dec.decode(pt));
  } catch {
    throw new Error('Password errata o file danneggiato.');
  }
}

/**
 * Salva il file: su Android il WebView apre il selettore di sistema (Download, Google Drive…)
 * tramite il download; nel browser scarica il file.
 */
export function downloadFile(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => resolve(i.files?.[0] ?? null);
    i.click();
  });
}
