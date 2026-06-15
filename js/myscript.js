// ─── PERSISTENT SETTINGS ─────────────────────────────────────────────────────
let getStoredInitialTab = () => localStorage.getItem('initialTab') ?? 'ALL';
let setStoredInitialTab = tab => localStorage.setItem('initialTab', tab);
let getStoredLang       = () => localStorage.getItem('lang') ?? 'en';
let setStoredLang       = lang => localStorage.setItem('lang', lang);

// ─── POUCHDB LOCAL DATABASE ───────────────────────────────────────────────────
// pouchDB-9.0.0.min.js is already included in the page before this script.
const localDB = new PouchDB('mytasks');
localDB.info().then(info => console.log('[PouchDB] ready:', info.db_name));

// ─── APP STATE ────────────────────────────────────────────────────────────────
const cachedDataKey = 'JData';
let taskData    = {};           // snapshot indexed by luid (object, not array)
let selectedTab = getStoredInitialTab();
let _searchInitialized = false; // guard against duplicate search listeners

// ─── MOCK RESPONSE ────────────────────────────────────────────────────────────
// Mimics the subset of the Fetch Response API used by the rest of the script,
// so every caller continues to work unchanged.
function mockOkResponse(data) {
    return { ok: true,  status: 200, statusText: 'OK',    json: () => Promise.resolve(data) };
}
function mockErrResponse(status, message) {
    return { ok: false, status,      statusText: message, json: () => Promise.resolve({ message }) };
}

// ─── POUCHDB HELPERS ──────────────────────────────────────────────────────────
async function db_getAllDocs() {
    const result = await localDB.allDocs({ include_docs: true });
    return result.rows
        .filter(r => !r.id.startsWith('_design/'))
        .map(r => r.doc);
}

async function db_getNextLUID() {
    const docs = await db_getAllDocs();
    if (!docs.length) return 1;
    return Math.max(...docs.map(d => d.luid || 0)) + 1;
}

async function db_getNextOrder() {
    const docs = await db_getAllDocs();
    return docs.length + 1;
}

// ─── DB OPERATIONS ────────────────────────────────────────────────────────────

async function db_getTasks() {
    const docs = await db_getAllDocs();
    // Exclude logically-deleted tasks (status === 0)
    return mockOkResponse(docs.filter(d => d.status !== 0));
}

async function db_insertTask(newTask) {
    if (!newTask?.title?.trim().length) {
        return mockErrResponse(400, 'Title is required');
    }
    const luid  = await db_getNextLUID();
    const order = await db_getNextOrder();

    const task = {
        owner:        'admin',
        luid,
        order,
        organization: 'myOrg',
        viewRole:     '',
        title:        newTask.title,
        star:         false,
        status:       1,
        description:  newTask.description || '',
        progress:     1,
        categories:   newTask.categories  || '',
        depends:      newTask.depency     || '',
        expireDate:   newTask.expireDate  || '',
        lastEdit:     new Date().toISOString(),
        lastProgress: new Date('1990-01-01').toISOString(),
        completeDate: ''
    };

    const saved = await localDB.post(task);
    return saved.ok
        ? mockOkResponse({ message: 'Task added', data: { _id: saved.id, _rev: saved.rev } })
        : mockErrResponse(501, 'Task not added');
}

async function db_updateTasks(modifiedItems) {
    if (!Array.isArray(modifiedItems) || modifiedItems.length === 0) {
        return mockErrResponse(400, 'Invalid or empty modifiedItems');
    }
    for (const item of modifiedItems) {
        try {
            const doc = await localDB.get(item._id);
            Object.assign(doc, {
                order:       item.order,
                title:       item.title,
                star:        item.star,
                description: item.description,
                progress:    item.progress,
                expireDate:  item.expireDate,
                categories:  item.categories,
                depends:     item.depends,
                lastEdit:    new Date().toISOString()
            });
            await localDB.put(doc);
        } catch (err) {
            console.error('[db_updateTasks] error on', item._id, err);
        }
    }
    return mockOkResponse({ message: 'Tasks updated' });
}

async function db_setTaskStatus(taskItem, status) {
    const doc = await localDB.get(taskItem._id);
    doc.status   = status;
    doc.lastEdit = new Date().toISOString();
    if (status === 2) doc.completeDate = new Date().toISOString();
    if (status === 1) doc.completeDate = '';
    await localDB.put(doc);
    return mockOkResponse({ message: 'Task status updated' });
}

async function db_progressTask(taskItem) {
    const doc = await localDB.get(taskItem._id);
    doc.progress     = (doc.progress || 0) + 1;
    doc.lastProgress = new Date().toISOString();
    await localDB.put(doc);
    return mockOkResponse({ message: 'Task progressed' });
}

/*
 * Importa un array di task da JSON (formato uguale all'export).
 */
