
let initialData = [];

document.addEventListener('DOMContentLoaded', function () {
    // Fetch the JSON data
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            const tableBody = document.querySelector('.myitems');
            let rows = '';

            // Ordina per 'order' in modo decrescente
            data.sort((a, b) => b.order - a.order);
 
            // Loop through the JSON data and create rows
            data.forEach((item) => {

                //salva uno snapshot dei dati ricevuti indicizzati per LUID
                initialData[item.LUID] = item;

                var progress = item.progress;
                //hide 0 if no progress 
                if (item.progress==0){
                    progress = ''
                }

                //if progress was added recently disable the button
                var disabledProgress = "";
                var differenceTimeToProgress = 40*60*60*1000; //4-hours
                var difference = (new Date().getTime()) - item.lastProgress;
                if (difference<differenceTimeToProgress){
                    disabledProgress = "disabled";
                }

                var starred = (item.star==1) ? 's' : '';

                var depenciesHTML = '';
                var hideDepencies = (item.depends.length) ? '' : 'd-none';
                if (hideDepencies.length==0){
                    var depencies = item.depends.split(',').map(dep_id => dep_id.trim());
                    // Genera il link alle dipendenze
                    depenciesHTML += depencies.map(dep_id => {return "<a class=\"depency\" href=\"#"+dep_id+"\"></a>";}).join(',&nbsp');
                }


                rows += `
                <div class="container mt-3 text-body-secondary myitem border-bottom w-100" data-value="${item.LUID}" order="${item.order}">
                    <div class="row flex-nowrap">
                        <!-- Grab Item -->
                        <div class="col-auto mh-100 bd-placeholder grab"  style="width: 32px;">
                            <i class="bx bx-menu bx-sm opacity-50 position-relative top-50 start-50 translate-middle"></i>
                        </div>


                        <!-- Main Content -->
                        <div class="flex-grow-1" style="flex-basis: 0;">
                            <div class="content justify-content-between">
                                <!-- Task Description -->
                                <div class="row g-0" style="max-height: 1.2em;">
                                    <div class="col-6 col-sm-6 col-md-7 col-lg-6 flex-nowrap">
                                        <input type="text" class="form-control title bg-transparent border-0 px-1 opacity-75" placeholder="Titolo" aria-label="Title of task" value="${item.title}">
                                    </div>
                                    <div class="col-1 col-sm-1 col-md-1 col-lg-3 flex-nowrap"></div>
                                    <div class="col-5 col-sm-5 col-md-4 col-lg-3 flex-nowrap" style="max-height: 1em;">
                                        <div class="input-group date d-flex flex-nowrap justify-content-end">
                                            <input type="text" class="form-control-sm fw-light pe-none text-body-secondary bg-transparent float-end text-end exp-date" value="${item.expireDate}" placeholder="No Scadenza" style="border: 0; min-width: 0px!important;">
                                            <span class="input-group-text" style="border: 0;">
                                                <i class="bx bx-calendar opacity-50 datapickertoggler" role="button"></i>
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
                                        <div class="row mb-2" >
                                            <div class="col m-0 px-1">
                                                <button class="btn btn-primary w-100 m-0 text-truncate" aria-label="Complete task">Completa</button>
                                            </div>
                                            <div class="col m-0 px-1">
                                                <button class="btn btn-secondary w-100 m-0 text-truncate advance" aria-label="Add progress" ${disabledProgress} value="${item.progress}">+ ${item.progress}</button>
                                            </div>
                                        </div>
                                        <div class="row p-0 mb-2">
                                            <div class="m-0 mb-1 font-lighter categories col-auto">
                                                ${item.categories}
                                            </div>
                                            <input class="p-0 px-3 bg-transparent text-center addcategory" style="font-size: 0.87rem; border: 0!important" type="text" placeholder="+ category" aria-label="add" maxlength="18" value=""">
                                            <div class="col-auto"></div>
                                        </div>
                                        <div class="row p-0 mb-2">
                                            <div class="mt-2 ${hideDepencies}">
                                                <span><b>Depends on:</b>&ensp;${depenciesHTML}</span> 
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <!-- Toggler Expander -->
                                <div class="col">
                                    <div class="d-flex flex-row-reverse">
                                        <!-- Delete, Expand actions -->
                                            <button class="btn btn-outline-primary p-2 m-1 m-md-2 expand-toggler" aria-label="Toggle details" style="max-width: max-content;" data-bs-toggle="button" autocomplete="off" aria-pressed="true">
                                                <i class="bx bx-chevron-down bx-sm expand-toggler"></i>
                                            </button>
                                            <button class="btn btn-outline-warning p-2 m-1 m-md-2 collapse star-toggler" aria-label="Star" style="max-width: max-content;">
                                                <i class='bx bx${starred}-star bx-sm' starred="${item.star}" ></i>
                                            </button>
                                            <button class="btn btn-outline-primary p-2 m-1 m-md-2 collapse" aria-label="New Subtask" style="max-width: max-content;" data-bs-toggle="modal" data-bs-target="#addSubTaskModal" data-bs-requiredfor="${item.title}" data-bs-requiredforID="${item.LUID}">
                                                <i class='bx bx-plus-circle bx-sm ' ></i>
                                            </button>
                                            <button class="btn btn-outline-danger p-2 m-1 m-md-2 collapse" aria-label="Trash" style="max-width: max-content;" data-bs-toggle="modal" data-bs-target="#confirmDeleteModal" data-bs-deleteName="${item.title}" data-bs-deleteID="${item.LUID}">
                                                <i class="bx bxs-trash bx-sm" ></i>
                                            </button>

                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                `;
            });
            // Insert rows into the table body
            tableBody.innerHTML = rows;

            //Activate functions for dynamic elements
            populateDepencies();
            translateDatePickers();
            colorAllTopicsBadges();
            insertNewTopic();
            enableDynamicActions();
            console.log("data loaded");
        }).then(enableSearch()).then(console.log("wainting for json.."))
        .catch(error => console.error('Error loading JSON:', error));

});

