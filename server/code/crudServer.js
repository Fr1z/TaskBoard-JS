const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');

const app = express();

// Middleware
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// Configurazione MongoDB
const MONGO_URI = 'mongodb://root:example@mongodb_container:27017/my_database?authSource=admin';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Schema e modello
const userSchema = new mongoose.Schema({
    name: String,
    age: Number,
    email: String,
});
const User = mongoose.model('User', userSchema);

// Middleware per gestire le sessioni autenticate
app.use((req, res, next) => {
    const sessionToken = req.cookies.sessionToken;
    if (sessionToken) {
        // Semplice esempio di verifica del token (in pratica, usa JWT o un database)
        if (sessionToken === 'valid-session-token') {
            req.isAuthenticated = true;
        } else {
            req.isAuthenticated = false;
        }
    } else {
        req.isAuthenticated = false;
    }
    next();
});

// Rotte

// SELECT: Ottieni tutti gli utenti (solo se autenticato)
app.get('/users', async (req, res) => {
    if (!req.isAuthenticated) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Error retrieving users', error: err });
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
    const { username, password } = req.body;

    // Esempio semplice (usa database o JWT in produzione)
    if (username === 'admin' && password === 'password') {
        res.cookie('sessionToken', 'valid-session-token', { httpOnly: true });
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
