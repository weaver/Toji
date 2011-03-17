var Assert = require('assert'),
    Crypto = require('crypto'),
    Toji = require('../lib');

var Person = Toji.type('Person', {
  name: String,
  contact: String
});

var Comment = Toji.type('Comment', {
  body: String,
  date: Date,
  comments: ['Comment']
});

var User = Toji.type('User', {
  username: Toji.ObjectId,
  password: String
})
.validatesPresenceOf(['username', 'password']);

User.beforeSave(function(obj) {
  if (obj.password) {
    var salt = Math.floor(Math.random() * Math.exp(10)).toString(),
        hash = Crypto.createHash('sha256').update(salt).update(obj.password);
    obj.password = '{{SHA256}}' + salt + '$' + hash.digest('base64');
  }
});

User.afterSave(function(obj) {
  obj._password = obj.password;
  obj.password = '';
});

User.afterLoad(function(obj) {
  obj._password = obj.password;
  obj.password = '';
});

var Box = Toji.type('Box', {
  value: Toji.union(Person, Comment, User),
  values: [Toji.union(Person, Comment, User)],
  point: { x: String, y: String }
});

var Tree = Toji.type('Tree', {
  supervisor: Toji.ref(Person),
  employees: [Toji.ref(Person)]
});

var db = Toji.open('/tmp/', 'w+', start);

function start(err) {
  if (err) throw err;
  db.load(created, [
    new Person({ name: 'Chuck Norris', contact: 'fan@chucknorris.com' }),
    new Person({ name: 'Douglas Crockford', contact: 'douglas@crockford.com' }),
    new Person({ name: 'Brendan Eich', contact: '@brendaneich' }),
    new Comment({ body: 'first post!', date: Date.now(), comments: [] }),
    new User({ username: 'alpha', password: 'apple' }),
    new User({ username: 'beta', password: 'boat' })
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
    console.log('Dump REPR: %j', obj.dumpJSON());
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
    console.log('Hidden password:', user._password);
    validation();
  }
}

function validation() {
  var user;

  Assert.ok((new User({ foo: 'bar' })).foo === undefined);
  Assert.ok((new Person({ id: 'foo' })).id === undefined);

  Assert.ok((new User({ username: 'frob', password: 'frump' })).isValid());
  Assert.ok(!(user = new User()).isValid());
  console.log('invalid %j', user.errors);

  (new User({ username: "frob", password: "" })).save(function(err, obj) {
    Assert.ok(err, 'expected error');
    unions();
  });
}

function unions() {
  User.find('alpha', function(err, alpha) {
    if (err) throw err;
    (new Box({
      value: alpha,
      values: [alpha],
      point: { x: '11', y: '12' }
    })).save(saved);
  });

  function saved(err, obj) {
    if (err) throw err;
    Box.find(obj.id, found);
  }

  function found(err, box) {
    if (err) throw err;
    Assert.equal(box.value.username, 'alpha');
    console.log('box: %j', box.json());
    console.log('box: %j', box.dumpJSON());
    refs();
  }
}

function refs() {
  Person.find({}, function(err, people) {
    if (err) throw err;
    var tree = (new Tree({ supervisor: people[0], employees: people.slice(1) }));
    console.log('validate tree %j', tree.validate());

    tree.save(function(err, tree) {
      if (err) throw err;
      console.log('tree %j', tree.json());
      console.log('validated tree %j', (new Tree(tree.json())).validate());

      Tree.find(tree.id)
        .resolve('supervisor', 'employees')
        .one(function(err, obj) {
          if (err) throw err;
          console.log('loaded tree', obj);
          console.log('loaded tree json', obj.json());

          Tree.find({})
            .resolve('supervisor')
            .all(function(err, results) {
              if (err) throw err;
              console.log('all trees', require('util').inspect(results, false, null));

              results[0].resolve('employees', 'supervisor', function(err) {
                if (err) throw err;
                console.log('resolved object', results[0]);
                console.log('resolved object dump', results[0].json());
              });
            });
        });
    });
  });
}