async function db_importTasks(jsonData) {
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
        return mockErrResponse(400, 'Input must be a non-empty array of tasks');
    }
 
    console.log(`[import] Importing ${jsonData.length} task(s)…`);
 
    // Valori correnti nel DB locale: tutti i nuovi luid/order devono essere ≥ questi
    let minLUID  = await db_getNextLUID();   // = maxLUID esistente + 1
    let minOrder = await db_getNextOrder();  // = count docs + 1
 
    // Mappa dei luid riassegnati: { vecchioLuid: nuovoLuid }
    // Serve per aggiornare le dipendenze dopo il remap.
    const luidMap = {};
 
    // Passata 1 – sanitize: rimuovi _id/_rev, risolvi conflitti luid/order
    const sanitized = jsonData.map(task => {
        // Distruggi le chiavi PouchDB del DB sorgente
        const { _id, _rev, ...taskData } = task;
 
        // Mocka owner e org (niente autenticazione in modalità locale)
        taskData.owner        = 'admin';
        taskData.organization = 'myOrg';
 
        // Risolvi conflitto LUID
        if (!taskData.luid || taskData.luid < minLUID) {
            luidMap[taskData.luid] = minLUID;   // registra la sostituzione
            taskData.luid = minLUID;
            minLUID++;
        }
 
        // Risolvi conflitto ORDER
        if (!taskData.order || taskData.order < minOrder) {
            taskData.order = minOrder;
            minOrder++;
        }
 
        return taskData;
    });
 
    // Passata 2 – aggiorna i riferimenti di dipendenza con i nuovi luid
    const toInsert = sanitized.map(task => {
        if (task.depends && task.depends.trim().length > 0) {
            task.depends = task.depends
                .split(',')
                .map(dep => dep.trim())
                .filter(Boolean)
                .map(dep => {
                    // Controlla sia la chiave stringa che numerica (sicurezza di tipo)
                    const remapped = luidMap[dep] ?? luidMap[parseInt(dep, 10)];
                    return remapped !== undefined ? String(remapped) : dep;
                })
                .join(',');
        }
        return task;
    });
 
    // Inserimento bulk
    const results = await localDB.bulkDocs(toInsert);
 
    const errors = results.filter(r => r.error);
    if (errors.length === 0) {
        return mockOkResponse({ message: `All ${results.length} task(s) imported successfully :)` });
    } else if (errors.length < results.length) {
        console.warn('[import] Partial errors:', errors);
        return mockOkResponse({ message: `WARNING: ${errors.length}/${results.length} task(s) failed to import` });
    } else {
        console.error('[import] All inserts failed:', errors);
        return mockErrResponse(503, 'Import failed: no tasks were added');
    }
}
 

// ─── makeRequest DROP-IN REPLACEMENT ─────────────────────────────────────────
// Same external signature as the original. The `endpoint` parameter now maps
// to a local PouchDB operation instead of an HTTP route. No cookies, no JWT,
// no external network call is needed.
const makeRequest = (type, endpoint, data = undefined) => {
    let body;
    try { body = data ? JSON.parse(data) : undefined; }
    catch (e) { body = data; }

    return (async () => {
        try {
            switch (endpoint) {
                case '/tasks':
                    if (type.toUpperCase() === 'GET')    return await db_getTasks();
                    break;
                case '/insert':
                    if (type.toUpperCase() === 'POST')   return await db_insertTask(body?.newTask);
                    break;
                case '/update':
                    if (type.toUpperCase() === 'PUT')    return await db_updateTasks(body?.modifiedItems);
                    break;
                case '/complete':
                    if (type.toUpperCase() === 'PUT')    return await db_setTaskStatus(body?.taskItem, 2);
                    break;
                case '/uncomplete':
                    if (type.toUpperCase() === 'PUT')    return await db_setTaskStatus(body?.taskItem, 1);
                    break;
                case '/progress':
                    if (type.toUpperCase() === 'PUT')    return await db_progressTask(body?.taskItem);
                    break;
                case '/delete':
                    if (type.toUpperCase() === 'DELETE') return await db_setTaskStatus(body?.taskItem, 0);
                    break;
                case '/import':
                if (type.toUpperCase() === 'POST') return await db_importTasks(body);
                break;
                case '/logout':
                    return mockOkResponse({ message: 'Logged out' });
                default:
                    return mockErrResponse(404, `Unknown endpoint: ${endpoint}`);
            }
            return mockErrResponse(405, 'Method not allowed');
        } catch (err) {
            console.error(`[makeRequest] ${type.toUpperCase()} ${endpoint}`, err);
            return mockErrResponse(500, err.message);
        }
    })();
};

// ─── TAB MANAGEMENT ──────────────────────────────────────────────────────────
function switchToTab(tab) {
    selectedTab = tab;
    $(".currentTab").text(tab.charAt(0).toUpperCase() + tab.slice(1).toLowerCase());
    $('.navbar-nav .btn-check').prop('checked', false);
    $('.navbar-nav .btn-check[tab="' + selectedTab + '"]').prop('checked', true);
    loadAllTask();
}

