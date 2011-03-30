#include <v8.h>
#include <node.h>
#include <kcpolydb.h>

using namespace std;
using namespace node;
using namespace v8;
using namespace kyotocabinet;

#define SET_CLASS_CONSTANT(target, cls, name)				\
  (target)->Set(String::NewSymbol(#name),				\
                Integer::New(cls::name),				\
                static_cast<PropertyAttribute>(ReadOnly|DontDelete))	\

#define THROW_BAD_ARGS							\
  ThrowException(Exception::TypeError(String::New("Bad argument")))	\

#define LNULL								\
  Local<Value>::New(Null())						\

#define WRAP_STRING(str)                                                \
  String::New(str.c_str(), str.length());                               \

#define V8_TO_BOOL(obj)                                                 \
  (obj->ToBoolean() == v8::True())                                      \

#define DEFINE_FUNC(Name, Request)					\
  static Handle<Value> Name(const Arguments& args) {			\
    HandleScope scope;							\
									\
    if (!Request::validate(args)) {					\
      return THROW_BAD_ARGS;						\
    }									\
									\
    Request* req = new Request(args);					\
									\
    eio_custom(EIO_Exec##Name, EIO_PRI_DEFAULT, EIO_After##Name, req);	\
    ev_ref(EV_DEFAULT_UC);						\
									\
    return args.This();							\
  }									\

#define DEFINE_EXEC(Name, Request)					\
  static int EIO_Exec##Name(eio_req *ereq) {				\
    Request* req = static_cast<Request *>(ereq->data);			\
    return req->exec();							\
  }									\

#define DEFINE_AFTER(Name, Request)					\
  static int EIO_After##Name(eio_req *ereq) {				\
    HandleScope scope;							\
    Request* req = static_cast<Request *>(ereq->data);			\
    ev_unref(EV_DEFAULT_UC);						\
    int result = req->after();						\
    delete req;								\
    return result;							\
  }									\

#define DEFINE_METHOD(Name, Request)					\
  DEFINE_FUNC(Name, Request)						\
  DEFINE_EXEC(Name, Request)						\
  DEFINE_AFTER(Name, Request)

class PolyDBWrap: ObjectWrap {
private:
  PolyDB* db;

public:

  // ## Initialization ##

  static Persistent<FunctionTemplate> ctor;

  static void Init(Handle<Object> target) {
    HandleScope scope;

    Local<FunctionTemplate> tmpl = FunctionTemplate::New(New);

    ctor = Persistent<FunctionTemplate>::New(tmpl);
    ctor->InstanceTemplate()->SetInternalFieldCount(1);
    ctor->SetClassName(String::NewSymbol("PolyDB"));

    SET_CLASS_CONSTANT(ctor, PolyDB, OREADER);
    SET_CLASS_CONSTANT(ctor, PolyDB, OWRITER);
    SET_CLASS_CONSTANT(ctor, PolyDB, OCREATE);
    SET_CLASS_CONSTANT(ctor, PolyDB, OTRUNCATE);
    SET_CLASS_CONSTANT(ctor, PolyDB, OAUTOTRAN);
    SET_CLASS_CONSTANT(ctor, PolyDB, OAUTOSYNC);
    SET_CLASS_CONSTANT(ctor, PolyDB, ONOLOCK);
    SET_CLASS_CONSTANT(ctor, PolyDB, OTRYLOCK);
    SET_CLASS_CONSTANT(ctor, PolyDB, ONOREPAIR);

    SET_CLASS_CONSTANT(ctor, PolyDB::Error, SUCCESS);
    SET_CLASS_CONSTANT(ctor, PolyDB::Error, NOIMPL);
    SET_CLASS_CONSTANT(ctor, PolyDB::Error, INVALID);
    SET_CLASS_CONSTANT(ctor, PolyDB::Error, NOREPOS);
    SET_CLASS_CONSTANT(ctor, PolyDB::Error, NOPERM);
    SET_CLASS_CONSTANT(ctor, PolyDB::Error, BROKEN);
    SET_CLASS_CONSTANT(ctor, PolyDB::Error, DUPREC);
    SET_CLASS_CONSTANT(ctor, PolyDB::Error, NOREC);
    SET_CLASS_CONSTANT(ctor, PolyDB::Error, LOGIC);
    SET_CLASS_CONSTANT(ctor, PolyDB::Error, SYSTEM);
    SET_CLASS_CONSTANT(ctor, PolyDB::Error, MISC);

    NODE_SET_PROTOTYPE_METHOD(ctor, "open", Open);
    NODE_SET_PROTOTYPE_METHOD(ctor, "close", Close);
    NODE_SET_PROTOTYPE_METHOD(ctor, "closeSync", CloseSync);
    NODE_SET_PROTOTYPE_METHOD(ctor, "set", Set);
    NODE_SET_PROTOTYPE_METHOD(ctor, "add", Add);
    NODE_SET_PROTOTYPE_METHOD(ctor, "replace", Replace);
    NODE_SET_PROTOTYPE_METHOD(ctor, "get", Get);
    NODE_SET_PROTOTYPE_METHOD(ctor, "remove", Remove);
    NODE_SET_PROTOTYPE_METHOD(ctor, "synchronize", Synchronize);

    target->Set(String::NewSymbol("PolyDB"), ctor->GetFunction());
  }

