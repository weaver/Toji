var DB = require('../lib/database').DB,
    db = new DB();

var Author = db.type('Author', {
  name: String,
  email: String
});

var Comment = db.type('Comment', {
  body: String,
  date: Date,
  comments: ['Comment']
});

var Post = db.type('Post', {
  author: Author,
  date: Date,
  title: String,
  body: String,
  comments: [Comment],
  meta: {
    votes: Number,
    favs: Number
  }
});

var author, comment;

console.log('Author:', author = Author.load({
  name: 'Foo',
  email: 'foo@example.net'
}));

console.log('Comment:', comment = Comment.load({
  body: 'First post!',
  date: '11/21/07',
  comments: []
}));

console.log('Post:', Post.load({
  author: author,
  date: '11/20/07',
  title: 'Some Words',
  body: 'lorem ipsum',
  comments: [comment],
  meta: {
    votes: 0,
    favs: 0
  }
}));