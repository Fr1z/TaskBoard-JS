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
        title: "Metodologia",
        star: 0,
        status: 0,
        description: "delineare il metodo testparallelo/mastermind, parametri",
        progress: 3,
        lastProgress: "0",
        expireDate: "",
        categories: "logic,math",
        depends: "2"
    },
    {
        owner: adminUser._id, // Usa l'_id recuperato,
        LUID: 2,
        order: 1,
        title: "Termux v2",
        star: 1,
        status: 1,
        description: "termux with python and camera input.",
        progress: 4,
        lastProgress: "1732720585556",
        expireDate: "",
        categories: "python,android",
        depends: ""
    },
    {
        owner: adminUser._id, // Usa l'_id recuperato,
        LUID: 3,
        order: 0,
        title: "Rafiki",
        star: 0,
        status: 0,
        description: "app disegna numeri geometrici",
        progress: 1,
        lastProgress: "0",
        expireDate: "25/12/2030",
        categories: "python,math",
        depends: "1,2"
    }
]);
