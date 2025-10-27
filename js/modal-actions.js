var addSubTaskModal = document.getElementById('addSubTaskModal');
var confirmDeleteModal = document.getElementById('confirmDeleteModal');
var settingsModal = document.getElementById('settingsModal');
var importTaskModal = document.getElementById('importTaskModal');

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

    var serverAddr = settingsModal.querySelector('.modal-body #currentServer');
    var datalistTheme = settingsModal.querySelector('.modal-body #themeDataList');
    var themeOptions = settingsModal.querySelectorAll('.modal-body .themeOpt');
    var datalistLang = settingsModal.querySelector('.modal-body #langDataList');
    var langOptions = settingsModal.querySelectorAll('.modal-body .langOpt');

    var datalistInitialTab = settingsModal.querySelector('.modal-body #initalTabDataList');
    var tabOptions = settingsModal.querySelectorAll('.modal-body .tabOpt');

    serverAddr.innerHTML = serverAddress;
    serverAddr.value = serverAddress;

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
            item.setAttribute('selected', true); //lang selected
        }
    });

    sendBtn.addEventListener('click', () => {
        const theme = datalistTheme.value;
        const lang = datalistLang.value;
        const initialTab = datalistInitialTab.value;
        //* Save the theme to local storage */
        localStorage.setItem('theme', theme);
        setTheme(theme);
        setStoredLang(lang);
        setStoredInitialTab(initialTab);
        closeBtn.click(); //close modal
    });
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