  // ## Construction ##

  PolyDBWrap()  {
    db = new PolyDB();
  }

  ~PolyDBWrap() {
    delete db;
  }

  static Handle<Value> New(const Arguments& args) {
    HandleScope scope;
    PolyDBWrap* wrap = new PolyDBWrap();
    wrap->Wrap(args.This());
    return args.This();
  }

  
  // ## Helpers ##

  DB::Cursor* cursor() {
    return db->cursor();
  }

  
  // ## Async Glue ##

  class Request {
  private:
    Persistent<String> code_symbol;

  protected:
    PolyDBWrap* wrap;
    Persistent<Function> next;
    PolyDB::Error::Code result;

  public:
    Request(const Arguments& args, int nextIndex):
      result(PolyDB::Error::SUCCESS) {
      HandleScope scope;

      wrap = ObjectWrap::Unwrap<PolyDBWrap>(args.This());
      next = Persistent<Function>::New(Handle<Function>::Cast(args[nextIndex]));

      wrap->Ref();
    }

    ~Request() {
      wrap->Unref();
      next.Dispose();
    }

    inline void callback(int argc, Handle<Value> argv[]) {
      TryCatch try_catch;
      next->Call(Context::GetCurrent()->Global(), argc, argv);
      if (try_catch.HasCaught()) {
	FatalException(try_catch);
      }
    }

    Local<Value> error() {
      if (result == PolyDB::Error::SUCCESS)
	return LNULL;

      const char* name = PolyDB::Error::codename(result);
      Local<String> message = String::NewSymbol(name);
      Local<Value> err = Exception::Error(message);

      if (code_symbol.IsEmpty()) {
	code_symbol = NODE_PSYMBOL("code");
      }

      Local<Object> obj = err->ToObject();
      obj->Set(code_symbol, Integer::New(result));

      return err;
    }
  };

  
  // ### Open ###

  DEFINE_METHOD(Open, OpenRequest)
  class OpenRequest: public Request {
  private:
    String::Utf8Value path;
    uint32_t mode;

  public:
    inline static bool validate(const Arguments& args) {
      return (args.Length() >= 3
	      && args[0]->IsString()
	      && args[1]->IsUint32()
	      && args[2]->IsFunction());
    }

    OpenRequest(const Arguments& args):
      Request(args, 2),
      path(args[0]->ToString()),
      mode(args[1]->Uint32Value())
    {}

    inline int exec() {
      PolyDB* db = wrap->db;
      if (!db->open(*path, mode)) result = db->error().code();
      return 0;
    }

    inline int after() {
      Local<Value> argv[1] = { error() };
      callback(1, argv);
      return 0;
    }
  };

  
  // ### Close ###

  DEFINE_METHOD(Close, CloseRequest)
  class CloseRequest: public Request {
  public:

    inline static bool validate(const Arguments& args) {
      return (args.Length() >= 1 && args[0]->IsFunction());
    }

    CloseRequest(const Arguments& args):
      Request(args, 0)
    {}

    inline int exec() {
      PolyDB* db = wrap->db;
      if (!db->close()) result = db->error().code();
      return 0;
    }

    inline int after() {
      Local<Value> argv[1] = { error() };
      callback(1, argv);
      return 0;
    }
  };

  static Handle<Value> CloseSync(const Arguments& args) {
    HandleScope scope;

    PolyDBWrap* wrap = ObjectWrap::Unwrap<PolyDBWrap>(args.This());
    PolyDB* db = wrap->db;

    return Boolean::New(db->close());
  }

  
  // ### Set ###

  DEFINE_METHOD(Set, SetRequest)
  class SetRequest: public Request {
  protected:
    String::Utf8Value key;
    String::Utf8Value value;

  public:
    inline static bool validate(const Arguments& args) {
      return (args.Length() >= 3
	      && args[0]->IsString()
	      && args[1]->IsString()
	      && args[2]->IsFunction());
    }

