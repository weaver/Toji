var Assert = require('assert'),
    Avro = require('./avro'),
    Type = require('./avro/type'),
    Model = require('./model'),
    U = require('./util'),
    Idx = require('./idx');


// ## Validation Interface ##

Model.Model.include({
  isValid: function(force) {
    if (force || (this.errors === undefined)) {
      U.setHidden(this, 'errors', {});
      Type.of(this).validateAll(this, this.errors);
    }
    return U.isEmpty(this.errors);
  },

  validate: function() {
    console.warn('Model#validate() is deprecated, use Model#isValid() instead.');
    return this.isValid() ? null : this.errors;
  }
});


// ## Validation Errors ##

exports.Invalid = Avro.Invalid;
exports.isValidationError = isValidationError;
exports.invalidMessage = invalidMessage;

function isValidationError(err) {
  return (typeof err == 'string')
    || (err.name == 'Invalid')
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

function firstErrorMessage(obj) {
  var key;

  if (obj.errors) {
    for (key in obj.errors)
      break;
  }

  return key && obj.errors[key][0];
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
        .validates(name, validator)
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

  // FIXME: avoid running non-custom validation twice.
  dumpValid: function(obj, creating) {
    if (obj.beforeValidation(creating).isValid(true))
      return Avro.dumpJSON(obj.beforeSave(creating));
    throw new Avro.Invalid(this, firstErrorMessage(obj), obj);
  }
});

Model.Model.include({
  dumpValid: function() {
    return Type.of(this).dumpValid(this);
  },

  beforeValidation: function(creating) {
    Type.of(this).emit('beforeValidation', this, creating);
    return this;
  },

  beforeSave: function(creating) {
    Type.of(this).emit('beforeSave', this, creating);
    return this;
  },

  afterSave: function(created) {
    Type.of(this).emit('afterSave', this, created);
    return this;
  },

  afterLoad: function() {
    Type.of(this).emit('afterLoad', this);
    return this;
  },

  beforeRemove: function() {
    Type.of(this).emit('beforeRemove', this);
    return this;
  }
});


// ## Validation Definition Infrastructure ##

Model.Model.extend({
  validates: function(names, fn) {
    var hooks = this.validationHooks;

    if (U.isFunction(names))
      pushInto(hooks, '', names);
    else
      this.validatesEach(names, function(name) {
        pushInto(hooks, name, fn);
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
        for (i = 0, l = hooks.length; i < l; i++)
          fn.call(this, hooks[i]);
      }
      else if ((field = this.field(name))) {
        for (i = 0, l = hooks.length; i < l; i++)
          fn.call(this, hooks[i], field);
      }
      else
        throw new Type.ValueError('Field does not exist.', name);
    }

    return this;
  }
});


// ## Validation Execution ##

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

function pushInto(obj, key, value) {
  if (!obj[key])
    obj[key] = [];
  obj[key].push(value);
  return obj;
}
