# Toji #

Toji is [Kyoto Cabinet][1] bindings for [Node.js][3] with an [Avro][4]
mapper.

## Installation ##

Toji depends on [Kyoto Cabinet][1]. Use a package manager or build
[from source][2].

    sudo pacman -S kyotocabinet      ## Arch Linux
    sudo port install kyotocabinet   ## Mac Ports
    sudo brew install kyoto-cabinet  ## Homebrew

Then, install with `npm`:

    npm install Toji

## Project Structure ##

Toji uses [Kyoto Cabinet][1] to store documents. Bindings are
implemented in `src/_kyoto.cc` and wrapped lightly with Javascript in
`lib/kyoto.js`.

Documents are stored in an [Avro][4] format. A partial Avro
implementation can be found in `lib/avro`. Most Avro details are
hidden by models (`lib/models.js`). Models allow schema to be defined
by declaring Javascript types and manage serialization details.

Documents storage is managed by `lib/storage.js`. The storage layer
exposes a query interface (`lib/query.js`) for retrieving
documents and uses model validation (`lib/validation.js`) to check
data integrity before saving it.

## Future Work ##

+ Indexes
+ Query optimizer
+ Replication
+ Binary Avro encoding
+ Complete Avro schema support

[1]: http://fallabs.com/kyotocabinet/
[2]: http://fallabs.com/kyotocabinet/pkg/
[3]: http://nodejs.org/
[4]: http://avro.apache.org/docs/current/spec.html

