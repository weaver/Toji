var Avro = require('./avro'),
    Storage = require('./storage'),
    U = require('./util');

exports.Model = Model;
exports.type = type;

// ## Model ##

U.inherits(Model, Avro.RecordType);
function Model() {
  Avro.RecordType.apply(this, arguments);
}

Model.find = function(next) {
  var query = Storage.open().find(this);
  return next ? query.all(next) : query;
};

Model.prototype.json = function() {
  return this.constructor.dump(this);
};

Model.prototype.save = function(next) {
  Storage.open().save(this, next);
  return this;
};

Model.prototype.remove = function(next) {
  Storage.open().remove(this, next);
  return this;
};



// ## Types ##

Avro.alias('String', 'string');
Avro.alias('Boolean', 'boolean');
Avro.alias('Number', 'double');

function type(name, fields) {
  fields = parseFields(name, fields);
  fields.unshift({ name: 'id', type: 'string' });
  return Avro.type(Model, {
    type: 'record',
    name: name,
    fields: fields
  });
}

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
    field = Avro.typeName(field);

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

