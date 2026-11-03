import type { MerchantRule, Transaction } from '../data/types';

/** Notifica grezza ricevuta dal NotificationListenerService nativo. */
export interface RawNotification {
  packageName: string;
  title: string;
  text: string;
  postedAt: number;
}

export interface ParsedPayment {
  merchant: string;
  amount: number;
  cardLast4: string | null;
  postedAt: number;
}

/** Pacchetti da cui accettiamo notifiche di pagamento. Si possono aggiungere le app delle banche. */
export const WALLET_PACKAGES = ['com.google.android.apps.walletnfcrel', 'com.google.android.apps.nbu.paisa.user'];

const AMOUNT_RE = /(?:€\s?([0-9]{1,3}(?:[.\s][0-9]{3})*,[0-9]{2})|([0-9]{1,3}(?:[.\s][0-9]{3})*,[0-9]{2})\s?(?:€|EUR))/;
const CARD_RE = /(?:•{2,}|·{2,}|\*{2,}|x{2,}|terminante (?:con|in))\s?(\d{4})/i;

function toNumber(it: string): number {
  return Number(it.replace(/[.\s]/g, '').replace(',', '.'));
}

/**
 * Estrae commerciante e importo da una notifica di Google Wallet.
 * Formati tipici: titolo "Coop", testo "€46,85 con Visa ••4821";
 * oppure titolo "Pagamento di 46,85 € a Coop".
 * `customPattern` è una regex configurabile con i gruppi `merchant` e `amount`.
 */
export function parseWalletNotification(n: RawNotification, customPattern?: string): ParsedPayment | null {
  const title = (n.title ?? '').trim();
  const text = (n.text ?? '').trim();
  const all = `${title}\n${text}`;

  if (customPattern) {
    try {
      const m = new RegExp(customPattern, 'i').exec(all);
      if (m?.groups?.merchant && m.groups.amount) {
        const amount = toNumber(m.groups.amount);
        if (amount > 0) return { merchant: m.groups.merchant.trim(), amount, cardLast4: CARD_RE.exec(all)?.[1] ?? null, postedAt: n.postedAt };
      }
    } catch { /* regex non valida: si prosegue con il parser standard */ }
  }

  const am = AMOUNT_RE.exec(all);
  if (!am) return null;
  const amount = toNumber(am[1] ?? am[2]);
  if (!(amount > 0)) return null;

  // Di solito Google Wallet usa il commerciante come titolo; se il titolo è generico lo cerchiamo nel testo.
  const generic = /^(pagamento|transazione|acquisto|google (pay|wallet)|wallet|hai pagato|spesa)\b/i.test(title);
  const PREP = /(?:\ba|\bpresso|\bda|\bat)\s+(.+?)(?:\s+con\b|\s*[·,\n]|\.\s|\.$|$)/i;
  let merchant = '';
  if (title && !generic && !AMOUNT_RE.test(title)) {
    merchant = title;
  } else {
    const m = PREP.exec(title.replace(AMOUNT_RE, '')) ?? PREP.exec(text.replace(AMOUNT_RE, ''));
    merchant = m?.[1]?.trim() ?? '';
  }
  merchant = merchant.replace(/\s+/g, ' ').trim();
  if (!merchant) return null;

  return { merchant, amount, cardLast4: CARD_RE.exec(all)?.[1] ?? null, postedAt: n.postedAt };
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Stesso importo, stesso commerciante e orario entro ±2 minuti. */
export function isDuplicate(p: ParsedPayment, existing: Transaction[], windowMs = 2 * 60 * 1000): boolean {
  const m = norm(p.merchant);
  return existing.some((t) =>
    Math.abs(Math.abs(t.amount) - p.amount) < 0.005 &&
    norm(t.merchant) === m &&
    Math.abs(t.created_at - p.postedAt) <= windowMs,
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