// ─── LOCAL STORAGE CACHE ─────────────────────────────────────────────────────
// Kept as a secondary display fallback in case PouchDB itself fails.
function saveDataToLocalStorage(freshData) {
    const cachedData = localStorage.getItem(cachedDataKey);
    const MAX_CACHE_AGE = 60 * 1000;
    let shouldSave = true;
    if (cachedData) {
        try {
            const parsedData = JSON.parse(cachedData);
            if (parsedData && Date.now() - parsedData.timestamp <= MAX_CACHE_AGE) {
                shouldSave = false;
            }
        } catch (e) { /* stale/invalid cache, overwrite */ }
    }
    if (shouldSave) {
        localStorage.setItem(cachedDataKey, JSON.stringify({ data: freshData, timestamp: Date.now() }));
    }
}

function clearLocalStorageData() {
    localStorage.removeItem(cachedDataKey);
    localDB.destroy().then(function (response) {
        // success
    }).catch(function (err) {
        console.log(err);
    });
}

// ─── DOM RENDERING ────────────────────────────────────────────────────────────
function populateTaskswithData(data) {
    const tableBody = document.querySelector('.myitems');
    if (!tableBody) return;
    let rows = '';

    if (data === undefined || data === null) {
        console.error("Error: data undefined.");
        return;
    }

    // Order by user-defined order DESC
    data.sort((a, b) => b.order - a.order);

    data.forEach((item) => {

        // Save snapshot indexed by luid
        taskData[item.luid] = item;

        // Disable progress button if updated within the last 24 h
        let disabledProgress = "";
        const differenceTimeToProgress = 24 * 60 * 60 * 1000;
        const difference = Date.now() - new Date(item.lastProgress).getTime();
        if (difference < differenceTimeToProgress) {
            disabledProgress = "disabled";
        }

        const starred = item.star === true ? 's' : '';

        let depenciesHTML  = '';
        const hideDepencies = item.depends && item.depends.length ? '' : 'd-none';
        if (!hideDepencies.length) {
            depenciesHTML = item.depends.split(',').map(dep_id =>
                `<a class="depency alert" role="alert" href="#${dep_id.trim()}"></a>`
            ).join('&nbsp');
        }

        const completeAction = selectedTab === "COMPLETED" ? "Uncomplete" : "Complete";

        let dateCompleted = selectedTab === "COMPLETED" ? new Date(item.completeDate) : "";
        dateCompleted = (dateCompleted !== "" && !isNaN(dateCompleted.getDay()))
            ? `${dateCompleted.getDate()}/${dateCompleted.getMonth() + 1}/${dateCompleted.getFullYear()}`
            : "";

        // Tab filter
        if (
            (item.status !== 1 && selectedTab === "ALL") ||
            (item.status !== 2 && selectedTab === "COMPLETED") ||
            ((item.status !== 1 || item.star === false) && selectedTab === "STARRED")
        ) { return; }

        rows += `
                <div class="container mt-3 text-body-secondary myitem border-bottom w-100" data-value="${item._id}" rev="${item._rev}" luid="${item.luid}" order="${item.order}">
                    <div class="row flex-nowrap">
                        <!-- Grab handle -->
                        <div class="col-auto mh-100 bd-placeholder grab" style="width: 32px;">
                            <i data-lucide="menu" class="lucide-sm opacity-50 position-relative top-50 start-50 translate-middle"></i>
                        </div>

                        <!-- Main Content -->
                        <div class="flex-grow-1" style="flex-basis: 0;">
                            <div class="content justify-content-between">
                                <div class="row g-0" style="max-height: 1.2em;">
                                    <div class="col-6 col-sm-6 col-md-7 col-lg-6 flex-nowrap">
                                        <input type="text" class="form-control title bg-transparent border-0 px-1 opacity-75" placeholder="Titolo" aria-label="Title of task" value="${item.title}">
                                    </div>
                                    <div class="col-1 col-sm-1 col-md-1 col-lg-3 flex-nowrap"></div>
                                    <div class="col-5 col-sm-5 col-md-4 col-lg-3 flex-nowrap" style="max-height: 1em;">
                                        <div class="input-group date d-flex flex-nowrap justify-content-end">
                                            <input type="text" class="form-control-sm fw-light pe-none text-body-secondary bg-transparent float-end text-end exp-date" value="${item.expireDate}" placeholder="" style="border: 0; min-width: 0px!important;">
                                            <span class="input-group-text datapickertoggler" style="border: 0;">
                                                <i data-lucide="calendar-days"
                                                class="lucide-sm opacity-50"
                                                role="button"></i>
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div class="divider"></div>

                                <textarea class="form-control bg-transparent border-0 text-break p-1 desc" aria-label="Description" rows="1">${item.description}</textarea>
                            </div>
                        </div>

                        <div class="col" style="flex-basis: 0; max-width: min-content; overflow: auto;">
                            <div class="row flex-wrap">
                                <div class="col collapse">
                                    <div class="row mt-2 justify-content-center">
                                        <div class="row mb-2">
                                            <div class="col m-0 px-1">
                                                <button class="btn btn-primary w-100 m-0 text-truncate completer" aria-label="Complete task">${completeAction}</button>
                                            </div>
                                            <div class="col m-0 px-1">
                                                <button class="btn btn-secondary w-100 m-0 text-truncate advance" aria-label="Add progress" ${disabledProgress} value="${item.progress}">+ ${item.progress}</button>
                                            </div>
                                        </div>

                                        <div class="row p-0 mb-2">
                                            <div class="m-0 mb-1 font-lighter categories col-auto">
                                                ${item.categories}
                                            </div>
                                            <input class="p-0 px-3 bg-transparent text-center addcategory" style="font-size: 0.87rem; border: 0!important" type="text" placeholder="+ category" aria-label="add" maxlength="18" value="">
                                            <div class="col-auto"></div>
                                        </div>

                                        <div class="row p-0 mb-2">
                                            <div class="mt-2 ${hideDepencies}">
                                                <span><b>Depends on:</b>&ensp;<span class="deps">${depenciesHTML}</span></span>
                                            </div>
                                        </div>`
                                        +
                                        (dateCompleted !== "" ?
                                        `<div class="row p-0 mb-2">
                                            <div class="mt-2" style="font-size: 0.87rem;">
                                                <span>Completed on:&ensp;<b>${dateCompleted}</b></span>
                                            </div>
                                        </div>` : '')
                                        +
                                    `</div>
                                </div>

                                <!-- Toggler / action buttons -->
                                <div class="col">
                                    <div class="d-flex flex-row-reverse">

                                        <button class="btn btn-outline-primary p-2 m-1 m-md-2 expand-toggler"
                                                aria-label="Toggle details"
                                                style="max-width: max-content;"
                                                data-bs-toggle="button"
                                                autocomplete="off"
                                                aria-pressed="true">
                                            <i data-lucide="chevron-down"
                                            class="lucide-sm expand-toggler"></i>
                                        </button>

                                        <button class="btn btn-outline-warning p-2 m-1 m-md-2 collapse star-toggler"
                                                aria-label="Star"
                                                style="max-width: max-content;">
                                            <i data-lucide="star"
                                            class="lucide-sm star-icon ${item.star == 'true' || item.star === true ? 'starred' : ''}"
                                            starred="${item.star}"></i>
                                        </button>

                                        <button class="btn btn-outline-primary p-2 m-1 m-md-2 collapse"
                                                aria-label="New Subtask"
                                                style="max-width: max-content;"
                                                data-bs-toggle="modal"
                                                data-bs-target="#addSubTaskModal"
                                                data-bs-requiredfor="${item.title}"
                                                data-bs-requiredforID="${item.luid}">
                                            <i data-lucide="circle-plus" class="lucide-sm"></i>
                                        </button>

                                        <button class="btn btn-outline-danger p-2 m-1 m-md-2 collapse"
                                                aria-label="Trash"
                                                style="max-width: max-content;"
                                                data-bs-toggle="modal"
                                                data-bs-target="#confirmDeleteModal"
                                                data-bs-deleteName="${item.title}"
                                                data-bs-deleteID="${item.luid}">
                                            <i data-lucide="trash-2" class="lucide-sm"></i>
                                        </button>

                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>

        `;
    });

    tableBody.innerHTML = rows;
}

