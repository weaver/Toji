var Assert = require('assert'),
    Type = require('../../lib/avro/type'),
    Schema = require('../../lib/avro/schema');

Schema.createType({ name: 'A', type: 'record' }, A);
function A() {}

Schema.createType(A, { name: 'B', type: 'record' }, B);
function B() {}

module.exports = {
  'a type': function() {
    Assert.ok(Type.isType(A));

    Assert.equal(Type.name(A), 'A');

    Assert.ok(Type.isSubclass(A, A));
    Assert.ok(Type.isSubclass(B, A));
    Assert.ok(!Type.isSubclass(A, B));
  },

  'of': function() {
    Assert.equal(Type.of(null), null);
    Assert.equal(Type.of(new A()), A);
  }
};
