db = db.getSiblingDB("my_database"); // Nome del database

// Collezione "users"
db.createCollection("users");
db.users.insertMany([
    {   name: "admin",
        mail: "admin",
        organization: "myOrg",
        password: "",
        token: "",
        session: "",
        entryDate: new Date(),
        active: 1
    }
]);

// Recupera l'_id dell'utente "admin"
const adminUser = db.users.findOne({ name: "admin" });

// Collezione "orders"
db.createCollection("tasks");
db.tasks.insertMany([
    {
        owner: adminUser._id, // Usa l'_id recuperato,
        LUID: 1,
        order: 0,
        title: "My First Task",
        star: false,
        status: 1,
        description: "Look, I can edit this simple clicking where I need to work :)",
        progress: 1,
        lastProgress: new Date('1990-01-01'),
        expireDate: "",
        categories: "tutorial,demo",
        depends: "",
        lastEdit: new Date(),
    }
]);
