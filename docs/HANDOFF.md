# Handoff: Patrimonio — app personale per spese e patrimonio (Android)

## Overview
App Android personale (un solo utente) per:
- tracciare le spese, registrate in automatico quando si paga con Google Pay;
- vedere il patrimonio netto (conti, ETF, fondo pensione Cometa, crypto) nel tempo;
- gestire budget per categoria, obiettivi di risparmio, calendario dei pagamenti programmati, report;
- ricevere notifiche (pagamenti in arrivo, conferma PAC, spese registrate, budget, mercato, riepilogo).

Nessuna integrazione diretta con broker (es. Scalable Capital): l'utente registra quantità/operazioni, i **prezzi** arrivano da fonti pubbliche.

## About the Design Files
I file in `design/` sono **riferimenti di design in HTML**: prototipi che mostrano aspetto e comportamento voluti, **non codice di produzione da copiare**. Il compito è ricreare questi design nello stack scelto qui sotto, con i suoi pattern e librerie.

Apri `design/Finanza Personale.dc.html` in un browser (serve `support.js` nella stessa cartella). Il file principale è `design/AppTerminale.dc.html`, apribile anche da solo. Props: `device` = `desktop` | `mobile`, `onboarding` (bool), `openNotifs` (bool). Il riferimento primario per l'APK è la vista **mobile (390×844)**.

## Fidelity
**High-fidelity.** Colori, tipografia, spaziature, copy e interazioni sono definitivi. Ricreare fedelmente.

## Architettura raccomandata
- **Fase 1 (ora): solo APK, dati locali, nessun server.**
  - UI: React + TypeScript + Vite, impacchettata con **Capacitor** per Android (in alternativa Expo/React Native: stessa logica).
  - Storage: **SQLite** sul dispositivo (`@capacitor-community/sqlite`). Tutto offline, tranne il fetch dei prezzi.
  - **Livello dati separato** (repository/interfacce: `TransactionsRepo`, `HoldingsRepo`, …) così in futuro si può aggiungere la sincronizzazione senza toccare la UI.
  - **Backup:** export/import JSON cifrato (password utente), automatico settimanale su file o Google Drive tramite il selettore file di Android.
- **Fase 2 (opzionale):** versione web su Vercel + sincronizzazione (es. Supabase) dietro lo stesso livello dati.

### Spese automatiche da Google Pay
Non esiste un'API pubblica per leggere le transazioni di Google Pay/Wallet. Approccio:
- Plugin Capacitor nativo (Kotlin) con **`NotificationListenerService`**: l'utente concede l'accesso alle notifiche; si filtrano i pacchetti `com.google.android.apps.walletnfcrel` (Google Wallet) ed eventualmente l'app della banca.
- Parsing di commerciante e importo dal testo della notifica (regex configurabile, formato italiano `€46,85`). Serve la deduplica (stesso importo, commerciante e orario ±2 min).
- **Auto-categorizzazione:** tabella regole commerciante → categoria. Quando l'utente cambia la categoria di un commerciante, si crea una regola nuova.
- Il movimento viene salvato con `source = 'gpay'` e mostrato con il badge "G PAY · AUTO".
- Alternativa futura: aggregatori PSD2 (GoCardless, Tink, Salt Edge).

### Prezzi e saldi
- **ETF:** quotazioni per ISIN/ticker da una fonte pubblica (scegliere un provider con piano gratuito; cache locale; refresh ogni 15 min a mercato aperto e all'apertura dell'app). Nel prototipo il refresh è simulato ogni 3 s.
- **Fondo pensione (Cometa):** valore quota mensile, inserito dall'utente o letto dalla pagina pubblica del fondo.
- **Crypto:** prezzi da CoinGecko. Saldo da **indirizzo pubblico/xpub** (sola lettura) tramite blockchain explorer (BTC: derivazione xpub → indirizzi; ETH: saldo indirizzo). **Mai** chiedere la seed phrase o la chiave privata.

