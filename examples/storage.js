var Toji = require('../lib/'),
    db = new Toji.Storage('/tmp'),
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

db.open('w+', start);

function start(err) {
  if (err) throw err;
  db.load(created, [
    new Person({ name: 'Douglas Crockford', contact: 'douglas@crockford.com' }),
    new Person({ name: 'Chuck Norris', contact: 'fan@chucknorris.com' }),
    new Person({ name: 'Brendan Eich', contact: '@brendaneich' }),
    new Comment({ body: 'first post!', date: Date.now(), comments: [] })
  ]);
}

function created(err) {
  if (err) throw err;
  db.find(Person).next(showAll);
}

function showAll(err, results) {
  if (err) throw err;
  console.log('\n## Results ##\n');
  console.log(results.join('\n'));
  console.log('');
  lookup();
}

function lookup() {
  db.find(Person)
    .filter(function(obj) {
      return /Chuck/.test(obj.name);
    })
    .get(showOne);
}

function showOne(err, obj) {
  if (err)
    throw err;
  else if (!obj)
    console.log('Not found.');
  else {
    console.log('Found:', obj);
    obj.name = 'Carlos Ray "Chuck" Norris';
    db.save(obj, saved);
  }
}

function saved(err, obj) {
  if (err) throw err;
  console.log('Saved', obj);
}