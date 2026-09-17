# PouchTasker — Panoramica funzionale per AI / Refactoring

> Progetto SPA locale che gestisce task privati su PouchDB (browser-only). Stack: puro HTML/CSS/JS, no backend obbligatorio, no build. Sync remoto opzionale incrementale.

## 1. Scopo e vincoli
- App single-page `dash.html` per creazione, modifica, ordinamento, ricerca e completamento task.
- Persistenza solo locale: `PouchDB` (`js/pouchDB-9.0.0.min.js`) + fallback `localStorage` cache 60s.
- Sync remoto opzionale incrementale via `remoteSync/PHP/sync.php` (file storage, no DB esterno, vedi §13). Se non configurato l'app resta 100% offline.
- Ignora `notes/` e `.git/` per qualsiasi refactoring. `loginpage.js` è orfano (ex auth server, non usato da `dash.html`).

## 2. Entry point e dipendenze
| File | Ruolo | Note |
|------|-------|------|
| `dash.html:1` | Unico HTML, include tutti i CSS/JS | Modali (settings/import/subtask/delete/textarea), navbar tab, collapse editor nuovo task, `.myitems.sortable` |
| `js/myscript.js:1` | Monolite ~1270 righe: DB, state, rendering, azioni + hook sync | Da spezzare in refactoring |
| `js/remote-sync.js:1` | Client sync incrementale (260 righe) | `RemoteSync` global, `fetchWithTimeout 7000ms`, `pull/push/sync`, `mergeRemoteTasks` newer-wins |
| `remoteSync/PHP/sync.php:1` | Backend PHP microservizio (418 righe) | No DB, file `storage/<hash>.json/.enc`, azioni `pull/push/sync/get/search/update`, vedi §13 |
| `remoteSync/PHP/README.md:1` | Guida configurazione primo collegamento | Endpoint, token, enc password, troubleshooting |
| `js/modal-actions.js:1` | Handler modali Bootstrap | Leak: `addEventListener` dentro `show.bs.modal` senza cleanup (fix parziale `once:true` import) |
| `js/color-modes.js:1` | Theme light/dark/auto (Bootstrap docs) | `getStoredTheme/setStoredTheme/getPreferredTheme/setTheme` |
| `js/mobile-fix.js:1` | Fix viewport <575px + prevent pinch-zoom | `window.onload` set `user-scalable=no` |
| `css/mystyle.css:1` | Stili task, responsive, toast, textarea modal | Overflow mobile da sistemare |
| `css/fonts.css` | `@font-face` Inter/Atkinson/Lexend/NotoSans (OFL) | `assets/fonts/*.ttf` |
| `css/transformations.css` | `lucide-flip-vertical`, `lucide-spin` | |
| `css/animations.css` | `spin/burst/flashing/fade-*` (boxicons) | **Inutilizzato**, candidabile rimozione |
| `js/pouchDB-9.0.0.min.js`, `jquery-3.7.1.js`, `jquery-ui.js`, `bootstrap.bundle.min.js`, `lucide.min.js`, `bootstrap-datepicker.min.js` | Vendor | |

## 3. Modello dati task (PouchDB doc)
Doc in DB `mytasks` (`myscript.js:62-79`):
```
{
  _id, _rev,              // PouchDB
  luid: number,           // ID logico incrementale (db_getNextLUID:36)
  order: number,          // ordinamento utente (db_getNextOrder:42)
  title: string,          // required
  description: string,
  star: boolean,
  status: 0|1|2,          // 0=deleted (soft, filtrato in db_getTasks:52), 1=todo, 2=completed
  progress: number,       // contatore +1 ogni 24h (lastProgress)
  categories: string,     // csv "a,b,c" -> badge colorati (colorTopicsBadges:493)
  depends: string,        // csv di luid -> link <a href="#luid"> risolti in populateDepenciesTitles:536
  expireDate: string,     // "dd/mm/yyyy" (datepicker)
  lastEdit, lastWrite, lastProgress, completeDate: ISO string, // lastWrite alias di lastEdit (sync newer-wins)
  owner: 'admin', organization: 'myOrg', viewRole: ''
}
```
Alias `lastWrite` ≡ `lastEdit` mantenuto per compatibilità sync (`remote-sync.js:172` normalizza, `sync.php:92` `parseLastEdit` gestisce entrambi).

