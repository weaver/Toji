var Assert = require('assert'),
    Avro = require('./avro'),
    Type = require('./avro/type'),
    Model = require('./model'),
    Storage = require('./storage'),
    U = require('./util'),
    Idx = require('./idx');


// ## Validation Interface ##

Model.Model.include({
  isValid: function(force, store, next) {
    if (typeof force != 'boolean') {
      next = store; store = force; force = undefined;
    }
    if (typeof store == 'function') {
      next = store; store = this.defaultStore();
    }

    var doValidate = force || (this.errors === undefined);
    if (doValidate) {
      U.setHidden(this, 'errors', {});
    }

    if (!next) {
      if (doValidate)
        Type.of(this).validateAll(this, this.errors);
      return U.isEmpty(this.errors);
    }

    // Only validate against indicies if the object is already in an
    // error state. Otherwise, it's just extra overhead. Also,
    // validating now is no guarantee that an operation will succeed
    // at save-time since the database state can change between
    // validation-time and save-time.

    if (doValidate) {
      try {
        Type.of(this).validateAll(this, this.errors);
      } catch (x) {
        console.log('borked', x, this.errors);
        return next(x);
      }
    }

    var valid = U.isEmpty(this.errors);
    if (!doValidate || valid) {
      return next(null, valid, this);
    }

    // Go ahead an run index validation. The object is in an error
    // state anyway, so it's worthwhile to add any errors that may
    // have occured related to indicies.
    var self = this;
    return store.validateIndex(self, function(err) {
      next(err, U.isEmpty(self.errors), self);
    });
  },

  validate: function() {
    console.warn('Model#validate() is deprecated, use Model#isValid() instead.');
    return this.isValid() ? null : this.errors;
  }
});


// ## Validation Errors ##

exports.Invalid = Avro.Invalid;
exports.InvalidField = Avro.InvalidField;
exports.isValidationError = isValidationError;
exports.invalidMessage = invalidMessage;

function isValidationError(err) {
  return (typeof err == 'string')
    || (err.name == 'Invalid')
    || (err.name == 'InvalidField')
    || (err.name == 'AssertionError');
}

function invalidMessage(err) {
  if (typeof err == 'string')
    return err;
  else if (err.name == 'Invalid')
    return err.reason || err.message;
  else if (err.name == 'AssertionError')
    return err.message.toString();
  throw new Type.ValueError('cannot find invalid message for', err);
}

function firstErrorKey(obj) {
  var key;

  if (obj.errors) {
    for (key in obj.errors)
      break;
  }

  return key;
}


// ## Validators ##

// Create validator methods that use `assert` to test values. When
// these validators are installed, the fields are no longer nullable.
function withoutNull(assert) {
  return function (names, message) {
    var validator = !message ? assert : function(val, field, obj) {
      return assert(val, field, obj, message);
    };

    return this.validatesEach(names, function(name) {
      this
        .validates(name, assert.name, validator)
        .modifyField(name, function(field) {
          if (Type.isSubclass(field.type, Avro.UnionType))
            field.changeType(field.type.without(null));
        });
    });
  };
}

function validateNotNull(val, field, obj, message) {
  Assert.ok(!U.isNullish(val), message || 'expected non-null value');
}

function validateNotEmpty(val, field, obj, message) {
  Assert.ok(!U.isEmpty(val), message || 'expected non-empty value');
}

Model.Model.extend({
  validatesNotEmpty: withoutNull(validateNotEmpty),

  validatesNotNull: withoutNull(validateNotNull),

  validatesPresenceOf: function() {
    console.warn('#validatesPresenceOf is deprecated, use #validatesNotEmpty or #validatesNotNull');
    return this.validatesNotEmpty.apply(this, arguments);
  },

  validatesUniquenessOf: function(names, message, derive) {
    var self = this;

    return this
      .validatesEach(names, function(name) {
        self.addUniqueIndex(name, message, derive);
      });
  }
});


// ## Indexes ##

Model.Model.extend({
  getIndex: function(name) {
    return this.indicies.get(name);
  },

  addIndex: function(name, message, derive) {
    this.indicies.addIndex(name, message, derive);
    return this;
  },

  addUniqueIndex: function(name, message, derive) {
    this.indicies.addUnique(name, message, derive);
    return this;
  }
});


// ## Validation / Model Integration ##

var compile = Model.Model.compile;

Model.Model.extend({
  compile: function(reg, type) {
    compile.call(this, reg, type);
    this.validationHooks = {};
    this.indicies = new Idx.IndexSet(this);
    return type;
  },

  calculateIndex: function(obj, key) {
    return this.indicies.calculate(obj, key);
  },

  addIndexErrors: function(invalid, obj) {
    return this.indicies.addErrors(invalid, obj);
  },

  firstError: function(obj) {
    var key = firstErrorKey(obj);
    if (key === undefined)
      return undefined;

    var field = this.field(key),
        message = obj.errors[key][0];

    if (field)
      return new Avro.InvalidField(field, message);
    else
      return new Avro.InvalidField(this, message, obj);
  },

  // FIXME: avoid running non-custom validation twice.
  dumpValid: function(store, obj, creating, done) {
    var self = this,
        error, data;

    obj.beforeValidation(creating, function(err) {
      err ? done(err) : validate();
    });

    function validate() {
      obj.isValid(true, store, function(err, valid) {
        if (err)
          done(err);
        else if (!valid)
          done(self.firstError(obj));
        else
          before();
      });
    }

    function before() {
      obj.beforeSave(creating, function(err) {
        err ? done(err) : dump();
      });
    }

    function dump() {
      try {
        data = Avro.dumpJSON(obj);
      } catch (x) {
        error = data;
      }

      done(error, data);
    }

    return this;
  }
});

