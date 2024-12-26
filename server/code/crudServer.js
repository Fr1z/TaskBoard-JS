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
    entryDate: Date
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
    const sessionToken = req.cookies.sessionToken;
    if (sessionToken && !(res.isAuthenticated)) {
        // Semplice esempio di verifica del token 
        const user = User.findOne({ session: sessionToken });
        if (user.length == 1) {
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
        const tasks = await Task.find({ LUID: req.userId });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ message: 'Error retrieving tasks', error: err });
    }
});

// UPDATE: Aggiorna un utente (solo se autenticato)
app.put('/users/:id', async (req, res) => {
    if (!req.isAuthenticated) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = req.params.id;
    const updates = req.body;

    try {
        const updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true });
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: 'Error updating user', error: err });
    }
});

// Semplice gestione delle sessioni
// Esegui il login e imposta un cookie di sessione
app.post('/login', (req, res) => {

    const { email, token } = req.body;

    // Ricerca dell'utente nel database
    const user = User.findOne({ mail: email, token: token });
  
    if (user) {
        sessionToken = generaSessione()
        user.session = sessionToken
        res.cookie('sessionToken', sessionToken, { httpOnly: true });
        res.json({ message: 'Login successful' });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
});

// Esegui il logout e rimuovi il cookie di sessione
app.post('/logout', (req, res) => {
    res.clearCookie('sessionToken');
    res.json({ message: 'Logout successful' });
});

// Avvio server
const PORT = 8090;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