$(function () {
    $(".sortable").sortable({
        cursor: "n-resize",
        handle: ".bd-placeholder"
    });

    //set the order based from the element bottom, if any, else order 0 -> no fallback update for backend
    $( ".sortable" ).on( "sortstop", function( event, ui ) {
        nextOrder = $(ui.item).next('div.container').attr('order');
        if (nextOrder){
            $(ui.item).attr('order', parseInt(nextOrder)+1);
        }else{
            $(ui.item).attr('order', 0);
        }
    } );
});


function translateDatePickers() {
    // Initialize date picker
    //It translation
    $.fn.datepicker.dates['it'] = {
        days: ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"],
        daysShort: ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"],
        daysMin: ["Do", "Lu", "Ma", "Me", "Gi", "Ve", "Sa"],
        months: ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottbre", "Novembre", "Dicembre"],
        monthsShort: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"],
        today: "Oggi",
        clear: "No scadenza",
        format: "dd/mm//yyyy",
        titleFormat: "MM yyyy", /* Leverages same syntax as 'format' */
        weekStart: 1
    };

}

function colorAllTopicsBadges(){
    document.querySelectorAll('.categories').forEach(categoryElement => { colorTopicsBadges(categoryElement)});
}

function colorTopicsBadges(categoryElement){
    
        categoryElement = $(categoryElement); //JQuerize element
        let elementHtml = categoryElement.html();
        //exit if empty
        if (elementHtml.length < 1) return;

        let textContent = '';
        // Trova l'ultima occorrenza di </span> se presente
        const lastSpanIndex = elementHtml.lastIndexOf('</span>');

        if (lastSpanIndex === -1) {
            //è tutto contenuto testuale da processare
            elementHtml = '';
            textContent = categoryElement.text().trim();
        }else{
            // Divide il contenuto in due parti
            textContent = elementHtml.substring(lastSpanIndex + 7).trim(); // Dopo </span>
            elementHtml = elementHtml.substring(0, lastSpanIndex + 7); // Include </span>
        }

        //se non c'è abbastanza contenuto esci dalla funzione
        if (textContent.length < 1) return;

        // Dividi il contenuto in un array di parole separate da virgole
        const words = textContent.split(',').map(word => word.trim());

        // Genera il contenuto modificato
        const modifiedContent = words.map(word => {
            let hashNum = 0;
            
            for (let i = 0; i < word.length; i++) {
                hashNum += word.toLocaleUpperCase().charCodeAt(i);
            }
            hashNum = hashNum % 7;
            let hashBack = 'bg-primary';
            switch (hashNum) {
                case 0:
                    hashBack = 'bg-primary';
                    break;
                case 1:
                    hashBack = 'bg-secondary';
                    break;
                case 2:
                    hashBack = 'bg-success';
                    break;
                case 3:
                    hashBack = 'bg-warning text-dark';
                    break;
                case 4:
                    hashBack = 'bg-info text-dark';
                    break;
                case 5:
                    hashBack = 'bg-success';
                    break;
                case 6:
                    hashBack = 'bg-dark';
                    break;
                default:
                    hashBack = 'bg-primary';
                }

            return `<span role="alert" class="alert z-0 badge rounded-pill bg-primary m-0 p-1 text-white ${hashBack}">
                <i>${word}</i>
                <button type="button" class="m-0 p-0 bg-transparent border-0 text-white" data-bs-dismiss="alert" aria-label="Close">
                <span aria-hidden="true">&times;</span>
                </button> 
                </span>`;
        }).join(' ');

        // Sostituisci il contenuto originale con il nuovo contenuto
        categoryElement.html(elementHtml + modifiedContent);
    return;
}

