var Avro = require('./avro');

exports.DateType = DateType;


// ## Builtin Types ##

var DateType = Avro.type({
  type: 'record',
  name: 'Date',
  fields: [{ type: 'string', name: 'value' }]
});

DateType.extend({
  __isinstance__: function(obj) {
    return (obj instanceof Date) || (obj instanceof DateType);
  },

  isValid: function(data) {
    return (
      (typeof data == 'string')
      || (typeof data == 'number')
      || (data instanceof Date)
      || (typeof data.value == 'string')
    );
  },

  validate: function(obj) {
    return this.assertValid(obj);
  },

  loadJSON: function(obj) {
    this.assertValid(obj);
    return (obj instanceof Date) ? obj : new Date(obj.value || obj);
  },

  dumpJSON: function(obj) {
    this.assertValid(obj);
    return (obj instanceof Date) ? obj.toUTCString() : (obj.value || obj);
  },

  exportJSON: function(obj) {
    return this.dumpJSON(obj);
  }
});

