var Assert = require('assert'),
    K = require('../lib/kyoto');

run();

function run() {

var db = K.open('/tmp/example.kch', 'a+', function(err) {
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
    each();
  });
}

function each() {
  db.each(close, function(val, key) {
    console.log('Key=%j Value=%j', key, val);
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