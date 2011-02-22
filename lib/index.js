var Avro = require('./avro'),
    Storage = require('./storage'),
    Model = require('./model'),
    Types = require('./types'),
    U = require('./util');

exports.open = Storage.open;
exports.type = Model.type;