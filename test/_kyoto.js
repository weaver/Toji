var Vows = require('vows'),
    Assert = require('assert'),
    Fs = require('fs'),
    Path = require('path'),
    PolyDB = require('../build/default/_kyoto').PolyDB;

Vows.describe('Kyoto Bindings')
  .addBatch(allMethods('HashDB', '.kch'))
  .export(module);

function allMethods(kind, ext) {
  var path = '/tmp/toji-test-kyoto' + ext,
      db = new PolyDB();

  function open() {
    db.open(path, PolyDB.OCREATE | PolyDB.OWRITER, this.callback);
  }

  try { Fs.unlinkSync(path); } catch (x) {}

  var tests = {};

  tests[kind + ': opening'] = {
    topic: open,

    'and closing': {
      topic: function(err) {
        Assert.ok(!err);
        db.close(this.callback);
      },

      'succeeds': function(err) {
        Assert.ok(!err);
      }
    }
  };

  tests[kind + ': setting'] = {
    topic: open,

    'succeeds': {
      topic: function(err) {
        Assert.ok(!err);
        db.set("alpha", "one", this.callback);
      },

      'and getting': {
        topic: function(err) {
          Assert.ok(!err);
          db.get("alpha", this.callback);
        },

        'succeeds': function(err, value) {
          console.log('done');
          Assert.ok(!err);
          Assert.equal(value, 'one');
        }
      }
    }
  };

  return tests;
}