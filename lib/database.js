var Avro = require('./avro'),
    U = require('./util');

exports.DB = DB;

function DB() {
}

DB.prototype.type = function(name, fields) {
  return type(name, fields);
};

DB.prototype.load = Avro.load;
DB.prototype.dump = Avro.dump;


// ## Fields ##

function parseFields(recName, fields) {
  var result = [],
      type;

  for (var name in fields) {
    type = parseType(recName + '.' + name, fields[name]);
    result.push({ name: name, type: type });
  }

  return result;
}

function parseType(name, field) {
  if (typeof field == 'function')
    field = typeName(field);

  if (!field)
    throw new Error('empty field');
  else if (field instanceof Array)
    return { type: 'array', items: parseType(name, field[0]) };
  else if (typeof field == 'string')
    return field;
  else if (typeof field == 'object' && field.constructor === Object) {
    return type(name, field).__name__;
  }


  throw new Error('Bad field spec: ' + JSON.stringify(field));
};

var ALIAS = { 'String': 'string', 'Number': 'double', 'Boolean': 'boolean' };

function typeName(fn) {
  var name = fn.__name__ || U.functionName(fn);
  return ALIAS[name] || name;
}


// ## Types ##

function type(name, fields) {
  return Avro.type({
    type: 'record',
    name: name,
    fields: parseFields(name, fields)
  });
}

var DateType = type('Date', {
  value: String
});

DateType.isValid = function(data) {
  return (
    (typeof data == 'string')
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