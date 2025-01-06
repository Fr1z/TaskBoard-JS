var addSubTaskModal = document.getElementById('addSubTaskModal');
var confirmDeleteModal = document.getElementById('confirmDeleteModal');
var settingsModal = document.getElementById('settingsModal');
var importTaskModal = document.getElementById('importTaskModal');

confirmDeleteModal.addEventListener('show.bs.modal', function (event) {
    
    // Button that triggered the modal
    var button = event.relatedTarget
    
    // Extract info from data-bs-* attributes
    var deleteID = button.getAttribute('data-bs-deleteID');
    var deleteName = button.getAttribute('data-bs-deleteName');
    var modalTitle = confirmDeleteModal.querySelector('.modal-title');
    var hiddenInput = confirmDeleteModal.querySelector('.modal-body #deleteditemID');
    var deleteBtn = confirmDeleteModal.querySelector('.modal-footer #sendButton');

    modalTitle.textContent = 'Vuoi davvero eliminare ' + deleteName + ' ?'
    hiddenInput.value = deleteID

    deleteBtn.addEventListener('click', () => {
        if (hiddenInput!=='undefined'){
            const taskLUID = hiddenInput.value;
            console.log("elimina " + taskLUID);
            
            const deleted = deleteTask(taskLUID);
            if (deleted){
                $(`.myitem[data-value="${taskLUID}"]`).hide();
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
    var requiredID = button.getAttribute('data-bs-requiredforID');
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
        var value =  item.getAttribute('data-value'); // Ottieni il valore
        var title = item.querySelector('.title');
        var text = title.value.trim(); // Testo del titolo senza spazi
        option.value = text
        
        datalist.appendChild(option);
        // Aggiungi alla mappa
        valueMap.set(text, value);
    });

    // Gestisci il cambio di input
    datalistElement.addEventListener('input', () => {
        
        const text = datalistElement.value; // Testo selezionato dall'utente
        const value = valueMap.get(text) || 'Nessuno'; // Valore corrispondente
        subtaskSelected.textContent = value; // Mostra il valore
        
        if (value!=='Nessuno'){
            sendBtn.removeAttribute('disabled');
        } else {
            sendBtn.setAttribute('disabled', true);
        }
    });

    sendBtn.addEventListener('click', () => {
        if (requiredID==0){
            var newDepencyTask = document.querySelector('#newDepencyTask'); 
            newDepencyTask.innerHTML = '';
            newDepencyTask.setAttribute('href', "#"+subtaskSelected.textContent);
            populateDepencies();
        }
        closeBtn.click();
    });
})

settingsModal.addEventListener('show.bs.modal', function (event) {
    
    // Button that triggered the modal
    var sendBtn = settingsModal.querySelector('.modal-footer #sendButton');
    var closeBtn = settingsModal.querySelector('.modal-footer #closeButton');

    var serverAddr = settingsModal.querySelector('.modal-body #currentServer');
    var datalistThemeElement = settingsModal.querySelector('.modal-body #themeDataList');
    var themeOptions = settingsModal.querySelectorAll('.modal-body .themeOpt');

    serverAddr.innerHTML = serverAddress;
    serverAddr.value = serverAddress;


    themeOptions.forEach(item => {
        if (item.value == getPreferredTheme() ){
            item.setAttribute('selected', true); //theme selected
        }
    });

    // Gestisci il cambio di input
    datalistThemeElement.addEventListener('input', () => {
        const theme = datalistThemeElement.value;
        console.log("Selected theme: "+theme);
        setTheme(theme);
    });
    
    sendBtn.addEventListener('click', () => {
        const theme = datalistThemeElement.value;
        //* Save the theme to local storage */
        localStorage.setItem('theme', theme)
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
        const file = selectedFile.files[0]; // Prendi il primo file selezionato

        if (file) {
            try {
                // Leggi il contenuto del file
                const fileContent = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsText(file);
                });
                // Convalida il contenuto come JSON (opzionale)
                //const jsonData = JSON.parse(fileContent);
                startSpinning('.modal-body #fileInfo');

                //Upload JSON To server
                makeRequest('POST', "/import", fileContent)
                .then(response => {
                    if (response.ok) {
                        //show toasts
                        $('#toastSuccess .text-message').html("Tasks are now imported :)");
                        new bootstrap.Toast($('#toastSuccess')).show();
                    } else {
                        $('#toastFailure .text-message').html("Error on importing tasks :(");
                        new bootstrap.Toast($('#toastFailure')).show();
                        console.error("Errore di risposta:", response.statusText);
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
                console.error("Errore:", error.message);
            }
        } else {
            console.error("Nessun file selezionato.");
        }
        closeBtn.click(); //close modal
    });
});
