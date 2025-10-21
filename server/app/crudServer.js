const express = require('express');
const helmet = require('helmet');
const pouchDB = require('pouchdb');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Prepend timestamps in front of log messages
require('console-stamp')(console, '[HH:MM:ss.l]');
const Task = require('./taskModel');
const User = require('./userModel');

const app = express();

// Middlewares
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Open CORS
app.use(async (req, res, next) => {
    try {
        //Headers that allows to receive request from all clients
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', true);
    } catch (err) {
        console.error('Error in setting CORS headers:', err);
    }
    next();
});


// Task upper-limit for each user
const userMaxTasks = process.env.USER_MAX_TASKS;

/**
 * SETUP DATABASE (POUCHDB)
 */

// Configuration PouchDB
pouchDB.plugin(require('pouchdb-find')); // required for .find and createIndex

// USER
const users = new pouchDB(process.env.POUCHDB_URL + '/user', { revs_limit: 1, auto_compaction: true }); // no Rev on users
// TASK 
const tasks = new pouchDB(process.env.POUCHDB_URL + '/task', { revs_limit: 3 });

//** INDEXES */
// Create an index if it doesn’t exist, or do nothing if it already exists.
users.createIndex({
    index: {
        fields: ['email'],
        ddoc: 'user-login-index'
    }
}).then(function (index) {
    if (index.result) {
        console.log("User login index ", index.result);
    }
}).then(function () {
    return tasks.createIndex({
        index: {
            fields: ['luid', 'owner'],
            ddoc: 'task-luid-index'
        }
    })
}).then(function (index) {
    if (index.result) {
        console.log("Task luid index ", index.result);
    }
}).then(function () {
    return tasks.createIndex({
        index: {
            fields: ['order', 'owner'],
            ddoc: 'task-order-index'
        }
    })
}).then(function (index) {
    if (index.result) {
        console.log("Task order index ", index.result);
    }
}).catch(function (err) {
    console.log(err);
});


const authenticateJWT = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token missing or invalid' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verifiy token
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

        // Avoid empty session (avoid disaster)
        if (decodedToken.session === undefined || decodedToken.session.length == 0) {
            return res.status(403).json({ message: 'No session' });
        }

        // Find the user session
        const result = await users.find({
            selector: { session: decodedToken.session },
            limit: 1,
            fields: ['_id', '_rev', 'organization', 'role']
        });

        // Verify session
        if (!result.docs || result.docs.length === 0) {
            return res.status(403).json({ message: 'User session not found!' });
        }

        const { _id: userId, _rev: userRev, organization: userOrg, role: userRole } = result.docs[0];

        // Add user info to next request
        req.userId = userId;
        req.userRev = userRev;
        req.userOrg = userOrg;
        req.userRole = userRole;

        return next();
    } catch (err) {
        console.warn("Error during authentication from ", req.ip, err);
        return res.status(401).json({ message: 'Session not valid or expired' });
    }
};

// This function returns the next luid and max order for a user
async function getMaxLUIDAndOrderByOwner(ownerIdString) {
    try {
        const result = await tasks.find({
            selector: { luid: { $gte: 0 }, owner: ownerIdString },
            fields: ['luid'],
            limit: userMaxTasks,
            use_index: 'task-luid-index',
            sort: [{ 'luid': 'desc' }]
        });

        // Verify result
        if (!result.docs) {
            throw new Error("Can't get any local task from owner");
        }

        // No task yet
        if (result.docs.length === 0) {
            return { newLUID: 1, newOrder: 1 };
        }

        const maxLUID = result.docs[0].luid; // Prendi _id dal primo ( e unico ) user
        const maxOrder = result.docs.length;

        return {
            newLUID: (maxLUID + 1),
            newOrder: (maxOrder + 1)
        };
    } catch (err) {
        console.error("Error:", err);
        throw err;
    }
}

// Generate UUID for temp tokens
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/** 
 * 
 * EXPRESS REQUESTS MANAGEMENT
 * 
 */


/**
 * ROUTES
 */

// Select All user tasks
app.get('/tasks', authenticateJWT, async (req, res) => {
    try {
        console.log("Asking all task of userId:", req.userId);
        const result = await tasks.find({
            selector: { owner: req.userId }, // TODO add organization and role filter
            limit: userMaxTasks
            //sort: [{ 'order': 'desc' }] // Task order
        });

        // Verify result
        if (result.docs === undefined || !result.docs) {
            throw new Error("Can't get any task from owner");
        }
        return res.status(200).json(result.docs);
    } catch (err) {
        return res.status(500).json({ message: 'Error retrieving tasks', error: err });
    }
});

