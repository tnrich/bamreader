/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const fs = require("fs");
const inflateBGZF = require("bgzf").inflate;
const isValidBGZF = require("bgzf").hasValidHeader;
const INFBUF_CACHE_SIZE = 256 * 256 * 256 * 20;

class BAMReader {
  constructor(bamfile, o){
    if (o == null) { o = {}; }
    this.bamfile = require("path").resolve(bamfile);
    this.cache_size = o.cache_size || INFBUF_CACHE_SIZE;
    this.infbufs = new module.exports.Fifo(this.cache_size);
    this.fd = fs.openSync(this.bamfile, "r");
    this.nodic   = !!o.nodic;
    this.nocache = !!o.nocache;
    this.size = fs.statSync(this.bamfile).size;

    // reads .dic file
    // if not exists, @dic is set null
    
    this.dic = this.nodic ? null : BAMReader.BAMDic.create(this);
    if (this.dic) {
      this.tlen_mean = this.dic.header.tlen_mean;
      this.tlen_sd   = this.dic.header.tlen_sd;
      this.total_reads = this.dic.total_reads;
    } else {
      this.tlen_mean = null;
      this.tlen_sd   = null;
      this.total_reads = null;
    }

    if (o.from_obj) { return; }

    const _readHeader_result = this._readHeader(); // @header, @refs, @header_offset is set
    if (null === _readHeader_result) { throw "couldn't read header"; }
  }

  static create(bamfile, o){
    if (o == null) { o = {}; }
    return new BAMReader(bamfile, o);
  }

  //####################################
  // creates obj reading bams in order
  //####################################
  createIterator(o){
    if (o == null) { o = {}; }
    if (typeof o === "function") { o = {on_bam: o}; }
    return module.exports.BAMIterator.create(this, o);
  }
    
  //####################################
  // shortcut for iterator
  //####################################
  on(name, fn){
    if (name === "bam") {
      return this.createIterator(fn);
    }
  }

  //####################################
  // cache using dic.broad_d_offsets
  //####################################
  cache(d_offset){
    let b_d_offset, b_d_offset_1;
    if (!this.dic) { return; }
    const { broad_d_offsets } = this.dic;
    let current = Math.floor((d_offset - this.header_offset)/16777216);
    while (true) {
      if ((b_d_offset = broad_d_offsets[current]) > d_offset) {
        current--;
      } else if ((b_d_offset_1 = broad_d_offsets[current+1]) <= d_offset) {
        current++;
      } else {
        break;
      }
    }
    const read_size = b_d_offset_1 - b_d_offset;
    const chunk = new Buffer(read_size);
    fs.readSync(this.fd, chunk, 0, read_size, b_d_offset);
    const [infbuf, i_offsets, d_offsets] = Array.from(inflateBGZF(chunk));
    d_offsets.pop();
    return Array.from(d_offsets).map((offset, i) =>
      this.infbufs.set(b_d_offset + offset, infbuf.slice(i_offsets[i], i_offsets[i+1])));
  }

  //####################################
  // reads an alignment with the offsets
  //####################################
  read(i_offset, d_offset){
    let bytesize;
    if (!this.nocache) {
      let buf = this.infbufs.get(d_offset);
      if (!buf) {
        this.cache(d_offset);
        buf = this.infbufs.get(d_offset);
      }
      const len = buf.length;
      // FIXME: longer bam data cannot be restored
      if (((i_offset + 4) <= len) && ((bytesize = buf.readInt32LE(0, true) + 4) <= len)) {
        return new module.exports.BAM(buf.slice(i_offset, i_offset + bytesize));
      }
    }

    let pitch = 1000;
    while (true) {
      const read_size = Math.min(this.size - d_offset, pitch);
      const chunk = new Buffer(read_size);
      fs.readSync(this.fd, chunk, 0, read_size, d_offset);
      let [infbuf, i_offsets, d_offsets] = Array.from(inflateBGZF(chunk));
      infbuf = infbuf.slice(i_offset);
      if (infbuf.length < 4) {
        if (read_size === (this.size - d_offset)) { throw "couldn't fetch bam"; }
        pitch += pitch;
        continue;
      }
      bytesize = infbuf.readInt32LE(0, true) + 4;
      if (infbuf.length < bytesize) {
        if (read_size === (this.size - d_offset)) { throw "couldn't fetch bam"; }
        pitch += pitch;
        continue;
      }
      const bambuf = infbuf.slice(0, bytesize);
      const bam = new module.exports.BAM(bambuf, this);
      bam.i_offset = i_offset;
      bam.d_offset = d_offset;
      return bam;
    }
  }


  //####################################
  // splits body section into num parts
  //####################################
  split(num){
    let pitch = 65535;
    num = (typeof num === "number") && (num >= 1) ? parseInt(num) : 2;
    const interval = Math.floor((this.size - this.header_offset)/num);
    const positions = [];

    let k = 0;
    // finding accurate position of BGZF
    while (k < num) {
      //start = interval * k + @header_offset - 1
      var d_offset;
      const start = (interval * k) + this.header_offset;
      const buflen = Math.min(pitch, interval);
      const buf = new Buffer(buflen);
      fs.readSync(this.fd, buf, 0, buflen, start);
      let cursor = -1;
      let match = false;
      while (!match && !((cursor + 16) > buf.length)) {
        var infbuf;
        cursor++;
        if (!isValidBGZF(buf.slice(cursor, cursor+16))) { continue; }
        d_offset = start + cursor;
        // checks if the BGZF block contains the start of alignment buffer
        try {
          [infbuf] = Array.from(inflateBGZF(buf.slice(cursor)));
        } catch (e) {
          // invalid format: retry
          infbuf = new Buffer(0);
        }
        if (infbuf.length < 24) {
          if (buflen !== interval) {
            // retry with much buffer
            k--;
            pitch += pitch;
          }
          break;
        }
        const ref_id  = infbuf.readInt32LE(4,  true);
        const nref_id = infbuf.readInt32LE(24, true);
        // if valid inf position
        if (((ref_id === -1) || (this.refs[ref_id] != null)) && ((nref_id === -1) || (this.refs[nref_id] != null))) { match = true; }
      }

      if (match) { positions.push(d_offset); }
      k++;
    }
    if ((positions.length === 0) && (num > 1)) {
      return this.split(num - 1);
    }
    return positions;
  }