### Notifiche locali
`@capacitor/local-notifications`. Si programmano in base alle preferenze:
- Pagamenti in arrivo: alle 9:00 del giorno prima di ogni pagamento programmato.
- Conferma PAC: il giorno del PAC, alle 8:00, con le azioni "Conferma PAC" e "Più tardi".
- Spesa registrata: subito, a ogni movimento con `source = 'gpay'`.
- Budget quasi esaurito: quando la spesa di una categoria supera l'80% del budget (una sola volta per categoria e mese).
- Movimenti di mercato (off di default): quando un titolo varia più del 3% in un giorno.
- Riepilogo settimanale: lunedì alle 9:00.

## Modello dati (SQLite)
```
accounts(id, name, subtitle, type['conto','deposito','carta','broker_cash','contanti'], balance_manual, card_last4?, gpay_linked bool)
transactions(id, date, merchant, category, account_id, amount /* neg = uscita */, source['gpay','man','prog','bonifico'], note?)
categories(id, name, monthly_budget)
merchant_rules(merchant_pattern, category)
instruments(id, kind['etf','fondo','crypto'], ticker, isin?, name, color)
operations(id, instrument_id, date, side['buy','sell'], qty, price, fees?)   -- quantità e PMC derivati
wallets(id, network['bitcoin','ethereum'], address_or_xpub, label)          -- saldo letto, non salvato a mano
prices(instrument_id, price, prev_close, updated_at)
scheduled_payments(id, name, amount, day_of_month, kind, icon, account_id, is_pac bool, instrument_id?)
goals(id, name, saved, target, monthly)
notifications(id, type, title, body, created_at, read bool, action?, done bool, target_screen)
notification_prefs(key, enabled)   -- pay, pac, gpay, budget, market, weekly
networth_snapshots(date, total)    -- uno al giorno, per il grafico
```
Calcoli:
- Patrimonio netto = Σ saldi conti + Σ(qty × prezzo) degli ETF + quote Cometa × valore quota + valore delle crypto.
- PMC = media ponderata degli acquisti.
- P/L = valore − costo.

## Screens / Views
Layout **mobile**: header (titolo 24/600 + sottotitolo 13 muted + campanella 40×40), area scroll con padding 20, tab bar in basso alta 68px con 5 colonne: Home · Movimenti · [+] · Investimenti · Altro. Il "+" è un quadrato 48×48 accent. La tab attiva ha un bordo superiore di 2px accent.
Layout **desktop** (fase 2): sidebar 228px + pulsante primario nell'header.

Pattern ricorrenti:
- **Card:** bg `#151918`, bordo 1px `#262c2a`, padding 20, gap 14, **radius 0 ovunque**.
- **Kicker:** 11px/600, letter-spacing 0.08em, uppercase, colore `#8a948f`.
- **Riga lista:** padding 11–14px 0, bordo inferiore 1px `#1d2321`.
- **Segmented control:** contenitore con bordo 1px `#262c2a`; l'opzione attiva ha bg accent e testo `#0b1410`.
- **Badge auto:** 10px/600 "G PAY · AUTO", bg `rgba(95,191,138,0.12)`, testo accent.
- **Icone servizio:** tile 28–32px con bg accent 12% e icona Lucide 14–16px in accent.

1. **Patrimonio (Home)**
   - Patrimonio netto (mono 40/500, tracking −0.03em) con la variazione del periodo, verde se positiva e rosso se negativa.
   - Segmented 6M/1A/2A e grafico a linea alto 180px (linea accent 2px, area accent 12%, 4 linee di griglia `#1d2321`).
   - Griglia: Allocazione (barra impilata alta 10px con ETF accent, Cometa accent 60%, Crypto 30%, Liquidità muted), "Novembre finora" (entrate, spese, investito, frase sul tasso di risparmio), Prossimi pagamenti (4 voci con icona e link "Calendario →").
   - Ultimi movimenti (5) con "Vedi tutti →".
2. **Movimenti**
   - Banner "Google Pay è collegato" con il conteggio dei movimenti automatici del mese.
   - Filtro Tutti / Google Pay / Altri.
   - Righe con data mono 12 muted, commerciante, meta "Categoria · Conto · Fonte" e importo mono (entrate in accent).
