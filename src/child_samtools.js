/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const BAMReader = require(__dirname + "/bamreader");
const { SAMTools } = BAMReader;

process.on("message", function(msg){
  BAMReader.parseSendable(msg);

  const reader = BAMReader.createFromObject(msg.reader);
  const env = msg.env || msg.$ || {};
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

  const options = {
    bam    : msg.on_bam,
    start  : msg.start,
    end    : msg.end,
    env
  };

  const samtools = new SAMTools(reader, options);
  return samtools.on_end = function($){
    if (typeof msg.on_end === "function") { msg.on_end.call(samtools, $); }
    if (!$._exit_will_be_called) { return $.exit(); }
  };
});
