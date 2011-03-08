var Vows = require('vows'),
    Assert = require('assert'),
    Schema = require('../lib/avro/schema');

Vows.describe('Avro Schema')
  .addBatch({
    'An array schema': {
      topic: function() { return { type: 'array', items: 'string' }; },

      'has a name': function(topic) {
        Assert.equal(Schema.name(topic), 'array<string>');
      }
    }
  })
  .export(module);