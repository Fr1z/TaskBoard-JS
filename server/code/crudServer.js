const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
//TODO
//task pagination
//import export tasks
//drag and drop for mobile


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
    mail: String,
    organization: String,
    password: String,
    token: String,
    session: String,
    entryDate: Date,
    active: Number,
});
const taskSchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    LUID: Number,
    order: Number,
    title: String,
    star: Boolean,
    status: Number,
    description: String,
    progress: Number,
    lastProgress: Date,
    expireDate: String,
    categories: String,
    depends: String,
    lastEdit: Date
});
const User = mongoose.model('User', userSchema);
const Task = mongoose.model('Task', taskSchema);


const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token missing or invalid' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId; //Set the validated session

        next();
    } catch (err) {
        console.error('Invalid session:', err);
        return res.status(401).json({ message: 'Session invalid or expired' });
    }
};

//funzione che ottiene un nuovo localId, e nuovo order (in alto)
async function getMaxLUIDAndOrderByOwner(ownerIdString) {
    try {
        const ownerId = new mongoose.Types.ObjectId(ownerIdString);

        const result = await Task.aggregate([
            { $match: { owner: ownerId } }, // Filtra per owner
            {
                $group: {
                    _id: null, //nessun raggruppamento specifico
                    maxLUID: { $max: '$LUID' },
                    maxOrder: { $max: '$order' }
                }
            }
        ]);

        if (result.length === 0) {
            return { newLUID: null, newOrder: null }; // Nessun risultato
        }

        return {
            newLUID: (result[0].maxLUID + 1),
            newOrder: (result[0].maxOrder + 1)
        };
    } catch (err) {
        console.error("Errore:", err);
        throw err;
    }
}


// Middleware per gestire le sessioni autenticate
app.use(async (req, res, next) => {
    try {
        //Headers che permettono a tutti i client di inviare richieste al server
        res.setHeader('Access-Control-Allow-Origin', '*'); 
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    } catch (err) {
        console.error('Error in setting CORS headers:', err);
    }
    next();
});



// ROUTES

// Select All user tasks
app.get('/tasks', authenticateJWT, async (req, res) => {
    try {
        const tasks = await Task.find({ owner: req.userId }).select('-owner');
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ message: 'Error retrieving tasks', error: err });
    }
});

