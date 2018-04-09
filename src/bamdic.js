/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
require("termcolor").define;
const BAMReader = module.exports;
const cp = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const LINE_SIZE = 11;
const DIC_SIZE  = 8;

//####################################
// creates dic
//####################################
BAMReader.prototype.createDic = function(op, callback){
  let binarize;
  if (op == null) { op = {}; }
  if (typeof op === "number") { op = {num: op}; }
  const outfile = this.bamfile + ".dic";
  let tmpfiles = [];
  let merged_num = 0;
  let merging = 0;
  let finished = false;
  const tlen_sample_size = typeof op.tlen_sample_size === "number" ? op.tlen_sample_size : 100000;
  const outlier_rate = typeof op.outlier_rate === "number" ? op.outlier_rate  : 0.02;

  let $ = {
    WFILE_HWM        : (1024*1024*20)-1,
    MAX_MEMORY_SIZE  : 1.2e9,
    tmpfile_inc      : 0,
    outfile,
    r_count          : 0,
    w_count          : 0,
    // prev_count       : 0
    time             : (new Date/1000)|0,
    debug            : op.debug,
    pool             : {},
    pool_count       : 0,
    outlier_rate,
    tlen_sample_size : Math.round(tlen_sample_size / op.num),
    d_deltas         : [], // broad defbuf lengths
    last_offset      : 0
  };

  // spawn children
  this.fork({
    $,
    num: op.num,
    nocache: true,
    pitch: 8388608,

    start($){
      $.tlens = new BAMReader.OutlierFilteredMeanDev($.outlier_rate, $.tlen_sample_size);
      $.d_deltas.push(this.offset);
      return $.last_offset = this.offset;
    },
      
    // calc md5 and store
    bam(bam, $){
      const binary = bam.d_offset.toString(2); // binary expression of dOffset
      const key = crypto.createHash("md5").update(bam.qname).digest().readUInt32BE(0,  true);
      //bam.qname.match(/[0-9]+/g).join("")
      const data = new Buffer(LINE_SIZE);
      data.writeUInt32BE(key, 0, true);
      data.writeUInt32BE(parseInt(binary.slice(-32), 2), 4, true); // lower
      const upper = binary.length > 32 ? parseInt(binary.slice(0, -32), 2) : 0;
      data.writeUInt8(upper, 8, true);
      data.writeUInt16BE(bam.i_offset, 9, true);
      if ($.pool[key] == null) {
        $.pool[key] = [];
        $.pool_count++;
      }
      $.pool[key].push(data);

      // mean tlen
      if ((bam.unmapped === false) && (bam.next_unmapped === false) && (bam.same_strand === false) && (bam.tlen !== 0)) {
        const tlen = Math.abs(bam.tlen);
        $.tlens.add(tlen);
      }
      return $.r_count++;
    },

    // write to tmpfile
    pause($){
      $.d_deltas.push(this.offset - $.last_offset);
      $.last_offset = this.offset;
      const memory = process.memoryUsage();
      if ($.debug) { console.log([$.n, "R", $.r_count, ((new Date/1000)|0) - $.time, memory.rss].join("\t")); }
      if (memory.rss <= $.MAX_MEMORY_SIZE) { return false; }
      if ($.pool_count === 0) {
        setTimeout(() => {
          return this.resume();
        }
        ,1000);
        return true;
      }
      this.write($, this.resume.bind(this));
      return true;
    },

    // merges tmpfiles
    message(msg){
      if (!msg.tmpfile) { return; }
      tmpfiles.push(msg.tmpfile);
      if (tmpfiles.length < 2) { return; }

      const files = tmpfiles.join(" ");
      if ($.debug) { console.log(["M", "M", tmpfiles.length, ((new Date/1000)|0) - $.time, process.memoryUsage().rss].join("\t")); }
      merging++;
      merge_sort(files, function() {
        merging--;
        if ((merging === 0) && finished) { return on_finish(finished); }
      });
      return tmpfiles = [];
    },

    end($){
      this.write($, $.exit);
      if ($.debug) { console.log([$.n, "E", $.w_count, ((new Date/1000)|0) - $.time, process.memoryUsage().rss].join("\t")); }
      const {sum, squared, n} = $.tlens.precalc();
      $.tlen_sum     = sum;
      $.tlen_squared = squared;
      $.tlen_n       = n;
      return delete $.tlens;
    },

    props: {
      write($, cb){
        //count = $.r_count - $.prev_count
        //$.prev_count = $.r_count
        const WCHUNK_SIZE = $.WFILE_HWM - 10000;
        let w_data = "";
        const tmpfile = `${$.outfile}.${$.n}.${(++$.tmpfile_inc)}`;
        const wstream = require("fs").createWriteStream(tmpfile, {highWaterMark: $.WFILE_HWM});
        var _write = function() {
          if ($.debug) { console.log([$.n, "W", $.w_count, ((new Date/1000)|0) - $.time, process.memoryUsage().rss].join("\t")); }
          for (let key in $.pool) {
            const arr = $.pool[key];
            for (let data of Array.from(arr)) {
              w_data += data.toString("hex") + "\n";
            }
            $.w_count += arr.length;
            $.pool_count--;
            delete $.pool[key];
            if (w_data.length > WCHUNK_SIZE) {
              wstream.write(w_data, "utf-8", _write);
              w_data = "";
              return;
            }
          }
          $.pool = {};
          if ($.debug) { console.log([$.n, "W", $.w_count, ((new Date/1000)|0) - $.time, process.memoryUsage().rss].join("\t")); }
          return wstream.end(w_data);
        };
        wstream.on("finish", () => {
          this.send({tmpfile});
          return cb();
        });
        return _write();
      }
    },

    finish($s){
      finished = $s;
      if (merging === 0) { return on_finish(finished); }
    }
  });

  // merge sort
  var merge_sort = function(files, cb){
    let sort;
    const new_name = outfile + ".merged" + (++merged_num);
    const command = `sort -m ${files} > ${new_name}`;
    return sort = cp.exec(command, function() {
      tmpfiles.push(new_name);
      return cp.exec(`rm ${files}`, cb);
    });
  };
    
  // merge first, then binarize
  var on_finish = function($s){
    if (tmpfiles.length >= 2) {
      // merge sort (pipe)
      if ($.debug) { console.log(["M", "M", tmpfiles.length, ((new Date/1000)|0) - $.time, process.memoryUsage().rss].join("\t")); }
      const sort = cp.spawn("sort", ["-m"].concat(tmpfiles));
      return binarize($s, sort.stdout);
    } else {
      return binarize($s, fs.createReadStream(tmpfiles[0], {highWaterMark: (1024 * 1024 * 10) -1}));
    }
  };

  return binarize = function($s, rstream){
    // calculates broad d_offset position
    let j;
    let d, i;
    const d_deltas = [];
    let delta = 0;
    for (j = 0, i = j; j < $s.length; j++, i = j) {
      $ = $s[i];
      const s = $.d_deltas.shift();
      if (i === 0) { d_deltas.push(s); }
      for (d of Array.from($.d_deltas)) {
        delta += d;
        if (delta > 16777215) { // 3byte
          if (d !== delta) { d_deltas.push(delta - d); }
          delta = d;
        }
      }
    }
    if (delta !== 0) { d_deltas.push(delta); }

    // calculates tlen statistics information
    let tlen_sum     = 0;
    let tlen_squared = 0;
    let tlen_n       = 0;
    for ($ of Array.from($s)) {
      tlen_sum     += $.tlen_sum;
      tlen_squared += $.tlen_squared;
      tlen_n       += $.tlen_n;
    }
    const tlen_mean = tlen_sum / tlen_n;
    const tlen_dev  = (tlen_squared / tlen_n) - (tlen_mean * tlen_mean);
    const tlen_sd   = Math.sqrt(tlen_dev);
    if ($.debug) { console.log(["M", "T", Math.round(tlen_mean), ((new Date/1000)|0) - $.time, "mean"].join("\t")); }
    if ($.debug) { console.log(["M", "T", Math.round(tlen_sd), ((new Date/1000)|0) - $.time, "sd"].join("\t")); }

    let l_count = 0;
    rstream.setEncoding("utf-8");
    const wstream = fs.createWriteStream(outfile, {highWaterMark: (1024 * 1024 * 10) -1});
    // writes header
    const idx_header = {tlen_mean: Math.round(tlen_mean), tlen_sd: Math.round(tlen_sd), tlen_n, outlier_rate: $.outlier_rate, tlen_sample_size: $.tlen_sample_size};
    const idx_header_str = JSON.stringify(idx_header);
    const header_buf = new Buffer(idx_header_str.length + 4);
    header_buf.writeUInt32BE(idx_header_str.length, 0);
    header_buf.write(idx_header_str, 4);
    wstream.write(header_buf);

    // write d_delta info
    const d_delta_len = d_deltas.length;
    const d_delta_buf = new Buffer( 2 + (3 * d_delta_len));
    d_delta_buf.writeUInt16BE(d_deltas.length, 0);
    let offset = 2;
    for (let d_delta of Array.from(d_deltas)) {
      d_delta_buf.writeUInt16BE(d_delta>>8, offset);
      d_delta_buf.writeUInt8(d_delta&0xff, offset + 2);
      offset += 3;
    }
    wstream.write(d_delta_buf);

    // footer info
    const three_byte_idx = new Array(256 * 256 * 256);

    // writes body
    let remainder = "";
    let write_ended = false;
    var read_write = function() {
      if (write_ended) { return; }
      d = rstream.read();
      if (d === null) { return rstream.once("readable", read_write); }
      const str = remainder + d;
      const lines = str.split("\n");
      remainder = lines.pop();
      const buf = new Buffer(DIC_SIZE * lines.length);
      for (i = 0; i < lines.length; i++) {
        const line = lines[i];
        const idx = parseInt(line.slice(0, 6), 16);
        if (three_byte_idx[idx]) {
          three_byte_idx[idx]++;
        } else {
          three_byte_idx[idx] = 1;
        }
        buf.write(line.slice(6), i * DIC_SIZE, "hex");
      }
      l_count++;
      if ($.debug && ((l_count % 10000) === 0)) { console.log(["M", "B", l_count, ((new Date/1000)|0) - $.time, process.memoryUsage().rss].join("\t")); }
      return wstream.write(buf, read_write);
    };

    rstream.once("readable", read_write);
    rstream.on("end", function() {
      // write footer
      const footer_buf = new Buffer(256 * 256 * 256 * 7);
      offset = 0;
      for (let idx = 0; idx < three_byte_idx.length; idx++) {
        const v = three_byte_idx[idx];
        if (!v) { continue; }
        footer_buf.writeUInt16BE(idx>>8, offset);
        footer_buf.writeUInt8(idx&0xff, offset + 2);
        footer_buf.writeUInt32BE(v, offset + 3);
        offset += 7;
      }
      footer_buf.writeUInt32BE(offset, offset);

      wstream.end(footer_buf.slice(0, offset+4));
      return write_ended = true;
    });

    return wstream.on("finish", function() {
      if ($.debug) { console.log(["M", "B", l_count, ((new Date/1000)|0) - $.time, process.memoryUsage().rss].join("\t")); }
      return cp.exec(`rm ${tmpfiles.join(" ")}`, function() {
        if (typeof callback === "function") { return callback($s); }
      });
    });
  };
};

