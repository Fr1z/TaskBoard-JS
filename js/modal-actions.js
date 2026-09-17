var addSubTaskModal = document.getElementById('addSubTaskModal');
var confirmDeleteModal = document.getElementById('confirmDeleteModal');
var settingsModal = document.getElementById('settingsModal');
var importTaskModal = document.getElementById('importTaskModal');
var addTaskModal = document.getElementById('addTaskModal');

var textareaModal = document.getElementById('textareaModal');
var textareaModalInput = document.getElementById('tm-textarea');
var textareaModalTitle = document.getElementById('tm-title');
let activeTextarea = null;
let activeTitleInput = null;

confirmDeleteModal.addEventListener('show.bs.modal', function (event) {
    
    // Button that triggered the modal
    var button = event.relatedTarget
    
    // Extract info from data-bs-* attributes
    var deleteID = button.getAttribute('data-bs-deleteID'); // LUID
    var deleteName = button.getAttribute('data-bs-deleteName');
    var modalTitle = confirmDeleteModal.querySelector('.modal-title');
    var hiddenInput = confirmDeleteModal.querySelector('.modal-body #deleteditemID');
    var deleteBtn = confirmDeleteModal.querySelector('.modal-footer #sendButton');

    modalTitle.textContent = 'Are you sure to delete ' + deleteName + ' ?'
    hiddenInput.value = deleteID

    deleteBtn.addEventListener('click', () => {
        if (hiddenInput !== undefined){
            const taskLUID = hiddenInput.value;

            const deleted = deleteTask(taskLUID);
            if (deleted){
                $(`.myitem[luid="${taskLUID}"]`).hide();
                $('#toastSuccess .text-message').html("Task deleted succesfully!");
                new bootstrap.Toast($('#toastSuccess')).show();
            }
        }
    });
});

addSubTaskModal.addEventListener('show.bs.modal', function (event) {
    
    // Button that triggered the modal
    var button = event.relatedTarget

    // Extract info from data-bs-* attributes
    var requiredName = button.getAttribute('data-bs-requiredfor');
    // Extract info from data-bs-* attributes
    var requiredID = null; //reset this value
    requiredID = button.getAttribute('data-bs-requiredforID'); //LUID
    // Update the modal's content.
    var modalTitle = addSubTaskModal.querySelector('.modal-title');
    var closeBtn = addSubTaskModal.querySelector('.modal-footer #closeButton');
    var hiddenRequiredInput = addSubTaskModal.querySelector('.modal-body #requiredfor');

    var datalist = addSubTaskModal.querySelector('#datalistOptions');
    var datalistElement = addSubTaskModal.querySelector('.modal-body #subTaskDataList');
    var subtaskSelected = addSubTaskModal.querySelector('.modal-body #selectedTask');
    var items = document.querySelectorAll('.myitem');
    var sendBtn = addSubTaskModal.querySelector('.modal-footer #sendButton');


    //reset subtask value
    datalistElement.value = '';
    subtaskSelected.innerHTML = '';
    //remplace required data forms
    modalTitle.textContent = 'Task Required for ' + requiredName
    hiddenRequiredInput.value = requiredID
    

    // Pulisci il datalist (opzionale, utile se viene rigenerato dinamicamente)
    datalist.innerHTML = '';
    // Mappa per tenere traccia di valore e testo
    var valueMap = new Map();
    
    // Aggiungi ogni titolo come opzione
    items.forEach(item => {
        const option = document.createElement('option');
        var value =  item.getAttribute('luid');
        var title = item.querySelector('.title');
        var text = title.value.trim(); //Title text with no spaces
        option.value = text
        
        if (value != requiredID){
            // Add to mapping excluded this task
            datalist.appendChild(option);
            valueMap.set(text, value);
        }

    });

    // manage input
    datalistElement.addEventListener('input', () => {
        
        const text = datalistElement.value; // Find selected task
        const value = valueMap.get(text) || 'NoTask'; 
        subtaskSelected.textContent = value; //Show value
        
        if (value!=='NoTask') {
            sendBtn.removeAttribute('disabled');
        } else {
            sendBtn.setAttribute('disabled', true);
        }
    });

    sendBtn.addEventListener('click', () => {
        if (requiredID==0){
            //New Task
            var newDepencyTask = document.querySelector('#newDepencyTask'); 
            newDepencyTask.innerHTML = '';
            newDepencyTask.setAttribute('href', "#"+subtaskSelected.textContent);
            
        }else if (requiredID!==null){
            //If Existing Task
            const depenciesSpan = document.querySelector(`.myitem[luid="${requiredID}"] .deps`);
            depenciesSpan.parentElement.parentElement.classList.remove("d-none"); //show parent div
            depenciesSpan.innerHTML = depenciesSpan.innerHTML + 
            "&nbsp<a class=\"depency alert\" role=\"alert\" href=\"#" + subtaskSelected.textContent + "\"></a>";
            //show toasts
            $('#toastSuccess .text-message').html("Remember to save your edits :)");
            new bootstrap.Toast($('#toastSuccess')).show();
        }
        populateDepenciesTitles();
        requiredID = null; // Reset value
        closeBtn.click();
    });
})

