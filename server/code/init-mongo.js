db = db.getSiblingDB("my_database"); // Nome del database

// Collezione "users"
db.createCollection("users");
db.users.insertMany([
    {   name: "admin",
        ID: 1,
        email: "admin@mail.com",
        organization: "myOrg",
        token: "admin",
        session: "",
        entryDate: "",
        active: 1
    }
]);

// Collezione "orders"
db.createCollection("tasks");
db.tasks.insertMany([
    {
        owner: 1,
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
        owner: 1,
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
        owner: 1,
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
