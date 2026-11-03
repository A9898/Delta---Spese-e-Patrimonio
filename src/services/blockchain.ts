import type { Network } from '../data/types';

/**
 * Saldo in sola lettura da indirizzo pubblico o xpub. Mai seed phrase o chiavi private.
 * - Bitcoin: indirizzo singolo via mempool.space; xpub/ypub/zpub via blockchain.info multiaddr
 *   (che deriva gli indirizzi lato server).
 * - Ethereum: eth_getBalance su un nodo RPC pubblico.
 */

const SECRET_HINT = /\b([a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/i;

export function looksLikeSecret(input: string): boolean {
  const s = input.trim();
  if (SECRET_HINT.test(s)) return true; // seed phrase (12–24 parole)
  if (/^(xprv|yprv|zprv|tprv)/i.test(s)) return true; // chiave privata estesa
  if (/^(0x)?[0-9a-f]{64}$/i.test(s)) return true; // chiave privata esadecimale
  if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(s)) return true; // WIF
  return false;
}

export function validateAddress(network: Network, input: string): string | null {
  const s = input.trim();
  if (looksLikeSecret(s)) return 'Questa sembra una chiave privata o una seed phrase: non inserirla mai.';
  if (network === 'bitcoin') {
    if (/^(xpub|ypub|zpub)[1-9A-HJ-NP-Za-km-z]{100,112}$/.test(s)) return null;
    if (/^(bc1)[02-9ac-hj-np-z]{25,87}$/i.test(s)) return null;
    if (/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(s)) return null;
    return 'Incolla un indirizzo valido.';
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return null;
  return 'Incolla un indirizzo valido.';
}

export async function fetchBalance(network: Network, address: string): Promise<number> {
  const a = address.trim();
  if (network === 'bitcoin') {
    if (/^[xyz]pub/.test(a)) {
      const r = await fetch(`https://blockchain.info/multiaddr?active=${encodeURIComponent(a)}&n=0&cors=true`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return Number(j?.wallet?.final_balance ?? 0) / 1e8;
    }
    const r = await fetch(`https://mempool.space/api/address/${encodeURIComponent(a)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const c = j.chain_stats ?? {}, m = j.mempool_stats ?? {};
    return ((c.funded_txo_sum ?? 0) - (c.spent_txo_sum ?? 0) + (m.funded_txo_sum ?? 0) - (m.spent_txo_sum ?? 0)) / 1e8;
  }
  const r = await fetch('https://ethereum-rpc.publicnode.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [a, 'latest'] }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return Number(BigInt(j.result ?? '0x0')) / 1e18;
}