settingsModal.addEventListener('show.bs.modal', function (event) {
    
    // Button that triggered the modal
    var sendBtn = settingsModal.querySelector('.modal-footer #sendButton');
    var closeBtn = settingsModal.querySelector('.modal-footer #closeButton');

    var syncEndpointInput = settingsModal.querySelector('.modal-body #syncEndpoint');
    var syncTokenInput = settingsModal.querySelector('.modal-body #syncToken');
    var syncEncInput = settingsModal.querySelector('.modal-body #syncEncPassword');
    var testSyncBtn = settingsModal.querySelector('.modal-body #testSyncBtn');
    var syncStatus = settingsModal.querySelector('.modal-body #syncStatus');
    var emptyTrashBtn = settingsModal.querySelector('.modal-body #emptyTrashBtn');
    var datalistTheme = settingsModal.querySelector('.modal-body #themeDataList');
    var themeOptions = settingsModal.querySelectorAll('.modal-body .themeOpt');
    var datalistLang = settingsModal.querySelector('.modal-body #langDataList');
    var langOptions = settingsModal.querySelectorAll('.modal-body .langOpt');

    var datalistInitialTab = settingsModal.querySelector('.modal-body #initalTabDataList');
    var tabOptions = settingsModal.querySelectorAll('.modal-body .tabOpt');
    var fontScaleRange = settingsModal.querySelector('.modal-body #fontScaleRange');
    var fontScaleValue = settingsModal.querySelector('.modal-body #fontScaleValue');
    var fontFamilySelect = settingsModal.querySelector('.modal-body #fontFamilySelect');

    if (syncEndpointInput) syncEndpointInput.value = (typeof RemoteSync !== 'undefined' ? RemoteSync.getEndpoint() : (localStorage.getItem('syncEndpoint')||''));
    if (syncTokenInput) syncTokenInput.value = (typeof RemoteSync !== 'undefined' ? RemoteSync.getToken() : (localStorage.getItem('syncToken')||''));
    if (syncEncInput) syncEncInput.value = (typeof RemoteSync !== 'undefined' ? RemoteSync.getEncPassword() : (localStorage.getItem('syncEncPassword')||''));
    if (syncStatus) syncStatus.textContent = '';
    if (testSyncBtn) {
        testSyncBtn.onclick = function(e){
            e.preventDefault();
            if (syncStatus) syncStatus.textContent = '...';
            // save current inputs temporarily for test
            var ep = syncEndpointInput ? syncEndpointInput.value.trim() : '';
            var tok = syncTokenInput ? syncTokenInput.value : '';
            var enc = syncEncInput ? syncEncInput.value : '';
            var prevEp = localStorage.getItem('syncEndpoint');
            var prevTok = localStorage.getItem('syncToken');
            var prevEnc = localStorage.getItem('syncEncPassword');
            if (ep) localStorage.setItem('syncEndpoint', ep);
            if (tok !== undefined) localStorage.setItem('syncToken', tok);
            if (enc !== undefined) localStorage.setItem('syncEncPassword', enc);
            if (typeof RemoteSync === 'undefined' || !RemoteSync.isEnabled()) {
                if (syncStatus) syncStatus.textContent = (typeof t==='function'? t('syncFail') : 'Sync failed') + ': endpoint non valido';
                // restore
                if (prevEp===null) localStorage.removeItem('syncEndpoint'); else localStorage.setItem('syncEndpoint', prevEp);
                if (prevTok===null) localStorage.removeItem('syncToken'); else localStorage.setItem('syncToken', prevTok);
                if (prevEnc===null) localStorage.removeItem('syncEncPassword'); else localStorage.setItem('syncEncPassword', prevEnc);
                return;
            }
            RemoteSync.pull(RemoteSync.getLastSync()).then(function(data){
                if (syncStatus) syncStatus.textContent = (typeof t==='function'? t('syncOk') : 'Sync OK') + ' ('+(data.count||0)+' remote)';
                // merge if any
                if (data.tasks && data.tasks.length) {
                    RemoteSync.mergeRemoteTasks(data.tasks).then(function(c){
                        if (c>0 && typeof loadAllTask==='function') loadAllTask();
                    });
                }
            }).catch(function(err){
                if (syncStatus) syncStatus.textContent = (typeof t==='function'? t('syncFail') : 'Sync failed') + ': ' + (err.message||err);
                console.warn('[sync] test failed', err);
            }).finally(function(){
                // inputs stay, but restore is not needed as user may want to keep? Keep new values
            });
        };
    }
    if (emptyTrashBtn) {
        emptyTrashBtn.onclick = function(e){
            e.preventDefault();
            if (typeof hardDeleteTrash === 'function') {
                hardDeleteTrash().then(function(n){
                    if (syncStatus) syncStatus.textContent = (typeof t==='function'? t('trashEmptied') : 'Trash emptied') + (n? ' ('+n+')':'');
                    $('#toastSuccess .text-message').html(typeof t==='function'? t('trashEmptied') : 'Trash emptied');
                    try{ new bootstrap.Toast($('#toastSuccess')).show(); }catch(_){}
                }).catch(function(err){
                    console.warn('[sync] emptyTrash', err);
                });
            }
        };
    }

    //Select current option in the SELECTS
    themeOptions.forEach(item => {
        if (item.value == getPreferredTheme() ){
            item.setAttribute('selected', true); //theme selected
        }
    });

    langOptions.forEach(item => {
        if (item.value == getStoredLang() ){
            item.setAttribute('selected', true); //lang selected
        }
    });

    tabOptions.forEach(item => {
        if (item.value == getStoredInitialTab() ){
            item.setAttribute('selected', true);
        }
    });

    if (fontScaleRange && fontScaleValue) {
        const cur = typeof getStoredFontScale === 'function' ? getStoredFontScale() : 100;
        fontScaleRange.value = cur;
        fontScaleValue.textContent = cur + '%';
        fontScaleRange.oninput = function() { fontScaleValue.textContent = this.value + '%'; if (typeof applyFontScale === 'function') applyFontScale(this.value); };
    }
    if (fontFamilySelect && typeof getStoredFontFamily === 'function') {
        fontFamilySelect.value = getStoredFontFamily();
        fontFamilySelect.onchange = function() { if (typeof applyFontFamily === 'function') applyFontFamily(this.value); };
    }

    sendBtn.onclick = () => {
        const theme = datalistTheme.value;
        const lang = datalistLang.value;
        const initialTab = datalistInitialTab.value;
        localStorage.setItem('theme', theme);
        setTheme(theme);
        setStoredLang(lang);
        setStoredInitialTab(initialTab);
        if (fontScaleRange && typeof setStoredFontScale === 'function') {
            setStoredFontScale(parseInt(fontScaleRange.value, 10));
            if (typeof applyFontScale === 'function') applyFontScale(fontScaleRange.value);
        }
        if (fontFamilySelect && typeof setStoredFontFamily === 'function') {
            setStoredFontFamily(fontFamilySelect.value);
            if (typeof applyFontFamily === 'function') applyFontFamily(fontFamilySelect.value);
        }
        // sync settings
        try {
            if (syncEndpointInput) localStorage.setItem('syncEndpoint', syncEndpointInput.value.trim());
            if (syncTokenInput) localStorage.setItem('syncToken', syncTokenInput.value);
            if (syncEncInput) localStorage.setItem('syncEncPassword', syncEncInput.value);
        } catch(_){}
        if (typeof applyI18n === 'function') applyI18n();
        const labelMap = { STARRED: t('starred'), ALL: t('todo'), COMPLETED: t('completed') };
        document.querySelector('.currentTab').textContent = labelMap[selectedTab] ?? selectedTab;
        closeBtn.click();
        // after save, trigger non-blocking pull if endpoint now enabled
        try {
            if (typeof RemoteSync !== 'undefined' && RemoteSync.isEnabled()) {
                RemoteSync.pullOnLoad();
            }
        } catch(_){}
    };
});


