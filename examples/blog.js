var Sys = require('sys'),
    Toji = require('Toji');

// A very simple model that uses `name` as the primary id.
var Author = Toji.type('Author', {
  name: Toji.ObjectId,
  email: String
})
.validates('name', function(val) {
  if (!(val && /^[a-zA-Z0-9_\-]+$/.test(val)))
    throw 'bad account name';
});

// A self-referencial model: a comment contains an array of replies.
var Comment = Toji.type('Comment', {
  body: String,
  date: Date,
  comments: ['Comment']
});

// A post contains a thread of comments and a meta sub-object.
var Post = Toji.type('Post', {
  author: Toji.ref(Author),
  date: Date,
  title: String,
  body: String,
  comments: [Comment],
  meta: {
    votes: Number,
    favs: Number
  }
});

// When the blog software is installed, an author is added.
Toji.open('/tmp', 'w+', function(err) {
  if (err) throw err;

  var me = new Author({ name: 'me', email: 'self@mydomain.com' });
  me.save(function(err) {
    if (err) throw err;
    imaginaryScenario(me);
  });
});

function imaginaryScenario(author) {
  var postId;

  makePost(author, 'Hello', 'First post!', function(post) {
    postId = post.id;
    somebodyComments();
  });

  function somebodyComments() {
    addComment(postId, [], 'Nice blog, but it needs more content.', authorReplies);
  }

  function authorReplies(thread, commentPath) {
    addComment(postId, commentPath, 'I just put the blog up!', done);
  }

  function done() {
    Post.find(postId)
      .include('author')
      .one(function(err, post) {
        console.log('## Post Object ##');
        console.log(Sys.inspect(post.json(), null, null));
      });
  }
}

// Eventually, the author makes a post.
function makePost(author, title, body, next) {
  var post = new Post({
    author: author,
    date: Date.now(),
    title: title,
    body: body,
    comments: [],
    meta: { votes: 0, favs: 0 }
  });

  post.save(function(err) {
    if (err) throw err;
    next && next(post);
  });
}

// Add a comment to a Post.
//
// + postId  -- String unique id of Post.
// + replyTo -- Array of numbers that selects a comment from a thread
// + body    -- String comment body
// + next    -- Function(Comment, Array) callback
function addComment(postId, replyTo, body, next) {
  var post, created;

  Post.find(postId, function(err, obj) {
    if (err)
      throw err;
    else if (!obj)
      throw 'NotFound: ' + postId;
    else
      resolveComment((post = obj), replyTo, makeComment);
  });

  function makeComment(thread, resolved) {
    var obj = new Comment({
      body: body,
      date: Date.now(),
      comments: []
    });

    thread.comments.push(obj);

    post.save(function(err) {
      if (err) throw err;
      next && next(obj, resolved.concat([thread.comments.length - 1]));
    });
  }

}

// Find a comment by path inside a post.
//
// + post -- Post instance.
// + path -- Array of numebrs that selects a nested comment.
// + next -- Function(Comment, Array)
function resolveComment(post, path, next) {
  var resolved = [],
      thread = post;

  for (var i = 0, l = path.length; i < l; i++) {
    if (path[i] >= thread.comments.length)
      break;
    thread = thread.comments[path[i]];
    resolved.push(path[i]);
  }

  return next(thread, resolved);
}