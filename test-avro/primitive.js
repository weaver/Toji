var Vows = require('vows'),
    Assert = require('assert'),
    Prim = require('../lib/avro/primitive').TYPES;

Vows.describe('Primitive Types')
  .addBatch({
    'A double': {
      topic: function() { return 1065; },

      'can loadJSON': function(topic) {
        Assert.equal(topic, Prim.double.loadJSON(topic));
      },

      'can dumpJSON': function(topic) {
        Assert.equal(topic, Prim.double.dumpJSON(topic));
      }
    }
  })
  .export(module);