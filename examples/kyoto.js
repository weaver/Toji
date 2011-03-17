var Assert = require('assert'),
    K = require('../lib/kyoto');

run();

function run() {

var db = K.open('/tmp/example.kch', 'w+', function(err) {
  if (err) throw err;
  set();
});

function set() {
  db.set('alpha', 'one', function(err) {
    if (err) throw err;
    get();
  });
}

function get() {
  db.get('alpha', function(err, value) {
    if (err) throw err;
    Assert.equal(value, 'one');
    setAgain();
  });
}

function setAgain() {
  db.set('beta', 'two', function(err) {
    if (err) throw err;
    each(add);
  });
}

function each(next) {
  console.log('each:');
  db.each(next, function(val, key) {
    console.log('Key=%j Value=%j', key, val);
  });
}

function add() {
  db.add('gamma', 'three', function(err) {
    if (err) throw err;
    each(addAgain);
  });
}

function addAgain() {
  db.add('gamma', 'replaced three', function(err) {
    if (err && err.code != K.DUPREC) throw err;
    each(replace);
  });
}

function replace() {
  db.replace('gamma', 'really replaced three', function(err) {
    if (err) throw err;
    failReplace();
  });
}

function failReplace() {
  db.replace('fail', '', function(err) {
    if (!err) throw 'didnt replace';
    else if (err.code != K.NOREC) throw err;
    remove();
  });
}

function remove(err) {
  if (err) throw err;
  db.remove('alpha', function(err) {
    if (err) throw err;
    each(close);
  });
}

function close(err) {
  if (err) throw err;
  db.close(function(err) {
    if (err) throw err;
    console.log('ok');
  });
}

}