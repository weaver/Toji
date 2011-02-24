var Avro = require('./avro'),
    Storage = require('./storage'),
    Model = require('./model'),
    Types = require('./types'),
    Key = require('./key'),
    U = require('./util');

exports.open = Storage.open;
exports.close = Storage.close;
exports.type = Model.type;
exports.ObjectId = Key.ObjectId;