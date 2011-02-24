var Assert = require('assert'),
    Avro = require('../lib/avro');

var Person = Avro.type({
  name: 'Person',
  type: 'record',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'email', type: 'string' }
  ]
});

var obj, data;

obj = { name: 'Douglas Crockford', email: 'douglas@crockford.com' };

console.log('As object:', new Person(obj));
console.log('Dumped:', data = Avro.dump(new Person(obj)));
console.log('Loaded:', Avro.load(Person, data));

var Related = Avro.type({
  name: 'Related',
  type: 'record',
  fields: [
    { name: 'title', type: 'string' },
    { name: 'words', type: {
      type: 'map', values: {
        type: 'array', items: 'string' }
      }
    }
  ]
});

obj = { title: 'synonyms', words: {
  'desk': ['counter', 'stand', 'bench'],
  'bench': ['board', 'shelf', 'desk']
}};

console.log('From object:', new Related(obj));
console.log('Dumped:', data = Avro.dump(new Related(obj)));
console.log('Loaded:', Avro.load(Related, data));
