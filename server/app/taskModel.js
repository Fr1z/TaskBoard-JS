/*
   [Schema]
       _id: '62c54kld03264a9deaerdef64f27ea7f4',
       owner: "24c92ccd10063b9deaedef64f21ea7f0",
       luid: 1,
       organization: "myOrg",
       viewRole: "admin(1)",
       order: 0,
       title: "My First Task",
       star: false,
       status: 1,
       description: "Look, I'm a task :)",
       progress: 1,
       categories: "tutorial,demo",
       depends: "3,2,4",
       expireDate: "",
       lastEdit: "1990-01-01T00:00:00.000Z",
       lastProgress: "1990-01-01T00:00:00.000Z",
       completeDate: ""
 */

       
class Task {
    constructor({
        _id = "",
        _rev = "",
        owner = "",
        luid = 1,
        organization = "myOrg",
        viewRole = "",
        order = 1,
        title = "My First Task",
        star = false,
        status = 1,
        description = "Look, I'm a task :)",
        progress = 1,
        categories = "tutorial,demo",
        depends = "",
        expireDate = "",
        lastEdit = new Date(),
        lastProgress = new Date('1990-01-01'),
        completeDate = ""
    } = {}) {
        if ( _id.length > 0 ) {this._id = _id;}
        if (_rev.length > 0 ) {this._rev = _rev;}
        this.owner = owner;
        this.luid = luid;
        this.organization = organization;
        this.viewRole = viewRole;
        this.order = order;
        this.title = title;
        this.star = star;
        this.status = status;
        this.description = description;
        this.progress = progress;
        this.categories = categories;
        this.depends = depends;
        this.expireDate = expireDate;
        this.lastEdit = lastEdit;
        this.lastProgress = lastProgress;
        this.completeDate = completeDate;
    }
}

module.exports = Task;  // Esporta la classe Task
