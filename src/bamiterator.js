/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const c = 0;
const fs = require("fs");
const inflateBGZF = require("bgzf").inflate;
const DEFAULT_PITCH = 16384000;
const { BAM } = module.exports;
const noop = function() {};

class BAMIterator {
  static create(reader, options){
    if (options == null) { options = {}; }
    return new BAMIterator(reader, options);
  }

  constructor(reader, o){
    this.reader = reader;
    if (o == null) { o = {}; }
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
    if (typeof o.bam === "function") {
      if (!o.on_bam) { o.on_bam = o.bam; }
    }

    this.nocache = this.reader.nocache || !!o.nocache;
    this.offset = typeof o.start === "number" ? o.start : this.reader.header_offset;
    this.end = typeof o.end === "number" ? o.end : this.reader.size;
    this.pitch = typeof o.pitch === "number" ? o.pitch : DEFAULT_PITCH;
    this.on_bam = typeof o.on_bam === "function" ? o.on_bam : noop;
    this.on_end = typeof o.on_end === "function" ? o.on_end : noop;
    this.on_start  = typeof o.on_start === "function" ? o.on_start : noop;
    this.pause  = typeof o.pause  === "function" ? o.pause  : null;
    this.env = o.env || o.$ || {}; // environment to register variables, especially for child processes
    this.paused = false;
    this.ended  = false;
    if (o.props) {
      for (let name in o.props) { const fn = o.props[name]; this[name] = fn; }
    }

    process.nextTick(() => {
      this.on_start(this.env);
      return this._init_loop();
    });
  }

  _init_loop() {
    if (this._read()) {
      return this.on_end(this.env);
    } else {
      if (this.pause && (this.paused = this.pause(this.env))) { return; }
      return setImmediate(() => this._init_loop());
    }
  }

  on(name, fn){
    switch (name) {
      case "end":
        this.on_end = fn;
        break;
      case "bam":
        this.on_bam = fn;
        break;
    }
    return this;
  }

  resume() {
    if (this.paused) {
      this.paused = false;
      return this._init_loop();
    }
  }

  send(msg){
    if (typeof process.send === "function") { return process.send(msg); }
  }

  _read() {
    let offset;
    const { nocache } = this;
    const read_size = Math.min(this.end - this.offset, this.pitch);
    if (read_size <= 0) { return true; }
    let chunk = new Buffer(read_size);
    fs.readSync(this.reader.fd, chunk, 0, read_size, this.offset);
    let [infbuf, i_offsets, d_offsets] = Array.from(inflateBGZF(chunk));
    const infbuf_len = infbuf.length;
    if (infbuf_len === 0) {
      this.pitch += this.pitch;
      return read_size === (this.end - this.offset); // if true, ended
    }

    if (!nocache) {
      for (let i = 0; i < d_offsets.length; i++) {
        offset = d_offsets[i];
        if (i_offsets[i+1]) {
          this.reader.infbufs.set(this.offset + offset, infbuf.slice(i_offsets[i], i_offsets[i+1]));
        }
      }
    }

    let i_offset = 0;
    let current_i_offset = i_offsets.shift();
    let current_d_offset = this.offset + d_offsets.shift();
    while (true) {
      var bambuf;
      if ((i_offset + 4) > infbuf_len) { break; }
      const bytesize = infbuf.readInt32LE(i_offset, true) + 4;
      if ((i_offset + bytesize) > infbuf_len) { break; }
      if (nocache) {
        bambuf = new Buffer(bytesize);
        infbuf.copy(bambuf, 0, i_offset, i_offset + bytesize);
      } else {
        bambuf = infbuf.slice(i_offset, i_offset + bytesize);
      }

      const bam = new BAM(bambuf, this.reader);
      bam.i_offset = i_offset - current_i_offset;
      bam.d_offset = current_d_offset;
      this.on_bam(bam, this.env);

      i_offset += bytesize;

      // updating i_offset, d_offset
      while (true) {
        if ((i_offsets[0] === undefined) || (i_offset < i_offsets[0])) { break; }
        const next_i_offset = i_offsets.shift();
        current_i_offset = next_i_offset;
        current_d_offset = this.offset + d_offsets.shift();
      }
    }

    chunk = null;
    if (nocache) {
      infbuf = null;
    }
    this.offset = current_d_offset;
    return false;
  }
}

module.exports.BAMIterator = BAMIterator;
