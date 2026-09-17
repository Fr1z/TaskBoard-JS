# PouchTasker — Sync Endpoint PHP — Guida configurazione

Questa guida spiega come configurare il backend `sync.php` e collegarlo al client `dash.html` la **prima volta**. Dopo il primo collegamento il sync diventa incrementale e automatico.

## 1. Cos'è

`remoteSync/PHP/sync.php` è un microservizio **senza database esterno**. Salva i task in un file isolato per utente/token:

```
remoteSync/PHP/storage/<sha256(token|user)>.json      // in chiaro
remoteSync/PHP/storage/<sha256(token|user)>.enc       // se cifrato (AES-256-GCM + gzip)
```

Mantiene aperta la multi-utenza: ogni `Bearer Token` (+ `X-User` opzionale) ha il suo file. `lastEdit` / `lastWrite` sono alias per il conflitto *newer-wins*.

Operazioni supportate (richieste dal client):

| Azione | Metodo | Note |
|--------|--------|------|
| `pull` | `GET ?action=pull&since=ISO` | Ritorna solo task con `lastEdit > since`; senza `since` ritorna tutto (bootstrap primo sync) |
| `push` | `POST ?action=push` `{tasks:[], tombstones:[luid]}` | Merge newer-wins, applica hard-delete tombstone |
| `sync` | `POST ?action=sync` `{since, tasks, tombstones}` | Atomico push+pull, usato dal client su **Save** |
| `get` | `GET ?action=get&luid=123` | Singolo task |
| `search` | `GET ?action=search&q=foo&since=` | Filtro su titolo/descrizione/categories |
| `update` | `POST ?action=update` `{luid, ...patch}` | Upsert singolo, alias di push |

Headers:

```
Authorization: Bearer <token opzionale>
X-Enc-Password: <password cifratura opzionale, separata dal token>
X-User: admin          // futuro multi-utente, al momento fisso
Content-Type: application/json
```

## 2. Requisiti server

* PHP >= 7.4 con `openssl` (per AES-256-GCM) e `zlib` (per `gzencode`). Verifica: `php -m | grep -E 'openssl|zlib'`
* Nessun DB necessario. Cartella `storage/` scrivibile da PHP (`chmod 755` + owner `www-data` / utente hosting).
* Se il provider lo permette, sposta `storage/` **fuori** da `DocumentRoot` (es. `../data/sync_storage`) e modifica `getStoragePath()` in `sync.php:84`. Altrimenti il file `.htaccess` già incluso (`Require all denied` + `Options -Indexes`) blocca l'accesso diretto a `*.json/*.enc/*.dat`.

## 3. Installazione

```bash
# 1) Copia la cartella sul server (mantieni la struttura)
scp -r remoteSync user@server:/var/www/html/

# 2) Permessi
ssh user@server
chmod 755 /var/www/html/remoteSync/PHP/storage
chown www-data:www-data /var/www/html/remoteSync/PHP/storage  # o utente PHP-FPM
# verifica che sync.php sia leggibile
php -l /var/www/html/remoteSync/PHP/sync.php && echo OK

# 3) Test rapido da shell
curl -s https://tuosito/remoteSync/PHP/sync.php?action=pull | jq
# atteso: {"tasks":[],"serverTime":"...","count":0,"total":0}

# 4) Test con token + cifratura
curl -s -X POST https://tuosito/remoteSync/PHP/sync.php?action=push \
  -H 'Authorization: Bearer mytoken123' \
  -H 'X-Enc-Password: secretpw' \
  -H 'Content-Type: application/json' \
  -d '{"tasks":[{"luid":1,"title":"hello","lastEdit":"2026-09-17T12:00:00.000Z","status":1}]}' | jq
```

Se il server è Apache, `.htaccess` è già attivo. Se è Nginx, aggiungi:

```nginx
location ~ ^/remoteSync/PHP/storage/ { deny all; return 404; }
location ~ \.(enc|json|dat)$ { deny all; }
```

## 4. Primo collegamento dal client

### 4.1 Apri le Impostazioni

1. Apri `dash.html` nel browser.
2. Click ingranaggio (navbar destra) → **Settings** (`#settingsModal`).
3. Sezione **Sync Remoto** (nuovo form):

   * **Sync Endpoint URL**: incolla l'URL completo di `sync.php`, es.

     ```
     https://tuosito/remoteSync/PHP/sync.php
     http://192.168.1.10/PouchTasker/remoteSync/PHP/sync.php   # LAN
     http://127.0.0.1:8765/remoteSync/PHP/sync.php              # test locale php -S
     ```
   * **Bearer Token (opzionale)**: stringa segreta condivisa tra i tuoi dispositivi. Vuoto = file `anonymous` (ok per test, sconsigliato in prod). **Stesso token su tutti i device che devono sincronizzarsi.**
   * **Encryption Password (opzionale, separata)**: se valorizzata, lo storage remoto diventa `*.enc` (gzip + AES-256-GCM). Senza, resta `*.json` leggibile sul server. Usa una password diversa dal token.

### 4.2 Test connessione

Click **Test Sync** nella modale:

