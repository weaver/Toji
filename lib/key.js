var Avro = require('./avro'),
    Type = require('./avro/type'),
    U = require('./util');

exports.ObjectId = ObjectId;

var Key = exports.Key = Type.create({
  __init__: function Key(kind, id) {
    this.kind = kind;
    this.id = id;
  },

  toString: function() {
    return this.kind + '/' + this.id;
  },

  type: function() {
    if (!this._type)
      this._type = Avro.type(this.kind);
    return this._type;
  }
})
.extend({
  make: function(type, id) {
    return (new Key(Avro.name(type), id));
  },

  parse: function(str) {
    var parts = str.toString().split('/');
    if (parts.length != 2)
      throw new Avro.ValueError('Badly formatted key', data);
    return new Key(parts[0], parts[1]);
  }
});

function ObjectId() {
  var buf = new Buffer(7);
  U.writeInt(Math.floor(Date.now() / 1000), buf, 0, 4);
  U.writeInt(Math.floor(Math.random() * 0x1000000), buf, 4, 3);
  return U.hex(buf);
}