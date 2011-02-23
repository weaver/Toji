var Avro = require('./avro'),
    U = require('./util');

exports.ObjectId = ObjectId;


// ## Key ##

var Key = exports.Key = Avro.type({
  type: 'record',
  name: 'Key',
  fields: [
    { type: 'string', name: 'kind' },
    { type: 'string', name: 'id' }
  ]
});

Key.make = function(type) {
  return new Key({ kind: Avro.typeName(type), id: ObjectId() });
};

Key.isValid = function(data) {
  return ((typeof data == 'string') || (typeof data == 'object'));
};

Key.parse = function(str) {
  var parts = str.split('/');
  if (parts.length != 2)
    throw new Avro.Invalid('Badly formatted key: ' + Avro.show(data));
  return { kind: parts[0], id: parts[1] };
};

Key.load = function(data) {
  if (typeof data == 'string')
    data = this.parse(data);
  return Key.super_.load.call(this, data);
};

Key.dump = function(obj) {
  return obj.kind + '/' + obj.id;
};

function ObjectId() {
  var buf = new Buffer(7);
  U.writeInt(Math.floor(Date.now() / 1000), buf, 0, 4);
  U.writeInt(Math.floor(Math.random() * 0x1000000), buf, 4, 3);
  return U.hex(buf);
}