3. **Aggiungi spesa** (bottom sheet su mobile)
   - Campi: importo (mono 32), "Dove", chip della categoria, chip "Pagato con" (Carta di credito, Conto corrente, Contanti) e "Salva spesa".
   - Validazione: l'importo deve essere maggiore di 0, altrimenti compare "Inserisci un importo maggiore di zero." e il bordo diventa rosso.
   - Al salvataggio la spesa viene aggiunta in testa, si apre Movimenti e il saldo del conto si aggiorna.
4. **Budget**
   - Segmented Ottobre/Novembre e totale del mese con barra.
   - Una card per categoria: barra alta 6px, accent oppure rosso se sforata, e la nota "Restano €X" o "Sforato di €X".
   - Categorie e budget: Spesa 400, Ristoranti 150, Trasporti 120, Casa 850, Shopping 150, Salute 60, Abbonamenti 60.
5. **Conti e carte**
   - Liquidità totale e card Google Pay "ATTIVO".
   - Lista dei conti (i saldi negativi in rosso) e "+ Aggiungi conto o carta".
6. **Investimenti**
   - Card ETF: valore, guadagno totale, variazione di oggi, capitale investito e barra dei pesi, con la nota "Quantità registrate da te · prezzi da quotazioni pubbliche per ISIN" e l'indicatore "PREZZI · hh:mm:ss".
   - Righe dei titoli: ticker, nome · ISIN, quote, prezzo, oggi %, valore, P/L %.
   - Card **Fondo Cometa** (Comparto Reddito, quote × valore quota, rendimento, contributi €125/mese + TFR + quota azienda).
   - Card **Crypto**: righe BTC ed ETH con la fonte, cioè "Ledger · bc1q…7f3k · saldo letto dalla blockchain" oppure "Registrato a mano", e il link "+ Aggiungi wallet".
   - Card "Aggiorna il portafoglio" con "+ Nuova operazione" e "Importa CSV".
7. **Nuova operazione / Wallet** (sheet con due modalità)
   - Operazione: Acquisto/Vendita; strumento ETF, Crypto o Fondo pensione; Titolo (ISIN o ticker, nascosto per il fondo); Quantità; Prezzo unitario (per il fondo "Valore quota"); Data; "Ripeti ogni mese" (crea un PAC in calendario); totale calcolato.
   - Wallet: rete Bitcoin o Ethereum, indirizzo pubblico o xpub, box di avviso rosso tenue "Non inserire mai la seed phrase o la chiave privata".
8. **Obiettivi**
   - Card con percentuale, risparmiato e target, barra, "Versi €X al mese", data stimata ("Ci arrivi a mmm aaaa") e "+ Versa €100".
9. **Calendario**
   - Griglia del mese a 7 colonne, settimana da lunedì, celle quadrate. Ogni giorno con un pagamento mostra l'icona del servizio (12px). Oggi ha il bordo accent, il giorno selezionato il fondo accent, i giorni passati il colore `#5a635f`.
   - Sotto la griglia, il dettaglio del giorno selezionato; a fianco (o sotto, su mobile) la lista "In arrivo" con data, "tra N gg", icona, nome, tipo e importo.
   - Icone Lucide per tipo di servizio: PAC `trending-up`, streaming `tv`, ricarica `smartphone`, palestra `dumbbell`, musica `music`, luce `zap`, auto `car`, cloud `cloud`, affitto `house`, internet `wifi`.
10. **Report**
    - 3 KPI: tasso di risparmio, spesa media mensile, crescita del patrimonio a 12 mesi.
    - Barre entrate/uscite degli ultimi 6 mesi (entrate accent, uscite muted).
    - Barre orizzontali delle spese per categoria.
11. **Altro** (solo mobile): lista con Budget, Conti, Obiettivi, Calendario, Report e "Rivedi introduzione".
12. **Onboarding** (primo avvio, 6 passaggi, a tutto schermo)
    - Struttura: header con logo e "Salta"; contenuto con numero (mono 12 accent, es. "02 / 06 · SPESE AUTOMATICHE"), titolo 34/600, testo 15 muted, punti elenco con quadratino accent 6px, e un'anteprima visiva del passaggio.
    - Footer con la barra di avanzamento (6 segmenti 22×4) e i pulsanti Indietro / Avanti. Il primo passaggio usa "Iniziamo", l'ultimo "Attiva notifiche e inizia".
    - Passaggi:
      1. Benvenuto
      2. Spese automatiche
      3. Investimenti
      4. Budget e obiettivi
      5. Calendario
      6. Notifiche (interruttori delle preferenze)
    - Copy esatto: vedi `ONB` in `AppTerminale.dc.html`.
    - Nell'APK, l'ultimo passaggio deve chiedere i permessi notifiche (Android 13+) e l'accesso alle notifiche per Google Pay.