BAMReader.prototype.find = function(qname, d_offset_to_filter){
  if (this.dic === null) {
    throw new Error(".dic file has not been created. reader.createDic() can make the file.");
  }
  if (!this.dic.three_byte_idx) {
    this.dic._read_footer();
  }
  return this.dic.fetch(qname, d_offset_to_filter);
};

class BAMDic {
  static create(reader){
    const idxfile = reader.bamfile + ".dic";
    if (!fs.existsSync(idxfile)) { return null; }
    return new BAMDic(reader);
  }

  constructor(reader){
    this.reader = reader;
    this.idxfile = this.reader.bamfile + ".dic";
    this.size = fs.statSync(this.idxfile).size;
    this.fd = fs.openSync(this.idxfile, "r");

    // read idx header
    let _b = new Buffer(4);
    fs.readSync(this.fd, _b, 0, 4, 0);
    const headerJSONLen = _b.readUInt32BE(0);
    _b = new Buffer(headerJSONLen);
    fs.readSync(this.fd, _b, 0, headerJSONLen, 4);
    this.header = JSON.parse(_b.toString("utf-8"));
    const header_offset = headerJSONLen + 4;

    // read d_deltas
    _b = new Buffer(2);
    fs.readSync(this.fd, _b, 0, 2, header_offset);
    const d_delta_len = _b.readUInt16BE(0);
    const d_delta_buflen = d_delta_len * 3;
    _b = new Buffer(d_delta_buflen);
    fs.readSync(this.fd, _b, 0, d_delta_buflen, header_offset + 2);
    let cursor = 0;
    const broad_d_offsets = new Array(d_delta_len + 1);
    let pos = 0;
    while (cursor < d_delta_len) {
      const c3 = cursor * 3;
      const d_delta = (_b.readUInt16BE(c3) * 256) + _b.readUInt8(c3 + 2);
      pos += d_delta;
      broad_d_offsets[cursor] = pos;
      cursor++;
    }
    broad_d_offsets[cursor] = this.reader.size;
    this.broad_d_offsets = broad_d_offsets;
    this.header_offset = header_offset + 2 + d_delta_buflen;

    // calc total reads
    _b = new Buffer(4);
    fs.readSync(this.fd, _b, 0, 4, this.size - 4);
    this.footer_size = _b.readUInt32BE(0);
    this.total_reads = (this.size - this.header_offset - this.footer_size - 4) / DIC_SIZE;
  }