    SetRequest(const Arguments& args):
      Request(args, 2),
      key(args[0]->ToString()),
      value(args[1]->ToString())
    {}

    inline int exec() {
      PolyDB* db = wrap->db;
      if (!db->set(*key, key.length(), *value, value.length())) {
	result = db->error().code();
      }
      return 0;
    }

    inline int after() {
      Local<Value> argv[1] = { error() };
      callback(1, argv);
      return 0;
    }
  };

  
  // ### Add ###

  DEFINE_METHOD(Add, AddRequest)
  class AddRequest: public SetRequest {
  public:
    AddRequest(const Arguments& args) :
      SetRequest(args)
    {}

    inline int exec() {
      PolyDB* db = wrap->db;
      if (!db->add(*key, key.length(), *value, value.length())) {
	result = db->error().code();
      }
      return 0;
    }
  };

  
  // ### Replace ###

  DEFINE_METHOD(Replace, ReplaceRequest)
  class ReplaceRequest: public SetRequest {
  public:
    ReplaceRequest(const Arguments& args) :
      SetRequest(args)
    {}

    inline int exec() {
      PolyDB* db = wrap->db;
      if (!db->replace(*key, key.length(), *value, value.length())) {
	result = db->error().code();
      }
      return 0;
    }
  };

  
  // ### Get ###

  DEFINE_METHOD(Get, GetRequest)
  class GetRequest: public Request {
  protected:
    String::Utf8Value key;
    char *vbuf;
    size_t vsiz;

  public:
    inline static bool validate(const Arguments& args) {
      return (args.Length() >= 2
	      && args[0]->IsString()
	      && args[1]->IsFunction());
    }

    GetRequest(const Arguments& args):
      Request(args, 1),
      key(args[0]->ToString())
    {}

    ~GetRequest() {
      if (vbuf) delete[] vbuf;
    }

    inline int exec() {
      PolyDB* db = wrap->db;
      vbuf = db->get(*key, key.length(), &vsiz);
      if (!vbuf) result = db->error().code();
      return 0;
    }

    inline int after() {
      int argc = 1;
      Local<Value> argv[2];

      argv[0] = error();
      if (vbuf) argv[argc++] = String::New(vbuf, vsiz);

      callback(argc, argv);
      return 0;
    }
  };

  
  // ### Remove ###

  DEFINE_METHOD(Remove, RemoveRequest)
  class RemoveRequest: public Request {
  protected:
    String::Utf8Value key;

  public:
    inline static bool validate(const Arguments& args) {
      return (args.Length() >= 1
	      && args[0]->IsString());
    }

    RemoveRequest(const Arguments& args):
      Request(args, 1),
      key(args[0]->ToString())
    {}

    inline int exec() {
      PolyDB* db = wrap->db;
      if (!db->remove(*key, key.length())) {
	result = db->error().code();
      }
      return 0;
    }

    inline int after() {
      Local<Value> argv[1] = { error() };
      callback(1, argv);
      return 0;
    }
  };

  
  // ### Synchronize ###

  DEFINE_METHOD(Synchronize, SynchronizeRequest)
  class SynchronizeRequest: public Request {
  protected:
    bool hard;

  public:
    inline static bool validate(const Arguments& args) {
      return (args.Length() >= 1
	      && args[0]->IsBoolean());
    }

    SynchronizeRequest(const Arguments& args):
      Request(args, 1),
      hard(args[0]->ToBoolean() == v8::True())
    {}

    inline int exec() {
      PolyDB* db = wrap->db;
      if (!db->synchronize(hard)) {
	result = db->error().code();
      }
      return 0;
    }

    inline int after() {
      Local<Value> argv[1] = { error() };
      callback(1, argv);
      return 0;
    }
  };

};


// # Cursor #

#define CURSOR_ERROR(cursor)                                            \
  static_cast<PolyDB *>(cursor->db())->error().code()                   \

class CursorWrap: ObjectWrap {
private:
  DB::Cursor* cursor;

public:

  // ## Initialization ##

  static Persistent<FunctionTemplate> ctor;

