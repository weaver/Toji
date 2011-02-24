var Toji = require('../lib/'),
    type = Toji.type;

var Person = type('Person', {
  name: String,
  contact: String
});

var Comment = type('Comment', {
  body: String,
  date: Date,
  comments: ['Comment']
});

var User = type('User', {
  username: Toji.ObjectId
});

var db = Toji.open('/tmp/', 'w+', start);

function start(err) {
  if (err) throw err;
  db.load(created, [
    new Person({ name: 'Douglas Crockford', contact: 'douglas@crockford.com' }),
    new Person({ name: 'Chuck Norris', contact: 'fan@chucknorris.com' }),
    new Person({ name: 'Brendan Eich', contact: '@brendaneich' }),
    new Comment({ body: 'first post!', date: Date.now(), comments: [] }),
    new User({ username: 'alpha' }),
    new User({ username: 'beta' })
  ]);
}

function created(err) {
  if (err) throw err;
  Person.find({}, showAll);
}

function showAll(err, results) {
  if (err) throw err;
  console.log('\n## Results ##\n');
  console.log(results.join('\n'));
  console.log('');
  lookup();
}

function lookup() {
  Person.find({ name: /Chuck/ }).one(showOne);
}

function showOne(err, obj) {
  if (err)
    throw err;
  else if (!obj)
    console.log('Not found.');
  else {
    console.log('Found: %j', obj.json());
    obj.name = 'Carlos Ray "Chuck" Norris';
    obj.save(saved);
  }
}

function saved(err, obj) {
  if (err) throw err;
  console.log('Saved', obj);
  obj.remove(removed);
}

function removed(err) {
  if (err) throw err;
  console.log('Removed something, now all the people are:');
  Person.find({}, function(err, results) {
    if (err) throw err;
    console.log(' ', results.join('\n  '));
    User.find('alpha', showUser);
  });
}

function showUser(err, user) {
  if (err)
    throw err;
  else if (!user)
    console.log("Couldn't find User.");
  else {
    console.log('Found user:', user);
  }

}