function populateDepencies(){
    //set not more editable all the dbclick-editable
    document.querySelectorAll('.depency').forEach(depencyElement => {

        if (depencyElement.hasAttribute('href') && depencyElement.textContent.length==0) {
            var href = depencyElement.getAttribute('href'); 
            //remove # char
            href = href.split('#')[1];
            //get title from id
            var title = document.querySelector(`.myitem[data-value="${href}"] .title`);
            depencyElement.innerHTML = title.value.trim();
        }
    });

}

function insertNewTopic(){
    //Event on ENTER on '+ Add Category'
    $('input.addcategory').keypress(function (e) {
        var key = e.which;
        if(key == 13)  // the enter key code
        {
            var inputElement = e.target
            var reletedCategories = $(inputElement).parent().find('.categories')
            var new_topic = $(inputElement).val().trim()
            if (new_topic.length > 0) {
                reletedCategories.append(' '+new_topic)
                colorTopicsBadges(reletedCategories)
                $(inputElement).val("")
            }
            return false;  
        }
    });   
    $('input#newtopic').keypress(function (e) {
        var key = e.which;
        if(key == 13)  // the enter key code
        {
            var inputElement = e.target
            var reletedCategories = $(inputElement).parent().find('#topics')
            var new_topic = $(inputElement).val().trim()
            if (new_topic.length > 0) {
                reletedCategories.append(' '+new_topic)
                colorTopicsBadges(reletedCategories)
                $(inputElement).val("")
            }
            return false;  
        }
    });

}

function collapseAllItems(){
    //set not more editable all the dbclick-editable
    document.querySelectorAll('.desc').forEach(textareaElement => {

        if (textareaElement.classList.contains("expanded")){
            //collapse expanded desc
            $(textareaElement).closest('.myitem').find('button.expand-toggler').click();
            textareaElement.scrollTop = 0;
        }
    });
}

function enableDynamicActions() {
    
    //Expander toggler
    $('button.expand-toggler').on("click", function (e) {
        const target = e.target;
        // Trova il nodo padre (div con classe 'input-group') e l'input di testo all'interno
        let desc = $(target).closest('.myitem').find('.desc');
        let collapsables = $(target).closest('.myitem').find('.collapse');
        
        if (desc.length) {
            //flip icon
            if ($(target).hasClass('bx')){
                //iconclick
                $(target).toggleClass("bx-flip-vertical");
            }else{
                //buttonclick
                $(target).find('.bx').toggleClass("bx-flip-vertical");
            }
            // Verifica se il Datepicker è inizializzato
            $(desc).toggleClass("expanded");
            $(collapsables).toggleClass("showed");
            
        } else {
            console.log('No desc found');
        }
    });

    //star toggler
    $('button.star-toggler').on("click", function (e) {
        const target = e.target;
        
        //identifica se ho cliccato l'icona o il bottone        
        let star = (target.hasAttribute('starred')) ? $(target) : $(target).find('i.bx');
        //toggle star
        if (star.attr('starred') == '1') {
            star.attr('starred', 0);
            star.addClass("bx-star");
            star.removeClass("bxs-star");
        } else {
            star.attr('starred', 1);
            star.addClass("bxs-star");
            star.removeClass("bx-star");
        }

    });

    //Datepicker toggler
    $('.datapickertoggler').on("click", function (e) {
        const target = e.target;
        // Trova il nodo padre (div con classe 'input-group') e l'input di testo all'interno
        const input = $(target).closest('.input-group').find('input[type="text"]');
        if (input.length) {
            // Verifica se il Datepicker è inizializzato
            if (!input.data('datepicker')) {
                // Inizializza il Datepicker se non è già stato inizializzato
                input.datepicker({
                    autoclose: true,
                    format: 'dd/mm/yyyy',
                    language: 'it',
                    leftArrow: '<i class="bx bxs-left-arrow" ></i>',
                    rightArrow: '<i class="bx bxs-right-arrow" ></i>',
                    clearBtn: true,
                });
            }
            // Mostra il Datepicker
            input.datepicker('show');
        
        } else {
             console.log('No date found');
        }
    });

    //Advance task progress
    $('button.advance').on("click", function (e) {
        const btnProgress = e.target;
        $(btnProgress).val(parseInt($(btnProgress).val())+1);
        $(btnProgress).html('+ '+ $(btnProgress).val());
        $(btnProgress).prop('disabled', true);
    });

    //DESC expander
    $('.desc').on("click", function (e) {
        const target = e.target;
        //collapse all items
        collapseAllItems();
        //expand selected desc and flip it's icon
            if (!$(target).hasClass("expanded") ) {
                const togglerBtn = $(target).closest('.myitem').find('button.expand-toggler').click();
            }
    });

}