// UPDATE: Tasks update
app.put('/update', authenticateJWT, async (req, res) => {
    try {
        const { modifiedItems } = req.body; // JSON array with update data

        if (!Array.isArray(modifiedItems) || modifiedItems.length === 0) {
            return res.status(400).json({ message: 'Invalid or empty modifiedItems array' });
        }

        const updatedResults = [];
        const updatePromises = modifiedItems.map(async (taskItem) => {

            tasks.get(taskItem._id).then(function (doc) {

                const userTask = new Task(doc);
                if (doc.owner !== req.userId) {
                    // Unauthorized
                    throw new Error('User not authorized!');
                }

                // Update task datas
                userTask.owner = req.userId;
                userTask.order = taskItem.order;
                userTask.title = taskItem.title;
                userTask.star = taskItem.star;
                userTask.description = taskItem.description;
                userTask.progress = taskItem.progress;
                userTask.expireDate = taskItem.expireDate;
                userTask.categories = taskItem.categories;
                userTask.depends = taskItem.depends;
                userTask.lastEdit = new Date();

                return userTask;
            }).then(async function (updatedTask) {
                // Put new task
                return await tasks.put(updatedTask);
            }).then(function (response) {
                if (response.ok) {
                    updatedResults.push(response);
                } else {
                    console.error("error while updating taskID: ", response.id);
                }
            }).catch(function (err) {
                console.error(err);
                return res.status(505).json({ message: 'Error while updating task' });
            });

        });

        // Wait promise
        await Promise.all(updatePromises);

        return res.status(200).json({ message: 'Task advanced successfully', data: updatedResults });
    } catch (error) {
        return res.status(500).json({ error: 'An error occurred while updating tasks', details: error.message });
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
        const { newLUID, newOrder } = await getMaxLUIDAndOrderByOwner(req.userId) || {};

        const newtask = new Task({
            owner: req.userId,
            luid: newLUID,
            order: newOrder,
            organization: req.userOrg,
            title: newTask.title,
            description: newTask.description,
            expireDate: newTask.expireDate,
            categories: newTask.categories,
            depends: newTask.depency
            //rev? 
        });

        const saved = await tasks.post(newtask);

        if (saved.ok) {
            // Task added successfully
            const response = { _id: saved.id, _rev: saved._rev };
            return res.status(200).json({ message: 'Task added successfully', data: response });

        } else {
            return res.status(501).json({ message: 'Task not added' });
        }

    } catch (error) {
        return res.status(500).json({ error: 'An error occurred while inserting a task', details: error.message });
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
        const timeAgo = new Date();  //TODO every org can set his minProgresstime
        timeAgo.setDate(timeAgo.getDate() - 1);

        tasks.get(taskItem._id).then(async function (doc) {
            const updatedTask = new Task(doc);

            if (updatedTask.owner !== req.userId) {
                // Unauthorized
                throw new Error('User not authorized!');
            }
            /**
             * removed check, let user progress as effort on it
            if (updatedTask.lastProgress >= timeAgo) {
                // Advanced too early
                throw new Error('Task cant be progressed now'); //TODO not an error
            }
            */
            updatedTask.progress += 1;
            return await tasks.put(updatedTask);

        }).then(function (response) {
            return res.status(200).json({ message: 'Task progressed successfully', data: response });
        }).catch(function (err) {
            console.error(err);
            return res.status(505).json({ message: 'Task cannot be progressed now' });
        });

    } catch (error) {
        return res.status(500).json({ error: 'An error occurred while upgrading a task', details: error.message });
    }
});

