import type { MerchantRule, Transaction } from '../data/types';

/** Notifica grezza ricevuta dal NotificationListenerService nativo. */
export interface RawNotification {
  packageName: string;
  title: string;
  text: string;
  subText?: string;
  postedAt: number;
  key?: string;
}

export interface ParsedPayment {
  merchant: string;
  amount: number;
  cardLast4: string | null;
  postedAt: number;
}

/** Pacchetti da cui accettiamo notifiche di pagamento (devono coincidere con WalletNotificationService.PACKAGES). */
export const WALLET_PACKAGES = ['com.google.android.apps.walletnfcrel', 'com.google.android.apps.nbu.paisa.user', 'com.revolut.revolut'];

export const PACKAGE_LABELS: Record<string, string> = {
  'com.google.android.apps.walletnfcrel': 'Google Wallet',
  'com.google.android.apps.nbu.paisa.user': 'Google Pay',
  'com.revolut.revolut': 'Revolut',
};

// Importo in euro: "€3,20", "3,20 €", "€ 1.234,56", "3.20 EUR", "EUR 3,20", "€3" (spazi anche non separabili).
const NUM = String.raw`(\d{1,3}(?:[.,\s\u00a0\u202f']\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const AMOUNT_RE = new RegExp(String.raw`(?:€|EUR)[\s\u00a0\u202f]?[-−]?${NUM}(?![\d])|${NUM}[\s\u00a0\u202f]?(?:€|EUR\b)`, 'i');
const CARD_RE = /(?:•{2,}|·{2,}|\*{2,}|x{2,}|terminante (?:con|in)|ending in)\s?(\d{4})/i;

/** "1.234,56" → 1234.56, "3.20" → 3.2, "1,234.56" → 1234.56, "3" → 3 */
export function toNumber(raw: string): number {
  const s = raw.replace(/[\s\u00a0\u202f']/g, '');
  const m = /^(.*?)([.,])(\d{1,2})$/.exec(s);
  if (m) return Number(m[1].replace(/[.,]/g, '') + '.' + m[3]);
  return Number(s.replace(/[.,]/g, ''));
}

/** Testi che non sono un commerciante (titoli generici delle app di pagamento). */
const GENERIC = /^(pagamento|pagato|transazione|acquisto|addebito|spesa|hai (pagato|speso)|nuovo pagamento|payment|paid|you paid|purchase|google( pay| wallet)?|wallet|revolut|carta|card)\b/i;
const PREP = /(?:\bpresso|\ba|\bda|\bat|\bto|\bfrom)\s+(.+?)(?:\s+(?:con|with|tramite|via|il|on)\b|\s*[·,\n(]|\.\s|\.$|$)/i;

const clean = (s: string) => s.replace(/^[\p{Extended_Pictographic}\p{So}\uFE0F\u200d\s•·:|–—-]+/u, '').replace(/[\s\u00a0\u202f]+/g, ' ').trim();

export type ParseOutcome = { ok: true; payment: ParsedPayment } | { ok: false; reason: string };

/**
 * Estrae commerciante e importo da una notifica di pagamento.
 * Formati tipici: titolo "Coop", testo "46,85 € con Visa ••4821" (Google Wallet);
 * "Pagamento di 46,85 € a Coop"; "💳 Hai speso 3,20 € presso Bar Centrale" (Revolut).
 * `customPattern` è una regex configurabile con i gruppi `merchant` e `amount`.
 */
export function explainWalletNotification(n: RawNotification, customPattern?: string): ParseOutcome {
  const title = clean(n.title ?? '');
  const text = clean(n.text ?? '');
  const sub = clean(n.subText ?? '');
  const all = [title, text, sub].filter(Boolean).join('\n');
  const card = CARD_RE.exec(all)?.[1] ?? null;

  if (customPattern) {
    try {
      const m = new RegExp(customPattern, 'i').exec(all);
      if (m?.groups?.merchant && m.groups.amount) {
        const amount = toNumber(m.groups.amount);
        if (amount > 0) return { ok: true, payment: { merchant: clean(m.groups.merchant), amount, cardLast4: card, postedAt: n.postedAt } };
      }
    } catch { /* regex non valida: si prosegue con il parser standard */ }
  }

  const am = AMOUNT_RE.exec(all);
  if (!am) return { ok: false, reason: 'nessun importo in euro nel testo' };
  const amount = toNumber(am[1] ?? am[2]);
  if (!(amount > 0)) return { ok: false, reason: 'importo non valido' };
  // Rimborsi e accrediti non sono spese.
  if (/\b(rimborso|refund|ricevut[oi]|accredit|received|top.?up|ricarica (del )?conto)\b/i.test(all)) return { ok: false, reason: 'sembra un accredito o un rimborso, non una spesa' };

  let merchant = '';
  if (title && !GENERIC.test(title) && !AMOUNT_RE.test(title)) {
    merchant = title;
  } else {
    for (const part of [title, text, sub]) {
      const m = PREP.exec(part.replace(AMOUNT_RE, ' '));
      if (m?.[1] && !AMOUNT_RE.test(m[1])) { merchant = m[1]; break; }
    }
  }
  merchant = clean(merchant).replace(/[.:]+$/, '');
  if (!merchant || GENERIC.test(merchant)) return { ok: false, reason: 'commerciante non trovato' };
  return { ok: true, payment: { merchant, amount, cardLast4: card, postedAt: n.postedAt } };
}

export function parseWalletNotification(n: RawNotification, customPattern?: string): ParsedPayment | null {
  const r = explainWalletNotification(n, customPattern);
  return r.ok ? r.payment : null;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Stesso importo e orario entro ±2 minuti, e stesso commerciante oppure già registrato in automatico
 * (Google Wallet e Revolut notificano lo stesso pagamento con nomi a volte diversi).
 */
export function isDuplicate(p: ParsedPayment, existing: Transaction[], windowMs = 2 * 60 * 1000): boolean {
  const m = norm(p.merchant);
  return existing.some((t) =>
    Math.abs(Math.abs(t.amount) - p.amount) < 0.005 &&
    Math.abs(t.created_at - p.postedAt) <= windowMs &&
    (t.source === 'gpay' || norm(t.merchant) === m),
  );
}

/** Parole chiave di partenza; le regole create dall'utente hanno sempre la precedenza. */
const BUILTIN: [RegExp, string][] = [
  [/\b(coop|conad|esselunga|carrefour|lidl|eurospin|pam|despar|aldi|penny|supermercat|naturasi|iper)\b/, 'Spesa'],
  [/\b(bar|caffe|pizzeria|ristorante|trattoria|osteria|sushi|burger|mcdonald|kfc|deliveroo|glovo|just eat|pub|gelateria|pasticceria)\b/, 'Ristoranti'],
  [/\b(trenitalia|italo|atm|atac|gtt|esso|eni|q8|ip|tamoil|shell|autostrade|telepass|uber|freenow|taxi|parcheggio|ryanair|easyjet)\b/, 'Trasporti'],
  [/\b(farmacia|parafarmacia|medico|dentista|ottica|clinica)\b/, 'Salute'],
  [/\b(netflix|spotify|disney|prime video|dazn|icloud|google one|youtube|apple com bill)\b/, 'Abbonamenti'],
  [/\b(enel|a2a|hera|iren|edison|tim|vodafone|fastweb|iliad|windtre|ikea|leroy merlin|brico)\b/, 'Casa'],
  [/\b(amazon|zalando|decathlon|zara|h m|mediaworld|unieuro|euronics|feltrinelli)\b/, 'Shopping'],
];

export function categorize(merchant: string, rules: MerchantRule[], fallback = 'Shopping'): string {
  const m = norm(merchant);
  const userRule = rules
    .filter((r) => m.includes(norm(r.merchant_pattern)))
    .sort((a, b) => b.merchant_pattern.length - a.merchant_pattern.length)[0];
  if (userRule) return userRule.category;
  for (const [re, cat] of BUILTIN) if (re.test(m)) return cat;
  return fallback;
}

/** Pattern della regola creata quando l'utente cambia categoria a un commerciante. */
export function rulePatternFor(merchant: string): string {
  return norm(merchant);
}