Model.Model.include({
  dumpValid: function(store, creating, next) {
    return Type.of(this).dumpValid(store, this, creating, next);
  },

  beforeValidation: function(creating, next) {
    Type.of(this).emitAsync('beforeValidation', this, creating, next);
    return this;
  },

  beforeSave: function(creating, next) {
    Type.of(this).emitAsync('beforeSave', this, creating, next);
    return this;
  },

  afterSave: function(created, next) {
    Type.of(this).emitAsync('afterSave', this, created, next);
    return this;
  },

  afterLoad: function(next) {
    Type.of(this).emitAsync('afterLoad', this, next);
    return this;
  },

  beforeRemove: function(next) {
    Type.of(this).emitAsync('beforeRemove', this, next);
    return this;
  }
});


// ## Validation Definition Infrastructure ##

Model.Model.extend({
  validates: function(names, vkey, fn) {
    var hooks = this.validationHooks;

    if (typeof vkey === 'function') {
      fn = vkey;
      vkey = undefined;
    }

    if (U.isFunction(names))
      addInto(hooks, '', vkey, names);
    else
      this.validatesEach(names, function(name) {
        addInto(hooks, name, vkey, fn);
      });

    return this;
  },

  validatesEach: function(names, add) {
    var self = this;

    if (U.isArray(names))
      names.forEach(function(name) {
        if (!self.hasField(name))
          self.defineVirtual({ name: name, readable: false });
        add.call(self, name);
      });
    else {
      if (names && !this.hasField(names))
        self.defineVirtual({ name: names, readable: false });
      add.call(this, names || '');
    }

    return this;
  },

  eachValidationHook: function(fn) {
    var allHooks = this.validationHooks,
        i, l, field, hooks;

    for (var name in allHooks) {
      hooks = allHooks[name];
      if (!name) {
        for (i in hooks)
          fn.call(this, hooks[i]);
      }
      else if ((field = this.field(name))) {
        for (i in hooks)
          fn.call(this, hooks[i], field);
      }
      else
        throw new Type.ValueError('Field does not exist.', name);
    }

    return this;
  }
});


// ## Validation Execution ##

Model.Model.include({
  addValidationError: function(err, field) {
    pushInto(this.errors, field ? field.name : '', invalidMessage(err));
    return this;
  }
});

Model.Model.extend({
  assertValidationHooks: function(obj) {
    return this.validateEachHook(obj, function fail(err, field) {
      if (field)
        throw new Avro.InvalidField(field, invalidMessage(err));
      else
        throw new Avro.Invalid(Type.of(obj), invalidMessage(err), obj);
    });
  },

  validateAll: function(obj, errors) {
    if (this.validateSelf(obj, errors))
      this.validateFields(obj, this.validateHooks(obj, errors));
    return errors;
  },

  validateSelf: function(obj, errors) {
    try {
      this.assertValid(obj);
      return true;
    } catch (x) {
      if (!isValidationError(x))
        throw x;
      pushInto(errors, '', invalidMessage(x));
      return false;
    }
  },

  validateHooks: function(obj, errors) {
    this.validateEachHook(obj, function fail(err, field) {
      pushInto(errors, field ? field.name : '', invalidMessage(err));
    });
    return errors;
  },

  validateFields: function(obj, errors) {
    this.eachField(function(field) {
      try {
        if (!(field.name in errors))
          field.validate(obj);
      } catch (x) {
        if (isValidationError(x))
          pushInto(errors, field.name, invalidMessage(x));
        else
          throw x;
      }
    });

    return errors;
  },

  validateEachHook: function(obj, fail) {
    return this.eachValidationHook(function(hook, field) {
      try {
        if (field)
          hook.call(this, obj[field.name], field, obj);
        else
          hook.call(this, obj);
      } catch (x) {
        if (isValidationError(x))
          fail.call(this, x, field);
        else
          throw x;
      }
    });
  }
});


// ## Helpers ##

function pushInto(obj, key, value) {
  if (!obj[key])
    obj[key] = [];
  obj[key].push(value);
  return obj;
}

function addInto(obj, key, name, value) {
  if (!obj[key])
    obj[key] = [];

  if (!name)
    obj[key].push(value);
  else if (!(name in obj[key]))
    obj[key][name] = value;

  return obj;
}

function existsIn(obj, key, name) {
  return (key in obj) && (name in obj[key]);
}