// COMPLETE: Task complete 
app.put('/complete', authenticateJWT, async (req, res) => {
    try {
        const { taskItem } = req.body;

        if (taskItem.length === 0) {
            return res.status(400).json({ message: 'Invalid or empty taskItem ' });
        }

        tasks.get(taskItem._id).then(async function (doc) {

            const updatedTask = new Task(doc);

            if (updatedTask.owner !== req.userId) {
                // Unauthorized
                throw new Error('User not authorized!');
            }

            updatedTask.lastEdit = new Date();
            updatedTask.completeDate = new Date();
            updatedTask.status = 2;

            return await tasks.put(updatedTask);

        }).then(function (response) {
            return res.status(200).json({ message: 'Task updated successfully', data: response });
        }).catch(function (err) {
            console.error(err);
            return res.status(505).json({ message: 'Error while updating task' });
        });

    } catch (error) {
        return res.status(500).json({ error: 'An error occurred while upgrading a task', details: error.message });
    }
});
// UNCOMPLETE: Task complete 
app.put('/uncomplete', authenticateJWT, async (req, res) => {
    try {
        const { taskItem } = req.body;

        if (taskItem.length === 0) {
            return res.status(400).json({ message: 'Invalid or empty taskItem ' });
        }

        tasks.get(taskItem._id).then(async function (doc) {
            const updatedTask = new Task(doc);

            if (updatedTask.owner !== req.userId) {
                // Unauthorized
                throw new Error('User not authorized!');
            }

            updatedTask.lastEdit = new Date();
            updatedTask.completeDate = "";
            updatedTask.status = 1;

            return await tasks.put(updatedTask);

        }).then(function (response) {
            return res.status(200).json({ message: 'Task updated successfully', data: response });
        }).catch(function (err) {
            console.error(err);
            return res.status(505).json({ message: 'Error while updating task' });
        });

    } catch (error) {
        return res.status(500).json({ error: 'An error occurred while upgrading a task', details: error.message });
    }
});

// DELETE: Task delete ( logical delete )
app.delete('/delete', authenticateJWT, async (req, res) => {
    try {
        const { taskItem } = req.body;

        if (taskItem.length === 0) {
            return res.status(400).json({ message: 'Invalid or empty taskItem ' });
        }

        tasks.get(taskItem._id).then(async function (doc) {

            const updatedTask = new Task(doc);

            if (updatedTask.owner !== req.userId) {
                // Unauthorized
                throw new Error('User not authorized!');
            }
            updatedTask.lastEdit = new Date();
            updatedTask.status = 0;

            return await tasks.put(updatedTask);
        }).then(function (response) {
            return res.status(200).json({ message: 'Task deleted', data: response });
        }).catch(function (err) {
            console.error(err);
            return res.status(505).json({ message: 'Error while deleting task' });
        });

    } catch (error) {
        return res.status(500).json({ error: 'An error occurred while upgrading a task', details: error.message });
    }
});

// IMPORT: Import many task 
app.post('/import', authenticateJWT, async (req, res) => {
    try {
        const jsonData = req.body;

        // Validate body request
        if (!Array.isArray(jsonData)) {
            return res.status(400).json({ message: "Input must be an array of tasks" });
        }

        console.log(`User ${req.userId} trying to import ${jsonData.length} task`);

        // Create an array for new id mapping
        let newLuidMap = [];
        // Get values allowed for new imported task
        var { minLUID, minOrder } = await getMaxLUIDAndOrderByOwner(req.userId) || { minLUID: 1, minOrder: 1 };

        const sanitizedTasks = jsonData.map(task => {
            // Remove _id and _rev in each task
            const { _id, _rev, ...taskData } = task;
            // Assign new owner
            taskData.owner = req.userId;

            // Update organization
            taskData.organization = req.userOrg

            // Assign new available item luid
            if (taskData.luid < minLUID) {
                let newMap = {};
                newMap[taskData.luid] = minLUID; // Map old luid with new one for translations
                newLuidMap.push(newMap);
                minLUID += 1; // Increment minLUID for next overflowed task
            }

            // Assign new available item order
            if (taskData.order < minOrder) {
                taskData.order = minOrder;
                minOrder += 1;
            }

            return taskData;
        });

        const importedTasks = sanitizedTasks.map(task => {
            // Update depencies luid with mapped ones (if any)
            const updatedDepends = task.depends.split(",").map(depencyLUID => {
                return newLuidMap[depencyLUID] || depencyLUID
            }).join(",");

            task.depends = updatedDepends;
            return task
        });

        // Insert all task to db
        const insertedTasks = await tasks.bulkDocs(importedTasks);

        // Check if all task has been inserted
        let with_error = false;
        insertedTasks.forEach(res => {
            if (res.hasOwnProperty('ok') && !res.ok) {
                console.warn("Task non importato correttamente: ", json(res)); // Stampa la proprietà test
                with_error = true;
            }
        });

        if (!with_error) {
            return res.status(201).json({ message: 'All Tasks imported successfully :)' });
        } else if (insertedTasks[0].ok && with_error) {
            return res.status(201).json({ message: 'WARNING: Not all tasks has been added successfully' });
        } else {
            return res.status(503).json({ message: 'Task cannot be added' });
        }

    } catch (error) {
        return res.status(500).json({ error: 'An error occurred while upgrading a task', details: error.message });
    }
});

