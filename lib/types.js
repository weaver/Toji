var Avro = require('./avro');

exports.DateType = DateType;


// ## Builtin Types ##

var DateType = Avro.type({
  type: 'record',
  name: 'Date',
  fields: [{ type: 'string', name: 'value' }]
});

DateType.isValid = function(data) {
  return (
    (typeof data == 'string')
    || (typeof data == 'number')
    || (data instanceof Date)
    || (typeof data.value == 'string')
  );
};

DateType.load = function(data) {
  this.assertValid(data);
  return (data instanceof Date) ? data : new Date(data.value || data);
};

DateType.dump = function(obj) {
  this.assertValid(obj);
  return (obj instanceof Date) ? obj.toString() : (obj.value || obj);
};
