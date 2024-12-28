const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');


const app = express();

// Middleware
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// Configurazione MongoDB
const MONGO_URI = 'mongodb://root:example@mongodb_container:27017/my_database?authSource=admin';
mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Schema e modello
const userSchema = new mongoose.Schema({
    name: String,
    ID: Number,
    email: String,
    organization: String,
    token: String,
    session: String,
    entryDate: Date,
    active: Number,
});
const taskSchema = new mongoose.Schema({
    owner: Number,
    LUID: Number,
    order: Number,
    title: String,
    star: Boolean,
    status: Number,
    description: String,
    progress: Number,
    lastProgress: Date,
    expireDate: Date,
    categories: String,
    depends: String
})
const User = mongoose.model('User', userSchema);
const Task = mongoose.model('Task', taskSchema);

function generaSessione() {
    return crypto.randomBytes(16).toString('hex');
  }

// Middleware per gestire le sessioni autenticate
app.use((req, res, next) => {
    //Headers che permettono a tutti i client di inviare richieste al server
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const sessionToken = authHeader.split(' ')[1]; // Estrai il token
        console.log('try auth with: ' + sessionToken);
        // Semplice esempio di verifica del token 
        const user = User.findOne({ session: sessionToken });
        if (user && user.active > 0) {
            console.log('Authenticated !');
            req.isAuthenticated = true;
            req.userId = user.ID
        } else {
            req.isAuthenticated = false;
            req.userId = 0
        }
    } else {
        req.isAuthenticated = false;
        req.userId = 0
    }
    next();
});

// Rotte

// SELECT: Ottieni tutti gli utenti (solo se autenticato)
app.get('/tasks', async (req, res) => {
    if (!req.isAuthenticated) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const tasks = await Task.find({ LUID: req.userId }).select('-owner');
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ message: 'Error retrieving tasks', error: err });
    }
});

// UPDATE: Aggiorna un task (solo se autenticato)
app.put('/update', async (req, res) => {
    if (!req.isAuthenticated) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const tasksToUpdate = req.body; // Questo è l'array JSON di oggetti con i dati da aggiornare

        // Usa una transazione per aggiornare i documenti in modo sicuro
        const session = await mongoose.startSession();
        session.startTransaction();

        const updatePromises = tasksToUpdate.map(async (task) => {
            // Trova il documento da aggiornare e aggiorna
            await Task.findOneAndUpdate(
                { owner: req.userId, LUID: task.LUID }, // Usa 'owner della sessione' e 'LUID' come identificatore
                { $set: task }, // Imposta i dati aggiornati
                { new: true, session } // 'new: true' restituisce il documento aggiornato
            );
        });

        // Aspetta che tutte le promesse siano risolte
        await Promise.all(updatePromises);

        // Commit della transazione
        await session.commitTransaction();
        session.endSession();

        // Risposta di successo
        res.status(200).json({ message: 'Tasks updated successfully' });
    } catch (error) {
        // In caso di errore, rollback della transazione
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }
        res.status(500).json({ error: 'An error occurred while updating tasks', details: error.message });
    }
});

// Semplice gestione delle sessioni
// Esegui il login e imposta un cookie di sessione
app.post('/login', (req, res) => {

    const { mail, token } = req.body;
    if (!mail || !token) {res.status(401).json({ message: 'Invalid access' });}

    // Ricerca dell'utente nel database
    const user = User.findOne({ email: mail, token: token , active: 1});
    console.log("Trying login with: %s - %s", email, token);
    if (user) {
        sessionToken = generaSessione()
        const updatedUser = User.findByIdAndUpdate(user.ID, { session: sessionToken });
        if (!updatedUser) {
            return res.status(404).json({ message: 'UserID not found' });
        }
        res.cookie('sessionToken', sessionToken, { 
            httpOnly: false,        // Rende il cookie accessibile solo tramite HTTP (non da JavaScript)
            secure: false,          // Richiede HTTPS (TODO make it work with true)
            sameSite: 'None'     // Consente l'invio cross-origin del cookie
        });
        res.json({ message: 'Login successfull: '+ sessionToken });
    } else {
        res.status(401).json({ message: 'Invalid access' });
    }
});

// Esegui il logout e rimuovi il cookie di sessione
app.post('/logout', (req, res) => {
    if (!req.isAuthenticated) {
        return res.status(401).json({ message: 'No valid session found.' });
    }

    res.clearCookie('sessionToken');
    const updatedUser = User.findByIdAndUpdate(req.userId, { session: '' });
    if (!updatedUser) {
        return res.status(404).json({ message: 'UserID not found' });
    }
    res.json({ message: 'Logout successful' });
});

// Avvio server
const PORT = 8090;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
