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
  }

};