exports.Query = Query;


// ## Query ##

function Query(store) {
  this.store = store;
  this.filter(function() { return true; });
}

Query.prototype.filter = function(fn) {
  var prev = this._filter;
  if (!this.prev)
    this._filter = fn;
  else
    this._filter = function() {
      return prev.apply(this, arguments) && fn.apply(this, arguments);
    };
  return this;
};

Query.prototype.then = function(done) {
  var result = [],
      filter = this._filter;

  this.store.each(finished, function(obj) {
    if (filter(obj))
      result.push(obj);
  });

  function finished(err) {
    err ? done(err) : done(null, result);
  }

  return this;
};

Query.prototype.get = function(done) {
  var filter = this._filter,
      found;

  this.store.each(finished, function(obj) {
    if (filter(obj)) {
      found = obj;
      this.stop();
    }
  });

  function finished(err) {
    done(err, found);
  }

  return this;
};