## 4. Layer DB e API finta
- `localDB = new PouchDB('mytasks')` (`myscript.js:9`)
- Helper: `db_getAllDocs:29`, `db_getNextLUID:36`, `db_getNextOrder:42`
- Operazioni: `db_getTasks:49`, `db_insertTask:55`, `db_updateTasks:87`, `db_setTaskStatus:113`, `db_progressTask:123`, `db_importTasks:134` (2 passate con `luidMap` per remap dipendenze)
- `makeRequest(type, endpoint, data)` (`211-254`) router che imita `fetch Response` (`mockOk/ErrResponse:21`) per retrocompatibilità con vecchio server. Endpoint: `/tasks`, `/insert`, `/update`, `/complete`, `/uncomplete`, `/progress`, `/delete`, `/import`, `/logout`.

## 5. State e cache
- `taskData{}[luid]=snapshot` (`14`), `selectedTab` da `localStorage.initialTab` (`2-5`), `cachedDataKey='JData'`.
- `saveDataToLocalStorage:267` (throttle 60s), `clearLocalStorageData:284` (destroy DB), `hardDeleteTrash:361` (push tombstones poi `bulkDocs _deleted`), `loadAllTask:1076` GET `/tasks` -> `populateTaskswithData` con fallback cache + `pullOnLoad` async 300ms se `RemoteSync.isEnabled()`.
- Sync state `localStorage syncEndpoint/syncToken/syncEncPassword` (disgiunti) + `syncLastSync` ISO `serverTime` (`remote-sync.js:8`).

## 6. Rendering task
- `populateTaskswithData:294` genera `innerHTML` stringa in `.myitems`, ordina `order DESC`, filtra per tab, calcola `disabledProgress` (24h), `depenciesHTML`, `completeAction`, `dateCompleted`.
- Filtro tab (`338-342`): `ALL`=>status1, `COMPLETED`=>status2, `STARRED`=>status1 && star true.
- `colorTopicsBadges:493` hash parola -> `bg-primary/secondary/...` span badge con `×` dismiss.
- `populateDepenciesTitles:536` risolve `href="#luid"` -> titolo task correlato.
- `translateDatePickers:472` locale IT datepicker, `lucide.createIcons()` dopo ogni render.

## 7. Interazioni utente
- **Tab**: `switchToTab:318` pill solo-icone `dash.html:93` + `css/mystyle.css:29 tab-pill` (full-height 56px), `currentTab` bianco.
- **Search overlay**: `#searchOverlay` pull-down `dash.html:76` + `toggleSearchOverlay`/`enableSearch:750` con swipe-down (scrollY==0, deltaY>60) + Escape/click fuori, bottone `#searchToggleBtn` solo-icona dentro `addTaskModal` (`dash.html: ~350`).
- **Navbar gear**: `navbar-pouch` 3 sezioni `logo|pill|settings gear` `dash.html:85` `min-height 72px stretch`, dropdown `min-width 220px` `bg-secondary`.
- **Nuovo task**: modal `#addTaskModal` (`dash.html: ~345` `modal-lg`) + `insertNewTask:1069` scope `#addTaskModal` -> POST `/insert` -> hide modal -> `loadAllTask`; collapse rimosso.
- **Modifica + Save**: editing inline (title/desc/expire/categories/depends/star/order via drag) -> `getModifiedItems:852` diff DOM vs `taskData` -> `sendUpdate:761` PUT `/update` con spinner `startSpinning:739` -> se `RemoteSync.isEnabled()` e modifiche presenti, `collectLocalChanges(since)` -> `syncIncremental` push/pull newer-wins (non-bloccante).
- **Complete/Uncomplete**: `completeTask:877` PUT `/complete|/uncomplete` + hide DOM.
- **Progress**: `upgradeTask:906` PUT `/progress` + disable 24h.
- **Delete**: soft `status=0` via `deleteTask:933` + modal `confirmDeleteModal` (`modal-actions.js:10`).
- **Subtask/Dependenze**: `addSubTaskModal` (`39`) scrive `<a href="#luid">` in `.deps` o `#newDepencyTask` (ricorda Save).
- **Sortable**: `jquery-ui sortable:1038` handle `.bd-placeholder`, `sortstop:1041` ricalcola `order`.
- **Search**: `enableSearch:751` + `toggleSearchOverlay` filtro `input.title+desc+categories` se >2 char, guard `_searchInitialized`.
- **Ordinamento data**: `orderByExpDate:1024` sort DOM per `parseDate:1017`.
- **Export/Import**: `exportTaskAsFile:790` GET `/tasks` -> Blob o `FlutterExport`, `db_importTasks:134` via modal `importTaskModal:178`.
- **Expand/Collapse**: `expand-toggler` toggle `.desc.expanded` + `.collapse.showed`, `collapseAllItems:585`.
- **Textarea mobile**: `textareaModal:427` overlay glass per `window.innerWidth<=992` (`modal-actions.js:232`), X 44px mobile.
- **Shortcut**: `Ctrl+S` -> Save (`1009`).