function enableSearch() {
    document.getElementById('mysearch').addEventListener('input', function () {

        const searchTerm = this.value.toLowerCase();
        const rows = document.querySelectorAll('.myitem');

        if (!searchTerm || searchTerm.length <= 2) {
            // If the search term is empty, or too short, show all rows
            $('.myitem:hidden').show();
            return;
        }

        // searching
        rows.forEach(row => {
            //search only  on desc/title/cateories
            const title_text = $(row).find('input.title').val();
            const desc_text = $(row).find('textarea.desc').val();
            const categories_text = $(row).find('.categories').text();
            
            // Remove previous highlights
            const onlyText = title_text + ' ' + desc_text + ' ' + categories_text;

            if (searchTerm && onlyText.toLowerCase().includes(searchTerm)) {
                // Show div
                $(row).show();
            } else {
                // Hide div if no match
                $(row).hide();
            }
        });
    });
}


// Funzione per inviare la richiesta di aggiornamento
function sendUpdate() {

    $('#saveBtn i').removeClass('bxs-save').addClass('bx-loader-circle bx-spin');
    $('#saveBtn').prop('disabled', true);
    const modifiedItems = getModifiedItems();

    $.ajax({
        url: "http://localhost/update",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({ modifiedItems }),
        success: function (response) {
            $('#saveBtn').prop('disabled', false);
            $('#saveBtn i').removeClass('bx-loader-circle bx-spin').addClass('bxs-save');
            $('#toastSuccess.text-message').html("changes have been saved :)");
            new bootstrap.Toast($('#toastSuccess')).show();
            console.log("Aggiornamento inviato:", response);
        },
        error: function (error) {
            $('#saveBtn').prop('disabled', false);
            $('#saveBtn i').removeClass('bx-loader-circle bx-spin').addClass('bxs-save');
            $('#toastFailure.text-message').html("changes have been saved :)");
            new bootstrap.Toast($('#toastFailure')).show();
            console.error("Errore durante l'invio:", error);
        },
    });
}

//Dato un elemento myitem mappa in un oggetto i valori interessati
function mapItemData(item) {
    myitem = $(item);
    const item_obj = {};

    item_obj.LUID = myitem.data("value");
    item_obj.order = myitem.attr('order');
    item_obj.title = myitem.find("input.title").val();
    item_obj.star = myitem.find("button.star-toggler i.bx").attr('starred');
    //item_obj.status = myitem.find(".status").value();
    item_obj.description = myitem.find("textarea.desc").val();
    item_obj.progress = myitem.find("button.advance").val();
    item_obj.expireDate = myitem.find("input.exp-date").val();

    item_obj.categories = myitem.find(".categories span.badge i").map(
        function () {return $(this).text().trim();}
        ).get().join(','); // Unisce i testi separati da ','

    const depency = myitem.find("a.depency").attr('href');
    item_obj.depends = (depency !== 'undefined') ? depency : '';
    return item_obj;

}

// Funzione per trovare i task modificati
function getModifiedItems() {
    const modifiedItems = [];

    $(".myitem").each(function (i,e) {
        const mod_item = mapItemData(e);
        const mod_id = mod_item.LUID;
        if (
            mod_item.title !== initialData[mod_id].title ||
            mod_item.description !== initialData[mod_id].description ||
            mod_item.categories !== initialData[mod_id].categories
        ) {
            modifiedItems.push(mod_item);
        }
    });

    return modifiedItems;
}





// Ripristino con CTRL+Z
$(document).on("keydown", function (e) {
    if (e.ctrlKey && e.key === "z") {
        //TODO : Nice to have revert function
    }
});


// Salvataggio ed invio con CTRL + S
$(document).on("keydown", function (e) {
    if (e.ctrlKey && e.key === "s") {
        // Prevent the Save dialog to open
        e.preventDefault();
        // Place your code here
        console.log('CTRL + S');
        $('#saveBtn').click();
    }
});