importTaskModal.addEventListener('show.bs.modal', function (event) {
    
    // Button that triggered the modal
    var sendBtn = importTaskModal.querySelector('.modal-footer #sendButton');
    var closeBtn = importTaskModal.querySelector('.modal-footer #closeButton');

    var selectedFile = importTaskModal.querySelector('.modal-body #inputFile');
    selectedFile.value = ""; //reset file field

    sendBtn.addEventListener('click', async () => {
        const file = selectedFile.files[0]; //Take the first (and only) file selected

        if (file) {
            try {
                //Read File content
                const fileContent = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsText(file);
                });

                startSpinning('.modal-body #fileInfo');

                //Upload JSON To server
                makeRequest('POST', "/import", fileContent)
                .then(response => {
                    if (response.ok) {
                        //show toasts
                        $('#toastSuccess .text-message').html(response.message);
                        new bootstrap.Toast($('#toastSuccess')).show();
                    } else {
                        $('#toastFailure .text-message').html(response.message);
                        new bootstrap.Toast($('#toastFailure')).show();
                        console.error("Error response:", response.statusText);
                    }
                    stopSpinning('.modal-body #fileInfo');
                }).catch(error => {
                    stopSpinning('.modal-body #fileInfo');
                    $('#toastFailure .text-message').html("Error while uploading :(");
                    new bootstrap.Toast($('#toastFailure')).show();
                    console.error("Error while sending:", error);
                });
            } catch (error) {
                stopSpinning('.modal-body #fileInfo');
                console.error("Error:", error.message);
            }
        } else {
            console.error("No file selected");
        }
        closeBtn.click(); //close modal
    }, {once : true});
});