* OK → `Sync OK (0 remote)` se il file remoto è vuoto (normale al primo avvio).
* Fail → `Sync fallito: ...` + `console.warn` (timeout 7s, CORS, URL errato). Il client **non si blocca**: puoi continuare a usare i task locali.

Verifica manuale in console:

```js
localStorage.getItem('syncEndpoint')
RemoteSync.isEnabled() // true se URL valido
RemoteSync.pull().then(d=>console.log(d))
```

### 4.3 Salva le Impostazioni

Click **Save Settings** → chiude la modale e avvia automaticamente `RemoteSync.pullOnLoad()` (async, 300ms dopo `loadAllTask`).

### 4.4 Primo sync incrementale (full dataset)

Il client mantiene `localStorage.syncLastSync` (ISO `serverTime`):

* **Se il server è vuoto** per quel token (`pull` → 0 task): al prossimo **Save** (click `Save` giallo, `Ctrl+S`, o modifica titolo/descrizione/star/depends e `Save`) il client raccoglie **tutti** i task locali con `lastEdit > null` (ovvero **intero dataset** attivo, filtrato `status!==0` + `status=0` per propagare delete) e fa `POST ?action=sync {since, tasks}`. Il server scrive il file.
* **Se il server ha già dati** (altro device ha già pushato): `pullOnLoad` al caricamento pagina scarica i `tasks` remoti e fa merge locale *newer-wins* (`lastEdit`/`lastWrite` alias, `Math.max(lastEdit,lastProgress)`). Se ci sono merge, `loadAllTask()` refresha la UI.

Da questo momento il sync è **incrementale**: solo task con `lastEdit > syncLastSync` vengono inviati/ricevuti.

### 4.5 Verifica primo sync riuscito

* Dopo il primo **Save**, ricarica la pagina (o apri un altro browser/device con stesso endpoint+token+encPassword) → i task devono comparire.
* `curl` lato server deve mostrare `total > 0`:

  ```bash
  curl -s -H 'Authorization: Bearer mytoken123' -H 'X-Enc-Password: secretpw' \
    https://tuosito/remoteSync/PHP/sync.php?action=pull | jq .total
  ```

## 5. Uso quotidiano

* **Save** = sync. Se non ci sono modifiche (`getModifiedItems().length===0`) il sync non parte (come richiesto).
* **Soft delete** (`status=0`, `lastEdit` aggiornato) viene propagato al prossimo Save. I task cancellati restano nascosti localmente ma nel file remoto.
* **Svuota cestino** (Settings → `Svuota cestino`): invia `tombstones=[luid]` al server (hard delete remoto consistente) poi `bulkDocs _deleted` locale e refresh. Al prossimo pull quel `luid` non verrà più restituito.
* Timeout/indisponibilità endpoint: `console.warn('[sync] ...')`, nessun toast bloccante, l'app resta usabile offline.

## 6. Cambio password cifratura

Se cambi `Encryption Password` dopo che esiste `*.enc`, il server risponderà `401 Storage is encrypted, provide X-Enc-Password` o `Failed to decrypt`. Soluzioni:

* Ripristina la vecchia password, fai `pull` → `push` con nuova password (il server cancella il vecchio `.enc` e crea il nuovo).
* Oppure cancella manualmente il file in `storage/` (perdi i dati remoti, ma i client locali li ripusheranno al prossimo Save).

## 7. Troubleshooting

| Sintomo | Causa | Fix |
|---------|-------|-----|
| `Sync failed: endpoint non valido` | URL senza `https://` o senza `sync.php` | Correggi `Sync Endpoint URL` |
| `CORS error` in console | Server senza `Access-Control-Allow-*` | Verifica `sync.php:12-15` e che non ci sia proxy che rimuove header |
| `401 Storage is encrypted` | `X-Enc-Password` mancata/errata | Reinserisci password corretta in Settings |
| `File not writable` / `500 Failed to save storage` | Permessi `storage/` | `chmod 755` + `chown www-data` |
| Task duplicati `luid` tra device | Creazione offline contemporanea | Risolto via newer-wins; i nuovi task con `luid` inedito vengono inseriti, se conflitto `lastEdit` vince il più recente |
| Sync non parte al Save | Nessuna modifica locale | Modifica un task (titolo/descrizione/star) poi Save; verifica `RemoteSync.isEnabled()===true` |

## 8. Riferimenti codice

* Client: `js/remote-sync.js:5` (`SYNC_TIMEOUT_MS 7000`, `LS_*`, `fetchWithTimeout`, `mergeRemoteTasks`), `js/myscript.js:361` `hardDeleteTrash`, `js/myscript.js:913` `sendUpdate` sync hook, `js/myscript.js:1201` `loadAllTask` pull 300ms, `js/modal-actions.js:130` Settings wiring.
* Server: `remoteSync/PHP/sync.php:84` `getStoragePath`, `108` `loadData`/`135` `saveData`, `152` `encryptData`/`160` `decryptData`.

Per supporto multi-endpoint futuro, `RemoteSync` è già strutturato per estendere `syncEndpoint` a array (vedi `CLAUDE.md:13`).