13. **Centro notifiche** (dalla campanella; su mobile a tutto schermo, su desktop dropdown 400px)
    - Badge con il numero di non lette. Tab Recenti / Preferenze.
    - Le non lette hanno una barra sinistra di 3px accent e il fondo accent 5%.
    - La notifica PAC ha le azioni "Conferma PAC" (aggiunge quote VWCE pari a €300 / prezzo e mostra "Confermato · quote VWCE aggiornate") e "Più tardi".
    - Toccando una notifica la si segna come letta e si apre la schermata collegata. In fondo, "Segna tutte come lette".
    - Interruttori delle preferenze: 42×24, con il cursore quadrato 16px.

## Interactions & Behavior
- Nessuna animazione complessa. Transizioni di opacità (0.4s) solo sull'indicatore live.
- Hover/pressed: superficie `#1b201e`; pulsante primario `#4fae7a` all'hover.
- Formato numeri italiano: `€69.543,21`, segno meno tipografico `−`, percentuali `+1,52%`.
- Sheet/modal: tap sul fondo per chiudere; su mobile si allineano al bordo inferiore.

## Design Tokens
- **Colori:**
  - Fondo `#0e1110`; superficie `#151918`; hover `#1b201e`.
  - Bordo forte `#262c2a`; bordo riga `#1d2321`.
  - Testo `#e6ebe8`; muted `#8a948f`; disabilitato/passato `#5a635f`.
  - Accent `#5fbf8a`, hover `#4fae7a`; testo su accent `#0b1410`.
  - Negativo `#e5675a`, tinta negativa `rgba(229,103,90,0.1)`.
  - Tinte accent: 12% / 5% e, per i grafici, 70%, 60%, 45%, 30%, 25%.
  - Overlay `rgba(0,0,0,0.6)`.
- **Font:** IBM Plex Sans (400/500/600/700) per testi e UI; JetBrains Mono (400/500/600) per tutti i numeri, con `font-variant-numeric: tabular-nums`.
- **Scala tipografica:** 40 (hero) / 34 (titolo onboarding) / 32 / 28 / 26 / 24 (titolo schermata) / 18 / 16 / 15 / 14 (base) / 13 / 12 / 11 (kicker) / 10 (badge).
- **Spaziature:** 4, 6, 8, 10, 12, 14, 16, 20, 24, 40.
- **Radius:** 0 ovunque.
- **Ombre:** solo sugli overlay, `0 24px 60px rgba(0,0,0,0.5)`.

## Assets
- Icone: [Lucide](https://lucide.dev), in React con `lucide-react`. Nel prototipo sono caricate come maschere da `lucide-static@0.460.0`.
- Nessuna immagine. Nessun logo di terze parti: le icone dei servizi sono generiche per categoria.

## Dati di esempio
Tutti i dati del prototipo (conti, movimenti, ETF VWCE/EIMI/AGGH/IGLN, Cometa, BTC/ETH, pagamenti, obiettivi) si trovano nel logic class di `AppTerminale.dc.html` e sono utili come seed di sviluppo.

## Screenshots
`screenshots/` contiene 20 schermate mobile 390×844, dalla `01-patrimonio` alla `20-onboarding-6-notifiche`.
Nota: nelle catture le icone Lucide appaiono come riquadri vuoti, per un limite dello strumento di cattura (le icone sono caricate come CSS mask). Nel prototipo aperto nel browser le icone sono visibili.

## Files
- `design/Finanza Personale.dc.html`: canvas con tutte le viste (onboarding, notifiche, app; desktop + mobile).
- `design/AppTerminale.dc.html`: prototipo completo con template e logica.
- `design/support.js`: runtime necessario per aprire i file `.dc.html` nel browser.