  //####################################
  // creates child processes
  //####################################
  fork(o){
    let child, script;
    if (o == null) { o = {}; }
    if (typeof o === "function") { o = {on_bam: o}; }
    let num = (typeof o.num === "number") && (o.num >= 1) ? parseInt(o.num) : 2;
    const positions = this.split(num);
    num = positions.length;
    // attach "on_"
    for (let suffix of ["bam", "start", "end", "finish", "message"]) {
      if (typeof o[suffix] === "function") { o[`on_${suffix}`] = o[suffix]; }
      delete o[suffix];
    }

    positions.push(this.size);
    const childs = [];
    const { on_finish }  = o;
    const { on_message } = o;
    delete o.on_finish;
    delete o.on_message;

    // name of the script to fork
    if (o.script && o.script.match(/^child[a-z_]+/)) {
      ({ script } = o);
      delete o.script;
    } else {
      script = "child";
    }

    // stringify functions to pass to child processes
    BAMReader.makeSendable(o);
    o.reader = this.toObject();

    let ended_childs = 0;
    const envs = new Array(num);
    for (let n = 0, end = num, asc = 0 <= end; asc ? n < end : n > end; asc ? n++ : n--) {
      // spawning child process
      child = require("child_process").fork(`${__dirname}/${script}.js`);

      child.on("message", function(env){
        if (env.ended) {
          return envs[env.n] = env;
        } else {
          if (typeof on_message === "function") { return on_message(env); }
        }
      });
      child.on("exit", function() {
        ended_childs++;
        if (ended_childs < num) { return; }
        if (typeof on_finish === "function") { return on_finish.call(this, envs); }
      });

      child.options = {
        start : positions[n],
        end   : positions[n+1],
        n
      };
      for (let k in o) { const v = o[k]; child.options[k] = v; }

      childs.push(child);
    }
    // send info to child
    process.nextTick(() => {
      return (() => {
        const result = [];
        for (child of Array.from(childs)) {           result.push(child.send(child.options));
        }
        return result;
      })();
    });
    return childs;
  }

  static fork(...args){
    let file, o;
    if (typeof args[0] === "string") {
      if (!args[1]) { throw new Error("argument 2 should be an object."); }
      file = args[0];
      o = args[1];
    } else {
      o = args[0];
      ({ file } = o);
      delete o.file;
    }
    return BAMReader.create(file).fork(o);
  }


  // (private) reads header
  _readHeader() {
    let read_size = 32768;
    while (true) {
      read_size = Math.min(this.size, read_size);
      const buf = new Buffer(read_size);
      fs.readSync(this.fd, buf, 0, read_size, 0);
      const [infbuf, i_offsets, d_offsets] = Array.from(inflateBGZF(buf));
      try {
        var current_d_offset;
        let cursor = 0;
        const refs = {};
        const headerLen = infbuf.readInt32LE(4);
        if (infbuf.length < (headerLen + 16)) { throw new Error("header len"); }
        const headerStr = infbuf.slice(8,headerLen+8).toString("ascii");
        cursor = headerLen + 8;
        const nRef = infbuf.readInt32LE(cursor);
        cursor+=4;

        const blen = infbuf.length;

        for (let i = 0, end = nRef, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
          const nameLen = infbuf.readInt32LE(cursor);
          cursor+=4;
          const name = infbuf.slice(cursor, (cursor+nameLen)-1).toString("ascii");
          cursor+=nameLen;
          const refLen = infbuf.readInt32LE(cursor);
          cursor+=4;
          refs[i] = {name, len: refLen};
        }

        this.refs = refs;
        this.header = headerStr;
        while (true) {
          const current_i_offset = i_offsets.shift();
          current_d_offset = d_offsets.shift();
          if (cursor <= current_i_offset) { break; }
        }
        this.header_offset = current_d_offset;
        break;
      } catch (e) {
        if (read_size === this.size) { return null; }
        read_size += read_size;
      }
    }
    return true;
  }

  //####################################
  // iterate (single or multi)
  //####################################
  iterate(o){
    if (o == null) { o = {}; }
    if ((typeof o.num === "number") && (o.num >= 2)) {
      return this.fork(o);
    } else {
      return this.createIterator(o);
    }
  }


  //####################################
  // restore from object(hash)
  //####################################
  static createFromObject(obj){
    const reader = new BAMReader(obj.bamfile, {from_obj: true, cache_size: obj.cache_size, nodic: obj.nodic});
    for (let k of ["size", "header", "header_offset", "refs"]) {
      reader[k] = obj[k];
    }
    return reader;
  }
      

  //####################################
  // gets a restorable object(hash)
  //####################################
  toObject() {
    const ret = {};
    for (let k of ["size", "header", "header_offset", "refs", "bamfile", "cache_size", "nodic", "nocache"]) { ret[k] = this[k]; }
    return ret;
  }
}

module.exports = BAMReader;
