var Assert = require('assert'),
    Toji = require('../lib/index'),
    db;

var IndexData = Toji.type('IndexData', {
  letter: String,
  number: Number
})
.validatesUniquenessOf(['letter', 'number']);

module.exports = {
  'setup': function(done) {
    db = Toji.open('*memory*', function(err) {
      if (err) throw err;
      db.load(done, [
        new IndexData({ letter: 'alpha', number: 1 }),
        new IndexData({ letter: 'beta', number: 2 }),
        new IndexData({ letter: 'gamma', number: 3 })
      ]);
    });
  },

  'unique': function(done) {
    done();
  }

};