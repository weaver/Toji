var DB = require('../lib/database').DB,
    db = new DB();

var Author = db.type('Author', {
  name: String,
  email: String
});

// var Comments = new Schema('Comments', {
//   title: String,
//   date: Date,
//   comments: ['Comments']
// });

// var Example = new S.Schema('Example', {
//   author: Author,
//   date: Date,
//   title: String,
//   body: String,
//   comments: [Comments],
//   meta: {
//     votes: Number,
//     favs: Number
//   }
// });

console.log('Author:', db.load(Author, { name: 'Foo', email: 'foo@example.net' }));