// ─── DATEPICKER ───────────────────────────────────────────────────────────────
function translateDatePickers() {
    if (!$.fn.datepicker) return;
    $.fn.datepicker.dates['it'] = {
        days:        ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"],
        daysShort:   ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"],
        daysMin:     ["Do",  "Lu",  "Ma",  "Me",  "Gi",  "Ve",  "Sa"],
        months:      ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"],
        monthsShort: ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"],
        today:       "Oggi",
        clear:       "",
        format:      "dd/mm/yyyy",
        titleFormat: "MM yyyy",
        weekStart:   1
    };
}

// ─── CATEGORY BADGES ─────────────────────────────────────────────────────────
function colorAllTopicsBadges() {
    document.querySelectorAll('.categories').forEach(el => colorTopicsBadges(el));
}

function colorTopicsBadges(categoryElement) {
    categoryElement = $(categoryElement);
    let elementHtml = categoryElement.html();
    if (!elementHtml || elementHtml.length === 0) return;

    let textContent = '';
    const lastSpanIndex = elementHtml.lastIndexOf('</span>');

    if (lastSpanIndex === -1) {
        textContent  = categoryElement.text().trim();
        elementHtml  = '';
    } else {
        textContent = elementHtml.substring(lastSpanIndex + 7).trim();
        elementHtml = elementHtml.substring(0, lastSpanIndex + 7);
    }

    if (textContent.length < 1) return;

    const words = textContent.split(',').map(w => w.trim()).filter(Boolean);

    const colorClasses = [
        'bg-primary', 'bg-secondary', 'bg-success',
        'bg-warning text-dark', 'bg-info text-dark', 'bg-success', 'bg-dark'
    ];

    const modifiedContent = words.map(word => {
        let hashNum = 0;
        for (let i = 0; i < word.length; i++) {
            hashNum += word.toLocaleUpperCase().charCodeAt(i);
        }
        const hashBack = colorClasses[hashNum % colorClasses.length];
        return `<span role="alert" class="alert z-0 badge rounded-pill bg-primary m-0 p-1 text-white ${hashBack}">
                <i>${word}</i>
                <button type="button" class="m-0 p-0 bg-transparent border-0 text-white" data-bs-dismiss="alert" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
                </span>`;
    }).join(' ');

    categoryElement.html(elementHtml + modifiedContent);
}