## 8. Modali (`dash.html:303`, `modal-actions.js`)
- `addSubTaskModal:39` datalist da `.myitem[luid]` escluso self, map `valueMap`.
- `confirmDeleteModal:10` legge `data-bs-deleteID/Name`.
- `settingsModal:127` legge `localStorage theme/lang/initialTab` + `syncEndpoint/syncToken/syncEncPassword`, su Save scrive tutti + trigger `pullOnLoad`; contiene `Test Sync` (pull + merge) e `Svuota cestino` (`hardDeleteTrash`).
- `importTaskModal:178` FileReader + POST `/import`.
- `addTaskModal: ~345` nuovo task con tutti i campi + search icon solo-icona, focus title su `show.bs.modal` (`modal-actions.js`) + `insertNewTask` con chiusura modal.
- Bug: ogni `show.bs.modal` ri-aggiunge `click` listener su `sendBtn` senza `removeEventListener` -> handler multipli.

## 9. Settings e theming + i18n
- `color-modes.js:7-27` `getStoredTheme/setStoredTheme/getPreferredTheme/setTheme` + `matchMedia` listener.
- `myscript.js:3-50` `I18N{en,it}` + `t()/applyI18n()` con `data-i18n`/`data-i18n-placeholder` su `dash.html`, `getStoredLang` guida anche datepicker.
- `localStorage`: `theme`, `lang`, `initialTab`, `fontScale` (80-150%), `fontFamily` (system-ui/Inter/Atkinson/Lexend/NotoSans), `JData`.
- `settingsModal` salva `theme/lang/initialTab/fontScale/fontFamily`; `applyFontScale/applyFontFamily` via CSS var `--task-font-scale/--task-font-family`.
- Sync settings: `syncEndpoint` URL `sync.php` + `syncToken` Bearer (vuoto default) + `syncEncPassword` cifratura (disgiunta), `syncLastSync` ISO, `js/remote-sync.js:8`, `dash.html: ~305 syncEndpoint/syncToken/syncEncPassword`, `modal-actions.js:130` Test Sync / Svuota cestino.

## 10. Bug noti (fixati)
- **STARRED**: fixato `mapItemData`->`.star-icon`, normalizzato bool, `enableDynamicActions` con `.off()`.
- **Overflow mobile**: fixato `#collapseEditor`/`myitem` wrap + `min-width:0`; action bar wrap 600px, navbar shrink 500/360px in `mystyle.css:121-200`, icon-only <600px.
- **DPI scaling globale** scartato: `scale/zoom` su `html` rompe fixed/toast/sortable; sostituito da `font-scale` 80-150% + `fontFamily`.

