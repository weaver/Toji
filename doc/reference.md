# Toji Reference #

Toji is a data mapper that uses [Avro][1] to store documents with
[Kyoto Cabinet][2].

## Synopsis ##

This example demonstrates how to define a model, open a Toji database,
and store a document:

    var Toji = require('Toji');

    var Person = Toji.type('Person', {
      name: String,
      email: String
    });

    Toji.open('/tmp/demo', function(err) {
      if (err) throw err;

      var chuck = new Person({
        name: 'Chuck Norris',
	email: 'fan@chucknorris.com'
      });

      chuck.save(function(err) {
        if (err) throw err;
	console.log('Saved', chuck);
      });

    });

## Models ##

## Storage ##


[1]: http://avro.apache.org/docs/current/spec.html
[2]: http://fallabs.com/kyotocabinet/spex.html
