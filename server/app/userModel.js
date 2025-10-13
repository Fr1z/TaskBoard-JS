/*
  [user]
      _id: "24c92ccd10063b9deaedef64f21ea7f0",
      session: "",
      email: "admin@localhost.com",
      password: "",
      name: "admin",
      organization: "myOrg",
      role: "admin",
      token: "",
      entryDate: "1990-01-01T00:00:00.000Z",
      active: 1
*/


class User {
    constructor({
        _id = "",
        _rev = "",
        session = "",
        email = "admin@localhost.com",
        password = "",
        name = "admin",
        organization = "myOrg",
        role = "user",
        token = "",
        entryDate = new Date(),
        active = 0
    } = {}) {
        if ( _id.length > 0 ) {this._id = _id;}
        if (_rev.length > 0 ) {this._rev = _rev;}
        this.session = session;
        this.email = email;
        this.password = password;
        this.name = name;
        this.organization = organization;
        this.role = role;
        this.token = token;
        this.entryDate = entryDate;
        this.active = active;
    }
}

// Types: “null”, “boolean”, “number”, “string”, “array”, or “object”

module.exports = User;  // Esporta la classe User