// Session manager
// Logout user and delete session cookie
app.post('/logout', authenticateJWT, async (req, res) => {
    try {
        res.clearCookie('sessionToken');

        users.get(req.userId).then(function (doc) {

            const updatedUser = new User(doc);
            updatedUser.session = "";

            return users.put(updatedUser);
        }).then(function (response) {
            if (response._id.length > 0) {
                return res.json({ message: 'Logout successful' });
            }
            throw new Error("Bad update");
        }).catch(function (err) {
            console.error(err);
            console.error("Suspect Error: trying to logout not existing user", err);
            return res.status(404).json({ message: 'UserID not found' });
        });

    } catch (err) {
        console.error("Error while logout:", err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

// Log in user by mail & password
app.post('/login', async (req, res) => {
    try {
        const { mail, pass } = req.body;

        if (!mail || !pass) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        //console.log("Trying login with: %s - %s", mail, pass);

        // Get user by mail
        const result = await users.find({
            selector: { email: mail },
            limit: 1,
            use_index: 'user-login-index'
        });

        // Verify result on pouchDB, wrong mail
        if (!result.docs || result.docs.length === 0 || result.docs[0]._id === undefined) {
            console.warn("Can't get user: ", mail);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // First result
        const user = new User(result.docs[0]);

        // Validate login
        const validAccess = await bcrypt.compare(pass, user.password);
        if (!validAccess) {
            console.warn("Invalid access: ", mail);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // User exists but shouldn't access
        if (user.status == 0) {
            return res.status(401).json({ message: 'User needs to be activated.' });
        } else if (user.status == 2) {
            return res.status(401).json({ message: 'Banned User.' });
        }

        // Generate and update a new session hash
        if (user.session === undefined || user.session.length == 0) {
            const newSession = uuidv4();
            user.session = newSession;
            const update_result = await users.put(user);
            
            // Check session update
            if (!update_result.ok) {
                throw new Error("Cant update user session.");
            }
        }

        /***
        // Note: with promises should be like this
        users.find({
            selector: { email: mail },
            limit: 1,
            fields: ['_id','rev','password','status']
        }).then(function (d) {

            if (!d.docs || d.docs.length === 0 || d.docs[0]._id === undefined) {
                console.warn("Can't get user: ", mail);
                return res.status(401).json({ message: 'Invalid credentials' });
            }
            const u = d.docs[0];

            users.get(u).then(function (doc) {
                return db.put({
                    _id: 'mydoc',
                    _rev: doc._rev,
                    title: "Let's Dance"
                });
            }).then(function (response) {
                // handle response
            }).catch(function (err) {
                console.log(err);
            });

        });
        ***/



        // Generate JWT
        const jwt_token = jwt.sign(
            { session: user.session }, // Payload
            process.env.JWT_SECRET, // Secret
            { expiresIn: process.env.JWT_EXPIRATION } // Should be valid until expiration.
        );

        console.log("User should be logged, token send.", jwt_token);

        return res.json({ sessionToken: jwt_token });

    } catch (err) {
        console.error("Error while login:", err);
        return res.status(500).json({ message: 'Internal server error' });
    }

});

// User registration
app.post('/signup', async (req, res) => {
    const { mail, password, name, organization } = req.body;

    if (!mail || !password || !name) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user with form data
        const newUser = new User({
            email: mail,
            password: hashedPassword,
            session: "",
            name: name,
            organization: organization,
            token: uuidv4(),
            active: 1 // TODO change to 0 for link activation
        });

        const response = await users.post(newUser);
        if (!response.ok) {
            throw new Error("Error while creating user"); // user exists?
        }

        const userId = response.id;
        const firstTask = new Task(
            {
                owner: userId, // ID generated by DB
                title: "My First Task",
                star: false,
                description: "Look, I can edit this simple clicking where I need to work :)",
            }
        );
        const ready = await tasks.post(firstTask);

        if (!ready.ok) {
            throw new Error("Error while creating first task");
        }

        console.log(`User ${name}(${mail}) registered.`);

        return res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('Error during registration:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

// Starting HTTP Server
const PORT = process.env.PORT;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});