// UPDATE: Tasks update
app.put('/update', authenticateJWT, async (req, res) => {
    try {
        const { modifiedItems } = req.body; // Questo è l'array JSON di oggetti con i dati da aggiornare

        if (!Array.isArray(modifiedItems) || modifiedItems.length === 0) {
            return res.status(400).json({ message: 'Invalid or empty modifiedItems array' });
        }

        // Usa una transazione per aggiornare i documenti in modo sicuro
        const session = await mongoose.startSession();
        session.startTransaction();

        const updatePromises = modifiedItems.map(async (task) => {
            // Trova il documento da aggiornare e aggiorna
            task.lastEdit = new Date(); //Update lastEdit prop.

            await Task.findOneAndUpdate(
                { owner: req.userId, LUID: task.LUID }, // Usa 'owner della sessione' e 'LUID' come identificatore
                { $set: task }
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

// INSERT: Add a Task
app.post('/insert', authenticateJWT, async (req, res) => {
    try {
        const { newTask } = req.body; // Questo è l'array JSON di oggetti con i dati da aggiornare

        if (!newTask || newTask.title.length === 0) {
            return res.status(400).json({ message: 'Invalid task object' });
        }

        //put new task at the top of all, increment local_id by 1
        const {newLUID, newOrder} = await getMaxLUIDAndOrderByOwner(req.userId) || {};

        const task = new Task({
            owner: req.userId,
            LUID: newLUID,
            order: newOrder,
            title: newTask.title,
            star: false,
            status: 1,
            description: newTask.description,
            progress: 1,
            lastProgress: new Date('1990-01-01'),
            expireDate: newTask.expireDate,
            categories: newTask.categories,
            depends: newTask.depency,
            lastEdit: new Date()
        });

        const saved = await task.save();

        if (saved){
            // Risposta di successo
            res.status(200).json({ message: 'Task added successfully' });
        }else{
            res.status(501).json({ message: 'Task not added' });
        }

    } catch (error) {
        // In caso di errore, rollback della transazione
        res.status(500).json({ error: 'An error occurred while inserting a task', details: error.message });
    }
});

//PROGRESS: Tasks progress
app.put('/progress', authenticateJWT, async (req, res) => {
    try {
        const { taskItem } = req.body; 

        if (taskItem.length === 0) {
            return res.status(400).json({ message: 'Invalid or empty taskItem ' });
        }

        //timeAgo setted by default at 1days ago (max 1 update x day)
        const timeAgo = new Date();
        timeAgo.setDate(timeAgo.getDate() - 1);

        const deletedTask = await Task.findOneAndUpdate(
            {   owner: req.userId,// Usa 'owner' e 'LUID' come identificatore del task
                LUID: taskItem.LUID ,  
                lastProgress: { $lt: timeAgo } // lastProgress più vecchio di un giorno
            }, 
            { $inc: { progress: 1 } },  //incrementa il progress
            { $set: {
                lastEdit: new Date()  }
            }
        );
       
        // Risposta di successo
        if (deletedTask){
            res.status(200).json({ message: 'Task upgraded successfully' });
        } else {
            res.status(503).json({ message: 'Task cannot be upgraded now' });
        }
        
    } catch (error) {
        res.status(500).json({ error: 'An error occurred while upgrading a task', details: error.message });
    }
});

// COMPLETE: Task complete 
app.put('/complete', authenticateJWT, async (req, res) => {
    try {
        const { taskItem } = req.body; 

        if (taskItem.length === 0) {
            return res.status(400).json({ message: 'Invalid or empty taskItem ' });
        }

        const completedTask = await Task.findOneAndUpdate(
            {   owner: req.userId,// Usa 'owner' e 'LUID' come identificatore del task
                LUID: taskItem.LUID ,  
            },
            { $set: 
                {
                    lastEdit: new Date(),
                    status: {
                        $cond: {
                            if: { $eq: ["$status", 1] }, // if status 1 (TODO)
                            then: 2,                    // set Completed
                            else: 1                     // else is TODO!
                        }   
                    } 
                }
            }
        );
       
        // Risposta di successo
        if (completedTask){
            res.status(200).json({ message: 'Task completed successfully' });
        } else {
            res.status(503).json({ message: 'Task cannot be completed' });
        }
        
    } catch (error) {
        res.status(500).json({ error: 'An error occurred while upgrading a task', details: error.message });
    }
});

// DELETE: Task delete ( logical delete )
app.delete('/delete', authenticateJWT, async (req, res) => {
    try {
        const { taskItem } = req.body; 

        if (taskItem.length === 0) {
            return res.status(400).json({ message: 'Invalid or empty taskItem ' });
        }

        const progressedTask = await Task.findOneAndUpdate(
            {   owner: req.userId,// Usa 'owner' e 'LUID' come identificatore del task
                LUID: taskItem.LUID ,  
            },
            { $set: 
                {
                    lastEdit: new Date(),
                    status: 0
                }
            }
        );
       
        // Risposta di successo
        if (progressedTask){
            res.status(200).json({ message: 'Task deleted successfully' });
        } else {
            res.status(503).json({ message: 'Task cannot be deleted' });
        }
        
    } catch (error) {
        res.status(500).json({ error: 'An error occurred while upgrading a task', details: error.message });
    }
});

// Gestione delle sessioni

// Esegui il logout e rimuovi il cookie di sessione
app.post('/logout', authenticateJWT, async (req, res) => {
    try {
        res.clearCookie('sessionToken');
        const updatedUser = await User.findByIdAndUpdate(req.userId, { session: '' });
        if (!updatedUser) {
            return res.status(404).json({ message: 'UserID not found' });
        }
        res.json({ message: 'Logout successful' });
    } catch (err) {
        console.error("Error while logout:", err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Esegui il login e imposta un cookie di sessione
app.post('/login', async (req, res) => {
    try {
        const { mail, pass } = req.body;

        if (!mail || !pass) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        console.log("Trying login with: %s - %s", mail, pass);

        // Ricerca dell'utente nel database
        let user = await User.findOne({ mail: mail, active: 1 });

        if (user) {
            // First login or password reset
            if (user.password==''){ 
                try {
                    // Hash della password
                    const hashedPassword = await bcrypt.hash(pass, 10);
            
                    user = await User.findByIdAndUpdate(user._id, { password: hashedPassword }, { new: true });

                    if (!user) {
                        return res.status(404).json({ message: 'Error after setting password' });
                    }
        
                } catch (err) {
                    console.error('Error during setting password:', err);
                    return res.status(500).json({ message: 'Internal server error' });
                }
            }

            // Verifica la password
            const isPasswordValid = await bcrypt.compare(pass, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }
    
            // Genera il token JWT
            const jwt_token = jwt.sign(
                { userId: user._id }, // Payload
                process.env.JWT_SECRET, // Segreto
                { expiresIn: process.env.JWT_EXPIRATION } // Durata
            );
            
            return res.json({ session: jwt_token });
        } else {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (err) {
        console.error("Error while login:", err);
        res.status(500).json({ message: 'Internal server error' });
    }

});

app.post('/signup', async (req, res) => {
    const { mail, password, name , organization} = req.body;

    if (!mail || !password || !name) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        // Hash della password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Crea un nuovo utente
        const user = new User({
            mail: mail,
            password: hashedPassword,
            name: name,
            organization: organization,
            entryDate: new Date(),
            active: 1
        });

        await user.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('Error during registration:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Avvio server
const PORT = 8090;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
