db = db.getSiblingDB("my_database"); // Nome del database

// Collezione "users"
db.createCollection("users");
db.users.insertMany([
    { name: "Alice", age: 25, email: "alice@example.com" },
    { name: "Bob", age: 30, email: "bob@example.com" }
]);

// Collezione "orders"
db.createCollection("orders");
db.orders.insertMany([
    { userId: 1, product: "Laptop", quantity: 1, total: 1000 },
    { userId: 2, product: "Phone", quantity: 2, total: 1200 }
]);
