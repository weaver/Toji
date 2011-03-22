var Assert = require('assert'),
    Toji = require('../lib/index'),
    db;

module.exports = {
  'setup': function(done) {
    db = Toji.open('/tmp', 'w+', done);
  },

  'presence': function(done) {
    var ExampleUser = Toji.type('ExampleUser', {
      username: Toji.ObjectId,
      password: String,
      fullName: String
    })
    .validatesPresenceOf(['username', 'password']);

    Assert.deepEqual(ExampleUser.__schema__, {
      type: 'record',
      name: 'ExampleUser',
      fields: [
        { type: 'string', name: 'username' },
        { type: 'string', name: 'password' },
        { type: ['string', 'null'], name: 'fullName' }
      ]
    });

    Assert.equal(ExampleUser.__pk__, 'username');

    var user;

    Assert.ok((user = new ExampleUser({ username: 'a', password: 'b' })).isValid());
    Assert.ok(!(user = new ExampleUser({ username: '' })).isValid());

    Assert.deepEqual(user.errors, {
      username: ['expected non-empty value'],
      password: ['expected non-empty value']
    });

    done();
  },

  'custom': function(done) {
    var CustomItem = Toji.type('CustomItem', {
      a: Number,
      b: Number
    })
    .validatesPresenceOf('a', 'you gave me an empty value')
    .validates(['a', 'b'], function(val, field) {
      if ((typeof val != 'number') || (val % 2 != 0))
        throw 'even numbers only';
    });

    (new CustomItem({})).save(function(err, item) {
      Assert.ok(err);
      Assert.equal(err.message, 'CustomItem: you gave me an empty value (data = undefined)');
      Assert.deepEqual(item.errors, {
        a: ['you gave me an empty value', 'even numbers only'],
        b: ['even numbers only']
      });
      Assert.ok(!item.isValid());
      done();
    });
  }

};