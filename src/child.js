/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const BAMReader = require(__dirname + "/bamreader.js");
const { BAMIterator } = BAMReader;
const context = {
  LINE_SIZE : 11,
  crypto : require("crypto")
};

process.on("message", function(msg){
  BAMReader.parseSendable(msg, context);

  const reader = BAMReader.createFromObject(msg.reader);
  if (!msg.env) { msg.env = msg.$ || {}; }
  const { env } = msg;
  for (let k of ["start", "end", "n"]) { env[k] = msg[k]; }
  Object.defineProperty(env, "exit", {
    get() {
      env._exit_will_be_called = true;
      return function() {
        env.ended = true;
        process.send(env);
        return process.exit();
      };
    }
  }
  );

  const itr = BAMIterator.create(reader, msg);

  return itr.on_end = function($){
    if (typeof msg.on_end === "function") { msg.on_end.call(itr, $); }
    if (!$._exit_will_be_called) { return $.exit(); }
  };
});
