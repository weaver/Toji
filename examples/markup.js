var Toji = require('../lib/');

Toji.type('Mark', {
 kind: String,
 guid: String,
 color: [ Number ],
 size: Number,
 offset: { x: Number, y: Number },
 bounds: { a: { x: Number, y: Number }, b: { x: Number, y: Number } },
 points: [ [ Number ] ],
 path: [ { type: String, points: [ Number ] } ],
 text: String
});