  _read_footer() {
    let idx3byte;
    const { footer_size } = this;
    const footer = new Buffer(footer_size);
    fs.readSync(this.fd, footer, 0, footer_size, this.size - footer_size - 4);
    let i = 0;
    this.three_byte_idx = {};
    if ((footer_size / 7) < (256 * 256 * 64)) {
      this.nums = {};
    }
    let total = 0;
    while (i < footer_size) {
      idx3byte = (footer.readUInt16BE(i) * 256) +  footer.readUInt8(i+2);
      const num = footer.readUInt32BE(i+3);
      this.three_byte_idx[idx3byte] = total;
      if (this.nums) { this.nums[idx3byte] = num; }
      total += num;
      i+=7;
    }
    this.three_byte_idx[idx3byte+1] = total; // saving the last position

    return this.bufs = new module.exports.Fifo(1024 * 1024 * 4);
  }

  fetch(qname, d_offset_to_filter){
    let buf, read_num, results;
    const md5_buf = crypto.createHash("md5").update(qname).digest();
    const idx = (md5_buf.readUInt16BE(0) * 256) + md5_buf.readUInt8(2);
    const obi = md5_buf.readUInt8(3);

    if (buf = this.bufs.get(idx)) {
      read_num = buf.length / DIC_SIZE;
    } else {
      const start = this.three_byte_idx[idx];
      if (start == null) { return null; }
      if (this.nums) {
        read_num = this.nums[idx];
      } else {
        let end;
        let nx_idx = idx + 1;
        while (nx_idx <= 16777216) { // 256 * 256 * 256
          if (end = this.three_byte_idx[nx_idx]) { break; }
          nx_idx++;
        }
        if (end == null) { return null; }
        read_num = end - start;
      }
      buf = new Buffer(DIC_SIZE * read_num);
      fs.readSync(this.fd, buf, 0, DIC_SIZE * read_num, (start * DIC_SIZE) + this.header_offset);
      this.bufs.set(idx, buf);
    }

    if (read_num === 1) {
    // shortcut when only hits one line
      if (obi === buf.readUInt8(0, true)) {
        results = [0];
      } else {
        return null;
      }
    // full scanning
    } else if (read_num <= 4) {
      let _i = 0;
      results = [];
      while (_i < read_num) {
        const _p = _i * DIC_SIZE;
        if (obi === buf.readUInt8(_p, true)) { results.push(_i); }
        _i++;
      }
    // binary search
    } else {
      let current;
      let left = 0;
      let right = read_num;

      let md5_o = null;
      let itr_count = 0;
      while (true) {
        itr_count++;
        current = Math.floor((left + right)/2);
        md5_o = buf.readUInt8(DIC_SIZE * current, true);
        if (obi === md5_o) { break; }
        if (md5_o > obi) {
          const newright = current;
          if (newright === right) { break; }
          right = newright;
        } else {
          const newleft = current;
          if (newleft === left) { break; }
          left = newleft;
        }
      }

      if (md5_o !== obi) { return null; }

      results = [current];

      // search flanking lines
      for (let delta of [1, -1]) {
        let num = current;
        while (true) {
          num += delta;
          if ((num < 0) || (num >= read_num)) { break; }
          md5_o = buf.readUInt8(DIC_SIZE * num, true);
          if (md5_o !== obi) { break; }
          results.push(num);
        }
      }
    }

    const bams = [];
    for (let line_i of Array.from(results)) {
      const _offset = line_i * DIC_SIZE;
      const lower = buf.readUInt32BE(_offset + 1, true);
      const upper = buf.readUInt8(_offset + 5, true);
      const d_offset = upper ? (upper * 0x100000000) + lower : lower;
      if (d_offset === d_offset_to_filter) { continue; }
      const i_offset = buf.readUInt16BE(_offset + 6, true);
      const bam = this.reader.read(i_offset, d_offset);
      if (bam && (bam.qname === qname)) { bams.push(bam); }
    }
    return bams;
  }
}

module.exports.BAMDic = BAMDic;