// ─── DEPENDENCY TITLES ────────────────────────────────────────────────────────
function populateDepenciesTitles() {
    document.querySelectorAll('.depency').forEach(depencyElement => {
        if (!depencyElement.hasAttribute('href') || depencyElement.textContent.length > 0) return;

        const href    = depencyElement.getAttribute('href').split('#')[1];
        const related = taskData[href] ?? taskData[parseInt(href)];

        if (related && related.title && related.title.length > 0) {
            const depencyTitle = related.status === 1
                ? related.title
                : `${related.title} (Completed)`;
            depencyElement.innerHTML = depencyTitle +
                `<button type="button" class="m-0 p-0 bg-transparent border-0" data-bs-dismiss="alert" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                 </button>`;
        }
    });
}

// ─── NEW TOPIC INPUT ──────────────────────────────────────────────────────────
function insertNewTopic() {
    $('input.addcategory').keydown(function (e) {
        if (e.which !== 13) return;
        const $input = $(e.target);
        const newTopic = $input.val().trim();
        if (newTopic.length > 0) {
            const $related = $input.parent().find('.categories');
            $related.append(' ' + newTopic);
            colorTopicsBadges($related);
            $input.val('');
        }
        return false;
    });

    $('input#newTopics').keydown(function (e) {
        if (e.which !== 13) return;
        const $input = $(e.target);
        const newTopic = $input.val().trim();
        if (newTopic.length > 0) {
            const $related = $input.parent().find('#newTopicsSpan');
            $related.append(' ' + newTopic);
            colorTopicsBadges($related);
            $input.val('');
        }
        return false;
    });
}

// ─── COLLAPSE / EXPAND ───────────────────────────────────────────────────────
function collapseAllItems() {
    document.querySelectorAll('.desc').forEach(textareaElement => {
        if (textareaElement.classList.contains("expanded")) {
            $(textareaElement).closest('.myitem').find('button.expand-toggler').click();
            textareaElement.scrollTop = 0;
        }
    });
}