  static void Init(Handle<Object> target) {
    HandleScope scope;

    Local<FunctionTemplate> tmpl = FunctionTemplate::New(New);

    ctor = Persistent<FunctionTemplate>::New(tmpl);
    ctor->InstanceTemplate()->SetInternalFieldCount(1);
    ctor->SetClassName(String::NewSymbol("Cursor"));

    NODE_SET_PROTOTYPE_METHOD(ctor, "get", Get);
    NODE_SET_PROTOTYPE_METHOD(ctor, "getKey", GetKey);
    NODE_SET_PROTOTYPE_METHOD(ctor, "getValue", GetValue);
    NODE_SET_PROTOTYPE_METHOD(ctor, "jump", Jump);
    NODE_SET_PROTOTYPE_METHOD(ctor, "jumpTo", JumpTo);
    NODE_SET_PROTOTYPE_METHOD(ctor, "jumpBack", JumpBack);
    NODE_SET_PROTOTYPE_METHOD(ctor, "jumpBackTo", JumpBackTo);
    NODE_SET_PROTOTYPE_METHOD(ctor, "step", Step);
    NODE_SET_PROTOTYPE_METHOD(ctor, "stepBack", StepBack);

    target->Set(String::NewSymbol("Cursor"), ctor->GetFunction());
  }

  // ## Construction ##

  CursorWrap(DB::Cursor* cur):
    cursor(cur)
  {}

  ~CursorWrap() {
    delete cursor;
  }

  static Handle<Value> New(const Arguments& args) {
    HandleScope scope;

    if (args.Length() < 1 && args[0]->IsObject()) return THROW_BAD_ARGS;

    PolyDBWrap* dbWrap = ObjectWrap::Unwrap<PolyDBWrap>(args[0]->ToObject());
    CursorWrap* cursorWrap = new CursorWrap(dbWrap->cursor());
    cursorWrap->Wrap(args.This());
    return args.This();
  }

  
  // ## Async Glue ##

  class Request {
  private:
    Persistent<String> code_symbol;

  protected:
    CursorWrap* wrap;
    Persistent<Function> next;
    PolyDB::Error::Code result;

  public:
    Request(const Arguments& args, int nextIndex):
      result(PolyDB::Error::SUCCESS) {
      HandleScope scope;

      wrap = ObjectWrap::Unwrap<CursorWrap>(args.This());
      next = Persistent<Function>::New(Handle<Function>::Cast(args[nextIndex]));

      wrap->Ref();
    }

    ~Request() {
      wrap->Unref();
      next.Dispose();
    }

    inline void callback(int argc, Handle<Value> argv[]) {
      TryCatch try_catch;
      next->Call(Context::GetCurrent()->Global(), argc, argv);
      if (try_catch.HasCaught()) {
	FatalException(try_catch);
      }
    }

    Local<Value> error() {
      if (result == PolyDB::Error::SUCCESS)
	return LNULL;

      const char* name = PolyDB::Error::codename(result);
      Local<String> message = String::NewSymbol(name);
      Local<Value> err = Exception::Error(message);

      if (code_symbol.IsEmpty()) {
	code_symbol = NODE_PSYMBOL("code");
      }

      Local<Object> obj = err->ToObject();
      obj->Set(code_symbol, Integer::New(result));

      return err;
    }
  };

  
  // ### Get ###

  DEFINE_METHOD(Get, GetRequest)
  class GetRequest: public Request {
  private:
    bool step;
    std::string key, value;

  public:

    inline static bool validate(const Arguments& args) {
      return (args.Length() >= 2
	      && args[0]->IsBoolean()
	      && args[1]->IsFunction());
    }

    GetRequest(const Arguments& args):
      Request(args, 1),
      step(V8_TO_BOOL(args[0]))
    {}

    inline int exec() {
      DB::Cursor* cursor = wrap->cursor;
      if (!cursor->get(&key, &value, step)) {
	result = CURSOR_ERROR(cursor);
      }
      return 0;
    }

    inline int after() {
      int argc;
      Local<Value> argv[3];

      if (result == PolyDB::Error::SUCCESS) {
  	argc = 3;
  	argv[0] = LNULL;
  	argv[1] = WRAP_STRING(value);
  	argv[2] = WRAP_STRING(key);
      }
      else {
  	argc = 1;
  	argv[0] = (result == PolyDB::Error::NOREC) ? LNULL : error();
      }

      callback(argc, argv);
      return 0;
    }
  };

  
  // ### Get Key ###

  DEFINE_METHOD(GetKey, GetKeyRequest)
  class GetKeyRequest: public Request {
  protected:
    bool step;
    std::string value;

  public:

    inline static bool validate(const Arguments& args) {
      return (args.Length() >= 2
	      && args[0]->IsBoolean()
	      && args[1]->IsFunction());
    }

    GetKeyRequest(const Arguments& args):
      Request(args, 1),
      step(V8_TO_BOOL(args[0]))
    {}

