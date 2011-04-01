var Assert = require('assert'),
    Type = require('./avro/type'),
    Schema = require('./avro/schema'),
    U = require('./util');

exports.IndexSet = IndexSet;

Type.create(IndexSet);
function IndexSet(type) {
  this.type = type;
  this.indicies = {};
}

// ### Index Management ###

IndexSet.include({
  add: function(index) {
    if (index.name in this.indicies)
      throw new Error('Duplicate index: ' + index.name);
    this.indicies[index.name] = index;
    return this;
  },

  unique: function(name) {
    return this.add(new Unique(this.type, name));
  }
});

// ### Values ###

IndexSet.include({
  calculate: function(obj, key) {
    Assert.ok(key, 'missing required key');

    var values = {};
    U.each(this.indicies, function(idx, key) {
      idx.calculate(obj, key, values);
    });

    return values;
  }
});


// ## Unique Index ##

Type.create(Unique);
function Unique(type, fieldName) {
  this.field = type.field(fieldName);
  if (!this.field)
    throw new Error('No field called `' + fieldName + '`.');

  this.name = '%' + this.field.fullName();

  if (!Schema.isPrimitive(type.schemaOf(fieldName).type)) {
    throw new Avro.InvalidField(this.field, 'only primitive types are indexable');
  }
}

Unique.include({
  key: function(obj) {
    var val = this.field.dumpJSONValue(obj);
    return this.name + '{' + val + '}';
  },

  calculate: function(obj, key, values) {
    values[this.key(obj)] = key;
  }
});