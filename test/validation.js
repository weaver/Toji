var Assert = require('assert'),
    Toji = require('../lib/index'),
    db, data;

var ValidateData = Toji.type('ValidateData', {
  value: String
});

module.exports = {
  'setup': function(done) {
    db = Toji.open('/tmp', 'w+', function(err) {
      if (err) throw err;

      (new ValidateData({ value: 'stuff' })).save(function(err, obj) {
        if (err) throw err;
        data = obj;
        done();
      });
    });
  },

  'not empty': function(done) {
    var NotEmptyUser = Toji.type('NotEmptyUser', {
      username: Toji.ObjectId,
      password: String,
      active: Boolean,
      tokens: Number,
      tags: [String],
      profile: Toji.ref(ValidateData),
      fullName: String
    })
    .validatesNotEmpty(['password', 'active', 'tokens', 'tags', 'profile']);

    Assert.deepEqual(NotEmptyUser.__schema__, {
      type: 'record',
      name: 'NotEmptyUser',
      fields: [
        { type: 'string', name: 'username' },
        { type: 'string', name: 'password' },
        { type: 'boolean', name: 'active' },
        { type: 'double', name: 'tokens' },
        { type: { type: 'array', items: 'string' }, name: 'tags' },
        { type: 'string', name: 'profile', references: 'ValidateData' },
        { type: ['string', 'null'], name: 'fullName' }
      ]
    });

    Assert.equal(NotEmptyUser.__pk__, 'username');

    var user;

    Assert.ok((user = new NotEmptyUser({
      username: 'a',
      password: 'b',
      active: false,
      tokens: 0,
      tags: ['new'],
      profile: data
    })).isValid());

    Assert.ok(!(user = new NotEmptyUser({ username: '', tags: [] })).isValid());

    Assert.deepEqual(user.errors, {
      password: ['expected non-empty value'],
      active: ['expected non-empty value'],
      tokens: ['expected non-empty value'],
      tags: ['expected non-empty value'],
      profile: ['expected non-empty value'],
      username: ['missing required value']
    });

    done();
  },

  'not null': function(done) {
    var NotNullUser = Toji.type('NotNullUser', {
      username: Toji.ObjectId,
      password: String,
      active: Boolean,
      tokens: Number,
      tags: [String],
      profile: Toji.ref(ValidateData),
      fullName: String
    })
    .validatesNotNull(['password', 'active', 'tokens', 'tags', 'profile']);

    Assert.deepEqual(NotNullUser.__schema__, {
      type: 'record',
      name: 'NotNullUser',
      fields: [
        { type: 'string', name: 'username' },
        { type: 'string', name: 'password' },
        { type: 'boolean', name: 'active' },
        { type: 'double', name: 'tokens' },
        { type: { type: 'array', items: 'string' }, name: 'tags' },
        { type: 'string', name: 'profile', references: 'ValidateData' },
        { type: ['string', 'null'], name: 'fullName' }
      ]
    });

    Assert.equal(NotNullUser.__pk__, 'username');

    var user;

    Assert.ok((user = new NotNullUser({
      username: 'a',
      password: 'b',
      active: false,
      tokens: 0,
      tags: [],
      profile: data
    })).isValid());

    Assert.ok(!(user = new NotNullUser({ username: '' })).isValid());

    Assert.deepEqual(user.errors, {
      password: ['expected non-null value'],
      active: ['expected non-null value'],
      tokens: ['expected non-null value'],
      tags: ['expected non-null value'],
      profile: ['expected non-null value'],
      username: ['missing required value']
    });

    done();
  },

  'custom': function(done) {
    var CustomItem = Toji.type('CustomItem', {
      a: Number,
      b: Number
    })
    .validatesNotEmpty('a', 'you gave me an empty value')
    .validates(['a', 'b'], function(val, field) {
      if ((typeof val != 'number') || (val % 2 != 0))
        throw 'even numbers only';
    });

    secondTry();

    function firstTry() {
      (new CustomItem({})).save(function(err, item) {
        Assert.ok(err);
        Assert.equal(err.message, 'CustomItem: you gave me an empty value (data = {})');
        Assert.deepEqual(item.errors, {
          a: ['you gave me an empty value', 'even numbers only'],
          b: ['even numbers only']
        });
        Assert.ok(!item.isValid());
        secondTry();
      });
    }

    function secondTry() {
      (new CustomItem({ a: 1, b: 2 })).save(function(err, item) {
        Assert.ok(err);
        Assert.deepEqual(item.errors, {
          a: ['even numbers only']
        });
        Assert.ok(!item.isValid());
        theCharm();
      });
    }

    function theCharm() {
      (new CustomItem({ a: 2, b: 4 })).save(function(err, item) {
        Assert.ok(!err);
        Assert.deepEqual(item.errors, {});
        Assert.ok(item.isValid());
        done();
      });
    }
  },

  'nested': function(done) {
    var NestedItem = Toji.type('NestedItem', {
      a: { b: Number },
      b: [String],
      c: [{ d: Number }]
    });

    (new NestedItem({ a: { b: 'foo' }, b: [10], c: [{ d: 'bar' }] }))
     .save(function(err, item) {
        Assert.ok(err);
        Assert.deepEqual(item.errors, {
          a: ['expected `double`: "foo"'],
          b: ['expected `string`: 10'],
          c: ['expected `double`: "bar"']
        });
        done();
      });
  },

  'virtual': function(done) {
    var VirtualItem = Toji.type('VirtualItem', {
      name: Toji.ObjectId,
      hashedPassword: Toji.field({ type: String, 'protected': true })
    })
    .validates('password', function(val) {
      if (val && (val.length < 3))
        throw 'too short';
    })
    .beforeSave(function(obj) {
      if (obj.password)
        obj.hashedPassword = require('crypto')
          .createHash('sha1')
          .update(obj.password)
          .digest('hex');
    });

    var item = new VirtualItem({ name: 'me', password: '42' });
    Assert.ok(!item.isValid());
    Assert.deepEqual(item.errors, { password: ['too short'] });

    (new VirtualItem({ name: 'me', password: 'secret' }))
      .save(function(err, item) {
        Assert.ok(!err);

        Assert.deepEqual(item.dumpJSON(), {
          name: 'me',
          hashedPassword: { string: "e5e9fa1ba31ecd1ae84f75caaa474f3a663f05f4" }
        });

        Assert.deepEqual(item.json(), {
          name: 'me'
        });

        lookup();
      });

    function lookup() {
      VirtualItem.find('me', function(err, item) {
        Assert.ok(!err);

        Assert.deepEqual(item.dumpJSON(), {
          name: 'me',
          hashedPassword: { string: "e5e9fa1ba31ecd1ae84f75caaa474f3a663f05f4" }
        });

        Assert.deepEqual(item.json(), {
          name: 'me'
        });

        done();
      });
    }
  }

};