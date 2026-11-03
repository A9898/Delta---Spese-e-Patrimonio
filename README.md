# Patrimonio

App Android personale per spese e patrimonio: spese registrate in automatico da Google Pay, patrimonio netto (conti, ETF, Fondo Cometa, crypto), budget, obiettivi, calendario dei pagamenti, report e notifiche.

Ricreata dal design in [`docs/design/`](docs/design) seguendo l'handoff in [`docs/HANDOFF.md`](docs/HANDOFF.md). Fase 1: solo APK, dati sul dispositivo, nessun server.

## Stack

- React 18 + TypeScript + Vite
- Capacitor 8 per Android
- SQLite sul dispositivo (`@capacitor-community/sqlite`), con `localStorage` come ripiego nel browser
- `lucide-react` per le icone, font IBM Plex Sans e JetBrains Mono inclusi nell'app (funzionano offline)

## Comandi

```bash
npm install
npm run dev          # browser, http://localhost:5173 (prezzi simulati ogni 3 s)
npm test             # test unitari (vitest)
npm run typecheck
npm run build        # bundle web in dist/

npm run android:sync # build + copia in android/
npm run android:open # apre Android Studio
```

### Ottenere l'APK

- **GitHub Actions**: ogni push esegue `.github/workflows/android.yml` (typecheck, test, `assembleDebug`). L'APK si scarica dagli artifact della run (`patrimonio-debug-apk`).
- **In locale**: serve Android Studio (o l'SDK con JDK 21). `npm run android:sync`, poi `cd android && ./gradlew assembleDebug`. L'APK finisce in `android/app/build/outputs/apk/debug/`.

Parametri utili nel browser: `?onboarding` riapre l'introduzione, `?notifiche` apre il centro notifiche, `?screen=inv` apre una schermata.

## Struttura

```
src/
  data/        types.ts (modello), schema.ts (tabelle + DDL SQLite), db.ts (backend SQLite / localStorage / memoria),
               repos.ts (TransactionsRepo, HoldingsRepo, …), seed.ts (dati di esempio del prototipo)
  domain/      calc.ts: quantità e PMC dalle operazioni, P/L, saldi, flussi, obiettivi
  services/    prices.ts (Yahoo Finance per gli ETF, CoinGecko per le crypto), blockchain.ts (saldo da indirizzo/xpub),
               gpayParser.ts (parsing, deduplica, categorie), walletListener.ts (ponte nativo),
               localNotifications.ts, backup.ts (backup cifrato), csvImport.ts
  store.tsx    stato dell'app e azioni; la UI passa solo da qui e dai repository
  screens/     Home, Movimenti, Budget, Conti, Investimenti, Obiettivi, Calendario, Report, Altro, Backup
  components/  ui.tsx (Card, Seg, Chips, Toggle, TxRow…), Sheets.tsx, Notifications.tsx, Onboarding.tsx
android/       progetto Capacitor + plugin nativo WalletListener
```

Il livello dati è separato dalla UI: per la fase 2 (web + sync) basta un'altra implementazione di `Database` in `src/data/db.ts`.

## Come funziona

### Spese automatiche da Google Pay
Non esiste un'API pubblica per le transazioni di Google Wallet, quindi l'app legge le notifiche:

1. `WalletNotificationService.java` (un `NotificationListenerService`) riceve le notifiche di `com.google.android.apps.walletnfcrel`. Se l'app è aperta le inoltra subito, altrimenti le mette in coda e l'app le legge al prossimo avvio.
2. `gpayParser.ts` estrae commerciante, importo (`€46,85`) e ultime 4 cifre della carta. Se la tua banca usa un altro formato, puoi impostare una regex in *Altro › Backup e dati*.
3. Deduplica: stesso importo, stesso commerciante e orario entro ±2 minuti.
4. Categoria: prima le regole che crei tu (cambiando la categoria di un movimento Google Pay si crea una regola per quel commerciante), poi un elenco di parole chiave.
5. Il movimento viene salvato con `source = 'gpay'` e il badge "G PAY · AUTO".

L'accesso alle notifiche si concede all'ultimo passaggio dell'introduzione, che apre le impostazioni di sistema. Per aggiungere l'app di una banca, aggiungi il suo pacchetto in `WalletNotificationService.PACKAGES` e in `WALLET_PACKAGES` (`gpayParser.ts`).

Il plugin è scritto in Java, non in Kotlin come suggeriva l'handoff: il progetto Capacitor generato è in Java e così non serve configurare il plugin Gradle di Kotlin.

### Prezzi e saldi
- **ETF**: se hai inserito solo l'ISIN o il ticker, il simbolo di quotazione viene cercato su Yahoo, preferendo le borse in euro (Xetra, Milano, …). Endpoint chart di Yahoo Finance, gratuito e senza chiave, con il simbolo in `instruments.price_symbol` (es. `VWCE.DE`). Le quotazioni in USD o GBp vengono convertite in EUR. Su Android le richieste passano da `CapacitorHttp`, quindi senza problemi di CORS. L'aggiornamento avviene all'apertura dell'app, al ritorno in primo piano se sono passati 15 minuti, ogni 15 minuti e con il tasto ↻ accanto a "PREZZI".
- **Crypto**: CoinGecko, in EUR con la variazione nelle 24 ore. Il saldo dei wallet si legge da mempool.space (indirizzo BTC), blockchain.info (xpub/ypub/zpub) o da un nodo RPC pubblico (ETH). L'app rifiuta seed phrase e chiavi private.
- **Fondo Cometa**: il valore quota si aggiorna toccando "QUOTA MENSILE" nella card.
- Nel browser in sviluppo i prezzi sono simulati, come nel prototipo.

### Notifiche
- **Programmate** con `@capacitor/local-notifications`:
  - pagamenti in arrivo: alle 9:00 del giorno prima;
  - PAC: alle 8:00 del giorno stesso, con le azioni "Conferma PAC" e "Più tardi";
  - riepilogo: lunedì alle 9:00.
- **Immediate**: spese Google Pay, budget oltre l'80% (una volta per categoria e mese) e movimenti di mercato oltre il 3% (disattivati di default).
- **Centro notifiche**: si apre dalla campanella e ha le schede *Recenti* e *Preferenze*.
- **Conferma PAC**: aggiunge quote pari a importo / prezzo corrente.

### Modificare un titolo
In Investimenti tocchi un titolo (o "Modifica" sul fondo, o una riga crypto) per cambiare nome, ticker, ISIN, simbolo di quotazione e prezzo manuale. Puoi anche modificare o eliminare le singole operazioni, oppure eliminare il titolo. Se un titolo non si aggiorna, accanto al ticker compare "● non aggiornato" e nella scheda trovi il motivo.

### Import da Cashew
Altro › Importa da Cashew: si sceglie l'export CSV, si vede un riepilogo e si abbinano le categorie.
- I conti nuovi prendono il saldo calcolato da Cashew; quelli già presenti con lo stesso nome restano invariati.
- Correzioni di saldo e trasferimenti non diventano movimenti; le rate future e le valute diverse dall'euro vengono saltate.
- Reimportare lo stesso file non crea doppioni.

### Backup
In *Altro › Backup e dati* si esporta un JSON cifrato con AES-256-GCM, con la chiave derivata dalla password tramite PBKDF2-SHA256 a 250.000 iterazioni. Il file si salva dal selettore di Android (Download, Google Drive…). L'app ricorda la data dell'ultimo backup e consiglia di farne uno a settimana. Il salvataggio automatico su file non è ancora implementato: servirebbe un URI persistente dello Storage Access Framework.

### Dati iniziali
L'app parte vuota: ci sono solo le categorie con i limiti del design (modificabili toccando il nome in Budget) e le preferenze delle notifiche. Conti, pagamenti programmati e obiettivi si aggiungono dalle rispettive schermate.
Un'installazione che conteneva i dati di esempio del prototipo viene ripulita al primo avvio della nuova versione. Per sviluppare con i dati del prototipo: `VITE_DEMO_SEED=1 npm run dev`.

### Aggiornare l'app sul telefono
Ogni push su GitHub produce un nuovo APK (Actions › run › Artifacts). Si installa **sopra** quello vecchio, senza disinstallare: i dati restano.
Funziona perché tutte le build sono firmate con la stessa chiave di debug (`android/app/patrimonio-debug.keystore`, password `android`) e il `versionCode` cresce a ogni run.
Attenzione: disinstallare l'app cancella i dati. Fai un backup prima, se mai ti servisse.

## Note e limiti noti
- Il formato delle notifiche di Google Wallet cambia tra versioni e lingue. Il parser copre i formati più comuni ed è testato in `src/tests/core.test.ts`, ma va verificato con le tue notifiche reali.
- L'endpoint di Yahoo Finance non è ufficiale. Se smette di funzionare, basta sostituire `yahooProvider` in `src/services/prices.ts` con un altro provider (interfaccia `PriceProvider`).
- Se la ricerca automatica sceglie la borsa sbagliata, il simbolo si corregge dalla scheda del titolo (tasto "Cerca").
