
//AT LOADING PAGE SET FORM ACTION
document.addEventListener('DOMContentLoaded', function () {
    document.querySelector('#signup-form').setAttribute('action', serverAddress + "/signup");
});

// Card flip manager
document.getElementById('show-signup').addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('.card-flip').classList.add('flipped');
});

document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('.card-flip').classList.remove('flipped');
});


//Intercept submit form
document.getElementById('signup-form').addEventListener('submit', function (e) {
    e.preventDefault(); // Impedisce il comportamento predefinito di invio del form

    // Convert form data to json object (Required for backend)
    const formData = new FormData(this);
    var jsonObject = {};
    formData.forEach((value, key) => jsonObject[key] = value);
    var json = JSON.stringify(jsonObject);

    // Send data 
    fetch(serverAddress + '/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json
    })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error('Errore while sending form data');
            }
        })
        .then(data => {
            alert('Registration done! Try login');
        })
        .catch(error => {
            console.error('Error:', error);
            // Mostra un messaggio di errore
            alert('Error while signup process, try again.');
        });
});


//SEND LOGIN DATA
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const data = {
        mail: email,
        pass: password
    };

    fetch(serverAddress + '/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }).then(response => {
        if (!response.ok) { // Se la risposta è 200-299 (OK)
            console.error("error: " + response)
        }
        return response.json(); // Ottieni il messaggio di errore (se presente)
    })
        .then(data => {
            // Mostra il messaggio di errore nel caso in cui non sia 200
            if (data && data.sessionToken) {
                // Creazione del cookie sessione
                sessionToken = data.sessionToken;
                document.cookie = `sessionToken=${sessionToken}; Path=/`;
                // Reindirizza alla dashboard
                window.location.href = './dash.html'; // Reindirizza alla pagina dash.html
            } else if (data.message) {
                console.warn('Warning:', data.message);
                alert(data.message);
            } else {
                console.error('Error:', data.message);
            }
        })
        .catch(error => {
            // Gestisci eventuali errori di rete o altre eccezioni
            console.error('Errore nella richiesta:', error);
        });
});