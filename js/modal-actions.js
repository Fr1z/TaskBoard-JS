var addSubTaskModal = document.getElementById('addSubTaskModal');
var confirmDeleteModal = document.getElementById('confirmDeleteModal');


confirmDeleteModal.addEventListener('show.bs.modal', function (event) {
    
    // Button that triggered the modal
    var button = event.relatedTarget
    
    // Extract info from data-bs-* attributes
    var deleteID = button.getAttribute('data-bs-deleteID')
    var deleteName = button.getAttribute('data-bs-deleteName')
    var modalTitle = confirmDeleteModal.querySelector('.modal-title')
    var hiddenInput = confirmDeleteModal.querySelector('.modal-body #deleteditemID')
    var deleteBtn = confirmDeleteModal.querySelector('.modal-footer #sendButton');

    modalTitle.textContent = 'Vuoi davvero eliminare ' + deleteName + ' ?'
    hiddenInput.value = deleteID

    deleteBtn.addEventListener('click', () => {
        if (hiddenInput!=='undefined'){
            console.log("elimina " + hiddenInput.value);
        }
    });
});

addSubTaskModal.addEventListener('show.bs.modal', function (event) {
    
    // Button that triggered the modal
    var button = event.relatedTarget

    // Extract info from data-bs-* attributes
    var requiredName = button.getAttribute('data-bs-requiredfor')
    // Extract info from data-bs-* attributes
    var requiredID = button.getAttribute('data-bs-requiredforID')
    // Update the modal's content.
    var modalTitle = addSubTaskModal.querySelector('.modal-title')
    var closeBtn = addSubTaskModal.querySelector('.modal-footer #closeButton')
    var hiddenRequiredInput = addSubTaskModal.querySelector('.modal-body #requiredfor')

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
        var title = item.querySelector('.title')
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