// ─── DYNAMIC ACTION BINDINGS ─────────────────────────────────────────────────
function enableDynamicActions() {

    // Expand toggler
    $('button.expand-toggler').on("click", function (e) {
        const target = e.target;
        const $item  = $(target).closest('.myitem');
        const desc         = $item.find('.desc');
        const collapsables = $item.find('.collapse');

        if (!desc.length) { console.log('No desc found'); return; }

        if ($(target).hasClass('lucide')) {
            $(target).toggleClass('lucide-flip-vertical');
        } else {
            $(target).find('.lucide').toggleClass('lucide-flip-vertical');
        }
        desc.toggleClass("expanded");
        collapsables.toggleClass("showed");
    });

    // Star toggler
    $('button.star-toggler').on("click", function (e) {
        const target = e.target;
        const $star  = target.hasAttribute('starred') ? $(target) : $(target).find('svg.star-icon');
        if ($star.attr('starred') === "true") {
            $star.attr('starred', false)
                .removeClass('starred');
        } else {
            $star.attr('starred', true)
                .addClass('starred');
        }
    });

    // Datepicker toggler
    $('.datapickertoggler').on("click", function (e) {
        const $input = $(e.target).closest('.input-group').find('input[type="text"]');
        if (!$input.length) { console.warn('No input date found'); return; }
        if (!$input.data('datepicker')) {
            $input.datepicker({
                autoclose:  true,
                format:     'dd/mm/yyyy',
                language:   getStoredLang(),
                leftArrow:  '<i data-lucide="chevron-left" class="lucide-sm" role="button"></i>',
                rightArrow: '<i data-lucide="chevron-right" class="lucide-sm" role="button"></i>',
                clearBtn:   true
            });
        }
        $input.datepicker('show');
    });

    // Complete / Uncomplete — await the Promise before reacting
    $('button.completer').on("click", async function (e) {
        const $btn     = $(e.target);
        const taskLUID = $btn.closest('.myitem').attr('luid');
        try {
            const ok = await completeTask(taskLUID);
            if (ok) {
                $btn.closest('.myitem').hide();
                $('#toastSuccess .text-message').html("Task completed, GREAT! :)");
                new bootstrap.Toast($('#toastSuccess')).show();
            }
        } catch (err) {
            console.error('Error in completer handler:', err);
        }
    });

    // Progress — await the Promise before reacting
    $('button.advance').on("click", async function (e) {
        const $btn     = $(e.target);
        const taskLUID = $btn.closest('.myitem').attr('luid');
        try {
            const ok = await upgradeTask(taskLUID);
            if (ok) {
                const newVal = parseInt($btn.val()) + 1;
                $btn.val(newVal).html('+ ' + newVal).prop('disabled', true);
                $('#toastSuccess .text-message').html("Task upgraded! :)");
                new bootstrap.Toast($('#toastSuccess')).show();
            }
        } catch (err) {
            console.error('Error in advance handler:', err);
        }
    });

    // Desc click → expand
    $('.desc').on("click", function (e) {
        const $target = $(e.target);
        collapseAllItems();
        if (!$target.hasClass("expanded")) {
            $target.closest('.myitem').find('button.expand-toggler').click();
        }
    });
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
function enableSearch() {
    if (_searchInitialized) return;
    const el = document.getElementById('mysearch');
    if (!el) return;

    el.addEventListener('input', function () {
        const searchTerm = this.value.toLowerCase();
        const rows = document.querySelectorAll('.myitem');

        if (!searchTerm || searchTerm.length <= 2) {
            $('.myitem:hidden').show();
            return;
        }

        rows.forEach(row => {
            const text = [
                $(row).find('input.title').val(),
                $(row).find('textarea.desc').val(),
                $(row).find('.categories').text()
            ].join(' ').toLowerCase();

            $(row).toggle(text.includes(searchTerm));
        });
    });

    _searchInitialized = true;
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
function logout() {
    makeRequest('POST', "/logout")
        .then(response => {
            if (response.ok) {
                // Expire the session cookie
                document.cookie = 'sessionToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
                clearLocalStorageData();
                $('#toastSuccess .text-message').html("data cleared :)");
                new bootstrap.Toast($('#toastSuccess')).show();
            } else {
                console.error("Error response:", response.statusText);
            }
        })
        .catch(error => {
            $('#toastFailure .text-message').html("error on logout :(");
            new bootstrap.Toast($('#toastFailure')).show();
            console.error("Error on logout:", error);
        });
}

// ─── SPINNER HELPERS ─────────────────────────────────────────────────────────
function startSpinning(queryElement) {
    const $el = $(queryElement);
    $el.prop('disabled', true);

    if ($el.find('.lucide-loader-circle').length === 0) {
        $el.data('original-content', $el.html());
        $el.html(`
            <i data-lucide="loader-circle" class="lucide-spin lucide-loader-circle"></i>
        `);
        lucide.createIcons();
    }
}

function stopSpinning(queryElement) {
    const $el = $(queryElement);
    $el.prop('disabled', false);
    if ($el.data('original-content')) {
        $el.html($el.data('original-content')).removeData('original-content');
    }
}

// ─── SAVE (UPDATE) ────────────────────────────────────────────────────────────
function sendUpdate() {
    startSpinning('#saveBtn');
    const modifiedItems = getModifiedItems();

    if (modifiedItems.length === 0) {
        stopSpinning('#saveBtn');
        return;
    }

    makeRequest('PUT', "/update", JSON.stringify({ modifiedItems }))
        .then(response => {
            if (response.ok) {
                $('#toastSuccess .text-message').html("changes have been saved :)");
                new bootstrap.Toast($('#toastSuccess')).show();
            } else {
                console.error("Error response:", response.statusText);
            }
            return response.json();
        })
        .then(() => stopSpinning('#saveBtn'))
        .catch(error => {
            stopSpinning('#saveBtn');
            $('#toastFailure .text-message').html("changes aren't saved :(");
            new bootstrap.Toast($('#toastFailure')).show();
            console.error("Error while uploading:", error);
        });
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
function exportTaskAsFile() {
    makeRequest('GET', '/tasks')
        .then(response => {
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            return response.json();
        })
        .then(data => {
            const jsonString = JSON.stringify(data);

            if (window.FlutterExport) {
                // WebView Flutter
                window.FlutterExport.postMessage(jsonString);
            } else {
                // Browser standard
                const blob = new Blob([jsonString], { type: "application/json" });
                const link = document.createElement("a");
                link.href     = URL.createObjectURL(blob);
                link.download = "myTasks.json";
                link.click();
                URL.revokeObjectURL(link.href);
                console.log("File saved!");
            }
        })
        .catch(error => {
            $('#toastFailure .text-message').html("cannot be exported now :(");
            new bootstrap.Toast($('#toastFailure')).show();
            console.error('Error exporting JSON:', error);
        });
}

// ─── MAP ITEM DATA FROM DOM ───────────────────────────────────────────────────
// FIX: `myitem` is now declared with `const` – was an accidental global before.
function mapItemData(item) {
    const myitem   = $(item);       // FIX: was `myitem = $(item)` (implicit global)
    const item_obj = {};

    item_obj._id  = myitem.data("value");
    item_obj._rev = myitem.attr("rev");
    item_obj.luid = myitem.attr("luid");

    item_obj.order = parseInt(myitem.attr('order'), 10);
    item_obj.title       = myitem.find("input.title").val();
    item_obj.description = myitem.find("textarea.desc").val();
    item_obj.progress    = parseInt(myitem.find("button.advance").val(), 10);
    item_obj.expireDate  = myitem.find("input.exp-date").val();

    const starAttr = myitem.find("button.star-toggler i.bx").attr('starred');
    item_obj.star = starAttr !== "false" && starAttr !== false;

    item_obj.categories = myitem.find(".categories span.badge i")
        .map(function () { return $(this).text().trim(); })
        .get().join(',');

    const depends = myitem.find("span.deps a.depency")
        .map(function () { return $(this).attr('href').replace('#', ''); })
        .get().join(',');
    item_obj.depends = depends || '';

    return item_obj;
}

// ─── DETECT MODIFIED ITEMS ────────────────────────────────────────────────────
function getModifiedItems() {
    const modifiedItems = [];

    $(".myitem").each(function (i, e) {
        const mod_item = mapItemData(e);
        const snapshot  = taskData[mod_item.luid];
        if (!snapshot) return; // guard against stale DOM

        if (
            mod_item.title       !== snapshot.title       ||
            mod_item.description !== snapshot.description ||
            mod_item.categories  !== snapshot.categories  ||
            mod_item.order       !== snapshot.order       ||
            mod_item.star        !== snapshot.star        ||
            mod_item.expireDate  !== snapshot.expireDate  ||
            mod_item.depends     !== snapshot.depends
        ) {
            modifiedItems.push(mod_item);
        }
    });

    return modifiedItems;
}

// ─── TASK ACTIONS ─────────────────────────────────────────────────────────────
function completeTask(taskLUID) {
    // FIX: guard against undefined taskData entry before accessing properties
    if (!taskLUID || !taskData[taskLUID] || !taskData[taskLUID]._id) {
        console.error("completeTask: task not found for luid", taskLUID);
        return Promise.resolve(false);
    }

    const taskItem = { _id: taskData[taskLUID]._id, _rev: taskData[taskLUID]._rev };
    const endpoint = taskData[taskLUID].status === 1 ? '/complete' : '/uncomplete';
    const nextStatus = taskData[taskLUID].status === 1 ? 2 : 1;

    return makeRequest('PUT', endpoint, JSON.stringify({ taskItem }))
        .then(response => {
            if (!response.ok) {
                $('#toastFailure .text-message').html("Task cannot be completed now.");
                new bootstrap.Toast($('#toastFailure')).show();
                return false;
            }
            taskData[taskLUID].status = nextStatus;
            return true;
        })
        .catch(error => {
            console.error('Error completing task:', error);
            $('#toastFailure .text-message').html("Task cannot be completed now.");
            new bootstrap.Toast($('#toastFailure')).show();
            return false;
        });
}

function upgradeTask(taskLUID) {
    if (!taskLUID || !taskData[taskLUID] || !taskData[taskLUID]._id) {
        console.error("upgradeTask: task not found for luid", taskLUID);
        return Promise.resolve(false);
    }

    const taskItem = { _id: taskData[taskLUID]._id, _rev: taskData[taskLUID]._rev };

    return makeRequest('PUT', "/progress", JSON.stringify({ taskItem }))
        .then(response => {
            if (!response.ok) {
                $('#toastFailure .text-message').html("Task cannot be upgraded now");
                new bootstrap.Toast($('#toastFailure')).show();
                // FIX: original code incremented progress on *failure* – removed
                return false;
            }
            taskData[taskLUID].progress += 1;
            return true;
        })
        .catch(error => {
            console.error('Error upgrading task:', error);
            $('#toastFailure .text-message').html("Task cannot be upgraded now.");
            new bootstrap.Toast($('#toastFailure')).show();
            return false;
        });
}

function deleteTask(taskLUID) {
    if (!taskLUID || !taskData[taskLUID] || !taskData[taskLUID]._id) {
        console.error("deleteTask: task not found for luid", taskLUID);
        return Promise.resolve(false);
    }

    const taskItem = { _id: taskData[taskLUID]._id, _rev: taskData[taskLUID]._rev };

    return makeRequest('DELETE', "/delete", JSON.stringify({ taskItem }))
        .then(response => {
            if (!response.ok) {
                $('#toastFailure .text-message').html("Task cannot be deleted now.");
                new bootstrap.Toast($('#toastFailure')).show();
                return false;
            }
            return true;
        })
        .catch(error => {
            console.error('Error deleting task:', error);
            $('#toastFailure .text-message').html("Task cannot be deleted now.");
            new bootstrap.Toast($('#toastFailure')).show();
            return false;
        });
}

// ─── INSERT NEW TASK ──────────────────────────────────────────────────────────
function insertNewTask() {
    const newTask = {};

    newTask.title       = $('#collapseEditor #newTitle').val();
    newTask.description = $('#collapseEditor #newDesc').val();
    newTask.categories  = $('#collapseEditor #newTopicsSpan').find('span.badge i')
        .map(function () { return $(this).text().trim(); }).get().join(',');
    newTask.expireDate  = $('#collapseEditor #newExpireDate').val();

    // FIX: jQuery attr() returns `undefined` (not null) when attribute is absent
    const rawHref = $('#collapseEditor #newDepencyTask').attr('href');
    newTask.depency = rawHref ? rawHref.replace('#', '') : '';

    if (!newTask.title.length) {
        $('#toastFailure .text-message').html("Title is required.");
        new bootstrap.Toast($('#toastFailure')).show();
        return;
    }

    makeRequest('POST', "/insert", JSON.stringify({ newTask }))
        .then(response => {
            if (!response.ok) {
                console.error("Error on response:", response.statusText);
                return false;
            }
            $('#toastSuccess .text-message').html("Task Added :)");
            new bootstrap.Toast($('#toastSuccess')).show();
            $('#collapseEditor #newTitle').val('');
            $('#collapseEditor #newDesc').val('');
            $('#collapseEditor #newExpireDate').val('');
            $('#collapseEditor #newTopicsSpan').html('');
            $('#collapseEditor #newDepencyTask').attr('href', '#');
            $('#collapseEditor').collapse('toggle');
            return true;
        })
        .then(success => { if (success) loadAllTask(); })
        .catch(error => {
            $('#toastFailure .text-message').html("Task cannot be created now.");
            new bootstrap.Toast($('#toastFailure')).show();
            console.error("Error while sending data:", error);
        });
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
$(document).on("keydown", function (e) {
    if (e.ctrlKey && e.key === "z") {
        // TODO: revert function (use PouchDB revs)
    }
});

$(document).on("keydown", function (e) {
    if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        $('#saveBtn').click();
    }
});

// ─── DATE UTILITIES ───────────────────────────────────────────────────────────
function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.trim().split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

function orderByExpDate() {
    const items = $('.myitem').get();
    items.sort((a, b) => {
        const dateA = parseDate($(a).find('.exp-date').val());
        const dateB = parseDate($(b).find('.exp-date').val());
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
    });
    $('.myitems').append(items);
}

// ─── SORTABLE ────────────────────────────────────────────────────────────────
$(function () {
    $(".sortable").sortable({ cursor: "n-resize", handle: ".bd-placeholder" });

    $(".sortable").on("sortstop", function (event, ui) {
        const nextOrder = $(ui.item).next('div.container').attr('order');
        $(ui.item).attr('order', nextOrder ? parseInt(nextOrder, 10) + 1 : 0);
    });
});

// ─── DEPENDENCY SCROLL ───────────────────────────────────────────────────────
$(document).on('click', 'a', function () {
    const href = $(this).attr('href');
    if (!href) return;
    const id = href.split('#')[1];
    if (id) scrollToItem(id);
});

function scrollToItem(itemId) {
    // FIX: querySelector returns null (not undefined) when not found
    const item = document.querySelector(`.myitem[luid="${itemId}"]`);
    if (item !== null) {
        item.scrollIntoView({ block: "start", behavior: "smooth" });
        blinkElement(item, 1200);
    }
}

// FIX: original used el.animate() (DOM element, not jQuery) and had infinite
// recursion via setTimeout(blinkElement, 0). Replaced with a simple CSS
// box-shadow pulse that works reliably and removes itself automatically.
function blinkElement(el, time = 1200) {
    const $el = $(el);
    $el.css({ 'box-shadow': '0 0 0 3px var(--bs-link-color)', 'transition': `box-shadow ${time / 2}ms ease` });
    setTimeout(() => {
        $el.css({ 'box-shadow': '', 'transition': `box-shadow ${time / 2}ms ease` });
    }, time);
}

// ─── LOAD ALL TASKS ───────────────────────────────────────────────────────────
async function loadAllTask() {
    $('#loader').show();

    makeRequest('GET', '/tasks')
        .then(response => {
            if (response.ok) return response.json();
            $('#toastFailure .text-message').html(`Error: ${response.status} ${response.statusText}`);
            new bootstrap.Toast($('#toastFailure')).show();
            console.error(`Error: ${response.status} ${response.statusText}`);
            return null;
        })
        .then(data => {
            if (!data) return;
            populateTaskswithData(data);
            saveDataToLocalStorage(data);
            populateDepenciesTitles();
            translateDatePickers();
            colorAllTopicsBadges();
            insertNewTopic();
            enableDynamicActions();
            lucide.createIcons();
            enableSearch(); // FIX: was `.then(enableSearch())` which invoked it immediately
            $('#loader').hide();
        })
        .catch(error => {
            // Fallback: show last cached data from localStorage if PouchDB itself fails
            try {
                const cachedData  = localStorage.getItem(cachedDataKey);
                const storageData = cachedData ? JSON.parse(cachedData) : null;

                if (storageData?.timestamp && storageData.data) {
                    console.log('Using cached data from:', new Date(storageData.timestamp));
                    const data = storageData.data;
                    populateTaskswithData(data);
                    populateDepenciesTitles();
                    translateDatePickers();
                    colorAllTopicsBadges();
                    insertNewTopic();
                    enableDynamicActions();
                    enableSearch();
                    $('#loader').hide();
                } else {
                    console.error('Error loading data and no cache available:', error);
                }
            } catch (cacheErr) {
                console.error('Cache read error:', cacheErr);
            }

            $('#toastFailure .text-message').html(`Storage error: ${error}`);
            new bootstrap.Toast($('#toastFailure')).show();
        });
}

// ─── BOOT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    switchToTab(selectedTab);
}, { once: true });