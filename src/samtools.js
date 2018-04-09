/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const { BAM } = module.exports;
const cp = require("child_process");
const fs = require("fs");
class SAMTools {
  constructor(reader, o){
    this.reader = reader;
    if (typeof o === "function") { o = {on_bam: o}; }
    if (o.bam) { o.on_bam = o.bam; }
    if (typeof o.end === "function") {
      o.on_end = o.end;
      delete o.end;
    }
    if (typeof o.finish === "function") {
      o.on_finish = o.finish;
    }
    if (typeof o.on_finish === "function") {
      if (!o.on_end) { o.on_end = o.on_finish; }
    }

    this.on_bam = typeof o.on_bam === "function" ? o.on_bam  : function() {};
    if (typeof o.start === "number") { this.start = o.start; }
    if (typeof o.end   === "number") { this.end   = o.end; }
    this.on_end = typeof o.on_end === "function" ? o.on_end : function() {};
    this.env = o.env || o.$ || {}; // environment to register variables, especially for child processes
    process.nextTick(() => this.view());
  }

  view() {
    // 1. if "start" and "end" are given, pipe to stdin
    // 2. otherwise, spawn with file
    let samtools;
    if ((this.start != null) && (this.end != null)) {
      samtools = cp.spawn("samtools", ["view", "-"]);
      const header_chunk = new Buffer(this.reader.header_offset);
      fs.readSync(this.reader.fd, header_chunk, 0, this.reader.header_offset, 0);
      samtools.stdin.write(header_chunk); // send header
      const fstream = fs.createReadStream(this.reader.bamfile, {start: this.start, end: this.end}).pipe(samtools.stdin);
    } else {
      samtools = cp.spawn("samtools", ["view", this.reader.bamfile]);
    }

    const rstream = samtools.stdout;
    rstream.setEncoding("utf-8");
    let _r = "";
    rstream.on("readable", () => {
      const chunk = rstream.read();
      if (chunk === null) { return; }
      const sams = (_r + chunk).split("\n");
      _r = sams.pop();
      return (() => {
        const result = [];
        for (let sam of Array.from(sams)) {
          const bam = BAM.createFromSAM(sam, this.reader);
          result.push(this.on_bam(bam, this.env));
        }
        return result;
      })();
    });

    return rstream.on("end", () => {
      return this.on_end(this.env);
    });
  }
}

module.exports.SAMTools = SAMTools;

const BAMReader = module.exports;
BAMReader.prototype.samtools = function(o){
  if ((typeof o.num === "number") && (o.num >= 2)) {
    return this.fork_samtools(o);
  } else {
    return new SAMTools(this, o);
  }
};

BAMReader.prototype.fork_samtools = function(o){
  if (o == null) { o = {}; }
  if (typeof o === "function") { o = {on_bam : o}; }
  o.script = "child_samtools";
  return this.fork(o);
};