    inline int exec() {
      DB::Cursor* cursor = wrap->cursor;
      if (!cursor->get_key(&value, step)) {
	result = CURSOR_ERROR(cursor);
      }
      return 0;
    }

    inline int after() {
      int argc;
      Local<Value> argv[2];

      if (result == PolyDB::Error::SUCCESS) {
  	argc = 2;
  	argv[0] = LNULL;
  	argv[1] = WRAP_STRING(value);
      }
      else {
  	argc = 1;
  	argv[0] = (result == PolyDB::Error::NOREC) ? LNULL : error();
      }

      callback(argc, argv);
      return 0;
    }
  };

  
  // ### Get ###

  DEFINE_METHOD(GetValue, GetValueRequest)
  class GetValueRequest: public GetKeyRequest {
  public:
    GetValueRequest(const Arguments& args):
      GetKeyRequest(args)
    {}

    inline int exec() {
      DB::Cursor* cursor = wrap->cursor;
      if (!cursor->get_value(&value, step)) {
	result = CURSOR_ERROR(cursor);
      }
      return 0;
    }
  };

  
  // ### Jump ###

  DEFINE_METHOD(Jump, JumpRequest)
  class JumpRequest: public Request {

  public:

    inline static bool validate(const Arguments& args) {
      return (args.Length() >= 1 && args[0]->IsFunction());
    }

    JumpRequest(const Arguments& args):
      Request(args, 0)
    {}

    inline int exec() {
      DB::Cursor* cursor = wrap->cursor;
      if (!cursor->jump()) {
	result = CURSOR_ERROR(cursor);
      }
      return 0;
    }

    inline int after() {
      Local<Value> argv[1] = { error() };
      callback(1, argv);
      return 0;
    }
  };

  DEFINE_METHOD(JumpTo, JumpToRequest)
  class JumpToRequest: public Request {
  protected:
    String::Utf8Value key;

  public:

    inline static bool validate(const Arguments& args) {
      return (args.Length() >= 2
	      && args[0]->IsString()
	      && args[1]->IsFunction());
    }

    JumpToRequest(const Arguments& args):
      Request(args, 1),
      key(args[0]->ToString())
    {}

    inline int exec() {
      DB::Cursor* cursor = wrap->cursor;
      if (!cursor->jump(*key, key.length())) {
	result = CURSOR_ERROR(cursor);
      }
      return 0;
    }

    inline int after() {
      Local<Value> argv[1] = { error() };
      callback(1, argv);
      return 0;
    }
  };

  
  // ### Jump Back ###

  DEFINE_METHOD(JumpBack, JumpBackRequest)
  class JumpBackRequest: public JumpRequest {

  public:

    JumpBackRequest(const Arguments& args):
      JumpRequest(args)
    {}

    inline int exec() {
      DB::Cursor* cursor = wrap->cursor;
      if (!cursor->jump_back()) {
	result = CURSOR_ERROR(cursor);
      }
      return 0;
    }
  };

  DEFINE_METHOD(JumpBackTo, JumpBackToRequest)
  class JumpBackToRequest: public JumpToRequest {

  public:

    JumpBackToRequest(const Arguments& args):
      JumpToRequest(args)
    {}

    inline int exec() {
      DB::Cursor* cursor = wrap->cursor;
      if (!cursor->jump_back(*key, key.length())) {
	result = CURSOR_ERROR(cursor);
      }
      return 0;
    }
  };

  
  // ### Step ###

  DEFINE_METHOD(Step, StepRequest)
  class StepRequest: public JumpRequest {

  public:

    StepRequest(const Arguments& args):
      JumpRequest(args)
    {}

    inline int exec() {
      DB::Cursor* cursor = wrap->cursor;
      if (!cursor->step()) {
	result = CURSOR_ERROR(cursor);
      }
      return 0;
    }
  };

  
  // ### Step Back ###

  DEFINE_METHOD(StepBack, StepBackRequest)
  class StepBackRequest: public JumpRequest {

  public:

    StepBackRequest(const Arguments& args):
      JumpRequest(args)
    {}

    inline int exec() {
      DB::Cursor* cursor = wrap->cursor;
      if (!cursor->step_back()) {
	result = CURSOR_ERROR(cursor);
      }
      return 0;
    }
  };

};


// ## Init ##

Persistent<FunctionTemplate> PolyDBWrap::ctor;
Persistent<FunctionTemplate> CursorWrap::ctor;

extern "C" {
  static void init (Handle<Object> target) {
    PolyDBWrap::Init(target);
    CursorWrap::Init(target);
  }

  NODE_MODULE(_kyoto, init);
}
