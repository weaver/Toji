var Vows = require('vows'),
    Assert = require('assert'),
    Type = require('../lib/avro/type'),
    Schema = require('../lib/avro/schema');

var A = Schema.createType({ name: 'A', type: 'record' }),
    B = Schema.createType(A, { name: 'B', type: 'record' });

Vows.describe('Avro Types')
  .addBatch({
    'A type': {
      topic: function() { return A; },

      'is a type': function(topic) {
        Assert.ok(Type.isType(A));
      },

      'has a name': function(topic) {
        Assert.equal(Type.name(topic), 'A');
      },

      'is a subclass of itself': function(topic) {
        Assert.ok(Type.isSubclass(A, A));
      },

      'is not a subclass of its subclasses': function(topic) {
        Assert.ok(!Type.isSubclass(A, B));
      }
    },

    'A subclass': {
      topic: function() { return B; },

      'is a type': function(topic) {
        Assert.ok(Type.isType(A));
      },

      'has a name': function(topic) {
        Assert.equal(Type.name(topic), 'B');
      },

      'is a subclass of its superclass': function(topic) {
        Assert.ok(Type.isSubclass(B, A));
      }
    }
  })
  .export(module);