if (addTaskModal) {
    addTaskModal.addEventListener('show.bs.modal', function () {
        lucide.createIcons();
        const titleInput = addTaskModal.querySelector('#newTitle');
        if (titleInput) setTimeout(() => titleInput.focus(), 150);
    });
}

function closeTextAreaModal() {
    if (activeTitleInput) activeTitleInput.value = textareaModalTitle.value;
    if (activeTextarea) activeTextarea.value = textareaModalInput.value;
    textareaModal.classList.add("tm-hidden");
    activeTitleInput = null;
    activeTextarea = null;
}

document.getElementById("tm-close").onclick = closeTextAreaModal;
document.querySelector(".tm-overlay").addEventListener("click", closeTextAreaModal);
document.addEventListener("click", function (e) {
    const isTextarea = e.target.tagName === "TEXTAREA" && e.target.id !== 'tm-textarea';
    const isTitle = e.target.classList && e.target.classList.contains('title') && e.target.tagName === "INPUT";
    if (isTextarea || isTitle) {
        if (window.innerWidth <= 992) {
            e.preventDefault();
            const item = e.target.closest('.myitem');
            if (!item) return;
            activeTextarea = item.querySelector('.desc');
            activeTitleInput = item.querySelector('.title');
            if (textareaModalTitle && activeTitleInput) textareaModalTitle.value = activeTitleInput.value;
            if (textareaModalInput && activeTextarea) textareaModalInput.value = activeTextarea.value;
            textareaModal.classList.remove("tm-hidden");
            setTimeout(() => {
                if (isTitle && textareaModalTitle) textareaModalTitle.focus();
                else if (textareaModalInput) textareaModalInput.focus();
            }, 50);
        }
    }
});