## 11. Dove cercare per refactoring
| Obiettivo | File:riga |
|-----------|-----------|
| Schema task / validazione | `myscript.js:55-85`, `959-1000` |
| Router API finta | `myscript.js:211-254` |
| Rendering e filtro tab | `myscript.js:294-469` |
| Star toggle | `myscript.js:595-626`, `820-849`, `852-874` |
| Categorie badge | `myscript.js:488-533`, `556-582` |
| Dipendenze | `myscript.js:536-553`, `843-846`, `1047-1073` |
| Search | `myscript.js:688-715` |
| Sortable/order | `myscript.js:1038-1045`, `1017-1035` |
| Export/Import | `myscript.js:789-204`, `modal-actions.js:178-230` |
| Settings/Theme/Font | `dash.html:358-400`, `color-modes.js`, `modal-actions.js:127-175`, `mystyle.css` |
| Sync client | `js/remote-sync.js:1`, `myscript.js:353 hardDeleteTrash`, `myscript.js:913 sendUpdate sync hook`, `myscript.js:1201 pullOnLoad` |
| Sync server | `remoteSync/PHP/sync.php:84 getStoragePath`, `108 loadData`, `135 saveData`, `152 encrypt` |
| Responsive/Overflow | `mystyle.css:35-83`, `dash.html:77-127`, `mobile-fix.js` |

## 12. Roadmap refactoring suggerita
1. Spezzare `myscript.js` in ES modules: `db.js`, `store.js`, `render.js`, `actions.js`, `utils/date.js`.
2. Sostituire HTML stringa con template `<template>` o lit-html, evitare `innerHTML` massivo.
3. Centralizzare event binding con delegazione (`$(document).on`) e cleanup.
4. Tipizzare task con JSDoc/TS, validare `expireDate` ISO.
5. Rimuovere `animations.css` se non usato, `loginpage.js` o documentarlo come legacy.
6. Test: PouchDB in-memory + `loadAllTask` snapshot.

## 13. Sync remoto incrementale

- **Client** `js/remote-sync.js:8` `LS syncEndpoint/syncToken/syncEncPassword/syncLastSync`, `isEnabled()` check URL, `fetchWithTimeout 7000ms` con `AbortController` + `console.warn` non bloccante, `buildHeaders()` invia `Authorization: Bearer` e `X-Enc-Password` disgiunti + `X-User: admin` per multi-utente.
- **Pull** `GET ?action=pull&since=ISO` filtra `lastEdit>since`; senza `since` o server vuoto ritorna tutto (bootstrap primo sync richiede full dataset). **Push** `POST ?action=push {tasks,tombstones}`, **sync** `POST ?action=sync {since,tasks}` atomico usato su Save. Supportati anche `get/search/update` per microservizio.
- **Incrementale su Save**: `sendUpdate:913` se `RemoteSync.isEnabled()` e `modifiedItems.length>0` raccoglie `collectLocalChanges(since)` (include `status=0`) e fa `syncIncremental` push+pull, poi `mergeRemoteTasks` newer-wins (`lastEdit`/`lastWrite` alias, `Math.max(lastEdit,lastProgress)`).
- **Pull on load**: `loadAllTask:1201` dopo render locale avvia `setTimeout 300ms RemoteSync.pullOnLoad()` async, merge + `loadAllTask()` refresh se modifiche.
- **Soft/hard delete**: `status=0` propagato al prossimo push; `Svuota cestino` `hardDeleteTrash:361` invia `tombstones` al server (delete remoto consistente) poi `bulkDocs _deleted` locale.
- **Storage server** `remoteSync/PHP/sync.php:84` file `storage/<sha256(token|user)>.json` in chiaro o `.enc` `gzencode+AES-256-GCM` se `encPassword` presente; `.htaccess` deny `*.json/*.enc`; preferibile fuori `DocumentRoot` se hosting lo permette; lock `LOCK_EX`.
- **Primo collegamento**: configurare `dash.html:305` `syncEndpoint` URL completo `sync.php`, `syncToken` uguale su tutti i device, `syncEncPassword` uguale se cifrato; **Test Sync** fa `pull` di verifica; **Save Settings** salva e triggera `pullOnLoad`; primo `Save` con dataset locale invia full dataset se server vuoto.
- **Non bloccante**: timeout o indisponibilità loggano `console.warn` e non impediscono uso; `isEnabled()` falso se endpoint vuoto/invalido => offline puro.
