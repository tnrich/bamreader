/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const SEQ_ARR = (function() {
  const ret = [];
  const arr = "=ACMGRSVTWYHKDBN".split("");
  for (let i = 0; i < arr.length; i++) {
    const c1 = arr[i];
    for (let j = 0; j < arr.length; j++) {
      const c2 = arr[j];
      ret.push(c2 === "=" ? c1 : c1 + c2);
    }
  }
  return ret;
})();

const QUAL_ARR = (function() {
  const ret = {};
  for (let i = 0; i <= 94; i++) {
    ret[i] = String.fromCharCode(i + 33);
  }
  return ret;
})();


const KNOWN_TAGS = (function() {
  const ret = {};
  for (let tag of [
    "AM", "AS",
    "BC", "BQ",
    "CC", "CM", "CO", "CP", "CQ", "CS", "CT",
    "E2",
    "FI", "FS", "FZ",
    "H0", "H1", "H2", "HI",
    "IH",
    "LB",
    "MC", "MD", "MQ",
    "NH", "NM",
    "OC", "OP", "OQ",
    "PG", "PQ", "PT", "PU",
    "QT", "Q2",
    "R2", "RG", "RT",
    "SA", "SM",
    "TC",
    "U2", "UQ",
    "XS"
  ]) {
    const k = (tag.charCodeAt(0) * 256) + tag.charCodeAt(1);
    ret[k] = tag;
  }
  return ret;
})();

const defineGetters = (obj, getters)=> (() => {
  const result = [];
  for (let name in getters) {
    const fn = getters[name];
    result.push(Object.defineProperty(obj, name, {get: fn}));
  }
  return result;
})() ;
const { CIGAR } = module.exports;
class BAM {
  static initClass() {
  
    defineGetters(this.prototype, {
      //#####################
      // FLAG PROPERTIES
      //#####################
      multiple() { return !!(this.flag & (0x01)); },
      allmatches() { return !!(this.flag & (0x02)); },
      unmapped() { return !!(this.flag & (0x04)); },
      next_unmapped() { return !!(this.flag & (0x08)); },
      reversed() { return !!(this.flag & (0x10)); },
      next_reversed() { return !!(this.flag & (0x20)); },
      first() { return !!(this.flag & (0x40)); },
      last() { return !!(this.flag & (0x80)); },
      secondary() { return !!(this.flag & (0x100)); },
      lowquality() { return !!(this.flag & (0x200)); },
      duplicate() { return !!(this.flag & (0x400)); },
      supplementary() { return !!(this.flag & (0x800)); },
  
      //#####################
      // BASIC PROPERTIES
      //#####################
      rname() { if (this.ref_id  === -1) { return null; } else { return this.reader.refs[this.ref_id].name; } },
      rnext() { if (this.nref_id === -1) { return null; } else { return this.reader.refs[this.nref_id].name; } },
  
      seq() {
        if (this.seq_ != null) { return this.seq_; }
        const len = this.seqbytes.length;
        let seq = "";
        let i = 0;
        while (i < len) { seq += SEQ_ARR[this.seqbytes[i++]]; }
        return this.seq_ = seq;
      },
  
      qual() {
        if (this.qual_ != null) { return this.qual_; }
        const len = this.length;
        let qual = "";
        let i = 0;
        while (i < len) { qual += QUAL_ARR[this.qualbytes[i++]]; }
        return this.qual_ = qual;
      },
  
      //#####################
      // CIGAR PROPERTIES
      //#####################
      CIGAR() {
        if (this.CIGAR_ != null) { return this.CIGAR_; }
        if (this.cigarbytes) {
          return this.CIGAR_ = new CIGAR(this.cigarbytes, this.l_cigar);
        } else {
          return this.CIGAR_ = CIGAR.createFromString(this.cigar);
        }
      },
      cigar() { return this.CIGAR.string; },
      clipped() { return this.CIGAR.soft_clipped() || this.CIGAR.hard_clipped(); },
      soft_clipped() { return this.CIGAR.soft_clipped(); },
      hard_clipped() { return this.CIGAR.hard_clipped(); },
      match_len() { return this.CIGAR.len(); },
      left_break() { return this.CIGAR.bpL(this.pos); },
      right_break() { return this.CIGAR.bpR(this.pos); },
      indel() { return this.CIGAR.indel(); },
      fully_matched() { return this.CIGAR.fully_matched(); },
  
      //#####################
      // SAM STRING
      //#####################
      sam() {
        if (this.sam_) { return this.sam_; }
        return this.sam_ =
          this.qname + "\t" +
          this.flag + "\t" +
          (this.ref_id  === -1 ? "*" : this.reader.refs[this.ref_id].name) + "\t" +
          this.pos + "\t" +
          this.mapq + "\t" +
          (this.cigar || "*") + "\t" +
          (this.nref_id === -1 ? "*" : this.ref_id === this.nref_id ? "=" : this.reader.refs[this.nref_id].name) + "\t" +
          this.pnext + "\t" +
          this.tlen + "\t" +
          this.seq  + "\t" +
          this.qual + "\t" +
          this.tagstr;
      },
  
      //#####################
      // OPTIONAL PROPERTIES
      //#####################
      pair() {
        if (!this.reader || !this.multiple) { return null; }
        if (this.pair_) { return this.pair_; }
        const bams = this.reader.find(this.qname, this.d_offset);
        for (let bam of Array.from(bams)) {
          if (this.secondary || this.supplementary || (this.flag === bam.flag)) { continue; }
          if (this.next_unmapped) {
            if (bam.unmapped) {
              bam.reader = this.reader;
              this.pair_ = bam;
              return bam;
            }
          } else if ((this.nref_id !== -1) && (this.pnext === bam.pos) && (this.nref_id === bam.ref_id)) {
              bam.reader = this.reader;
              this.pair_ = bam;
              return bam;
            }
        }
        this.pair_ = null;
        return null;
      },
  
      different_ref() {
        if (this.multiple && !this.unmapped && !this.next_unmapped) { return this.ref_id !== this.nref_id; } else { return null; }
      },
  
      same_strand() {
        if (this.multiple) { return this.reversed === this.next_reversed; } else { return null; }
      },
  
      has_n() {
        if (this.has_n_ != null) { return this.has_n_; }
        this.has_n_ = false;
        for (let byte of Array.from(this.seqbytes)) {
          if ((byte >= 0xf0) || ((byte & 0x0f) === 0x0f)) { return this.has_n_ = true; }
        } // 15 * 16 (upper) or 15 (lower)
        return this.has_n_;
      },
  
      // only works if the mapper is BWA
      unique() {
        return !this.unmapped && (this.mapq !== 0);
      },
  
      // only works if the mapper is BWA
      mismatch() {
        if (!this.tags.NM) { return null; }
        return this.tags.NM.value;
      },
  
      discordant() {
        if (!this.reader || (this.tlen === 0) || !this.reader.dic) { return null; }
        const m = this.reader.tlen_mean;
        const sd = this.reader.tlen_sd;
        const tlen = Math.abs(this.tlen);
        return (tlen < (m - (2*sd))) || ((m + (2*sd)) < tlen);
      },
  
      mean_qual() {
        let total = 0;
        const len = this.length;
        if (this.qualbytes) {
          for (let byte of Array.from(this.qualbytes)) { total += byte; }
        } else {
          const i = 0;
          while (i < len) {
            total += this.qual.charCodeAt(i) - 33;
          }
        }
        return Math.floor(total / len);
      },
            
  
      //#####################
      // TAG PROPERTY
      //#####################
      tagstr() {
        let i;
        if (this.tagstr_) { return this.tagstr_; }
        let tagstr = "";
        let cursor = 0;
        const buflen = this.tagbytes.length;
        const buf = this.tagbytes;
        while (true) {
          var value;
          if (cursor >= buflen) { break; }
          const tagbyte = buf.readUInt16BE(cursor, true);
          const tagname = KNOWN_TAGS[tagbyte] || buf.slice(cursor, cursor+2).toString("ascii");
          switch (tagname) {
            case "NM": case "AS": case "XS":
              tagstr +=  tagname + ":i:" + buf.readUInt8(cursor+3, true) + "\t";
              cursor += 4;
              continue;
              break;
          }
          cursor+=2;
          const valtype = String.fromCharCode(buf[cursor]);
          cursor++;
          let type = null;
  
          switch (valtype) {
            case "A":
              value = String.fromCharCode(buf[cursor]);
              cursor++;
              break;
            case "c":
              value = buf.readInt8(cursor, true);
              type = "i";
              cursor++;
              break;
            case "C":
              value = buf.readUInt8(cursor, true);
              type = "i";
              cursor++;
              break;
            case "s":
              value = buf.readInt16LE(cursor,true);
              type = "i";
              cursor+=2;
              break;
            case "S":
              value = buf.readUInt16LE(cursor, true);
              type = "i";
              cursor+=2;
              break;
            case "i":
              value = buf.readInt32LE(cursor, true);
              cursor+=4;
              break;
            case "I":
              value = buf.readUInt32LE(cursor, true);
              type = "i";
              cursor+=4;
              break;
            case "f":
              value = buf.readFloatLE(cursor, true);
              cursor+=4;
              break;
            case "B":
              var subtype = String.fromCharCode(buf[cursor]);
              cursor++;
              var arrayLen = buf.readInt32LE(cursor, true);
              cursor+=4;
              switch (subtype) {
                case "c":
                  value = ((() => {
                    let asc, end;
                    const result = [];
                    for (i = 0, end = arrayLen, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                      result.push(buf.readInt8(cursor+i, true));
                    }
                    return result;
                  })());
                  cursor+=arrayLen;
                  break;
                case "C":
                  value = ((() => {
                    let asc1, end1;
                    const result1 = [];
                    for (i = 0, end1 = arrayLen, asc1 = 0 <= end1; asc1 ? i < end1 : i > end1; asc1 ? i++ : i--) {
                      result1.push(buf.readUInt8(cursor+i, true));
                    }
                    return result1;
                  })());
                  cursor+=arrayLen;
                  break;
                case "s":
                  value = ((() => {
                    let asc2, end2;
                    const result2 = [];
                    for (i = 0, end2 = arrayLen, asc2 = 0 <= end2; asc2 ? i < end2 : i > end2; asc2 ? i++ : i--) {
                      result2.push(buf.readInt16LE(cursor+(i*2), true));
                    }
                    return result2;
                  })());
                  cursor+=arrayLen*2;
                  break;
                case "S":
                  value = ((() => {
                    let asc3, end3;
                    const result3 = [];
                    for (i = 0, end3 = arrayLen, asc3 = 0 <= end3; asc3 ? i < end3 : i > end3; asc3 ? i++ : i--) {
                      result3.push(buf.readUInt16LE(cursor+(i*2), true));
                    }
                    return result3;
                  })());
                  cursor+=arrayLen*2;
                  break;
                case "i":
                  value = ((() => {
                    let asc4, end4;
                    const result4 = [];
                    for (i = 0, end4 = arrayLen, asc4 = 0 <= end4; asc4 ? i < end4 : i > end4; asc4 ? i++ : i--) {
                      result4.push(buf.readInt32LE(cursor+(i*4), true));
                    }
                    return result4;
                  })());
                  cursor+=arrayLen*4;
                  break;
                case "I":
                  value = ((() => {
                    let asc5, end5;
                    const result5 = [];
                    for (i = 0, end5 = arrayLen, asc5 = 0 <= end5; asc5 ? i < end5 : i > end5; asc5 ? i++ : i--) {
                      result5.push(buf.readUInt32LE(cursor+(i*4), true));
                    }
                    return result5;
                  })());
                  cursor+=arrayLen*4;
                  break;
                case "f":
                  value = ((() => {
                    let asc6, end6;
                    const result6 = [];
                    for (i = 0, end6 = arrayLen, asc6 = 0 <= end6; asc6 ? i < end6 : i > end6; asc6 ? i++ : i--) {
                      result6.push(buf.readFloatLE(cursor+(i*4), true));
                    }
                    return result6;
                  })());
                  cursor+=arrayLen*4;
                  break;
              }
              value.unshift(subtype);
              value = value.join(",");
              break;
            case "Z":
              var zLen = 0;
              while (buf[cursor+zLen] !== 0x00) { zLen++; }
              value = buf.slice(cursor, cursor+zLen).toString("ascii");
              cursor+=zLen+1;
              break;
            case "H":
              var hLen = 0;
              while (buf[cursor+hLen] !== 0x00) { hLen++; }
              value = buf.slice(cursor, cursor+hLen).toString("hex");
              cursor+=hLen+1;
              break;
          }
            // end of switch
          tagstr += tagname + ":" + (type || valtype) + ":" + value + "\t";
        }
          // end of loop
        return this.tagstr_ = tagstr.slice(0, -1);
      },
  
      tags() {
        if (this.tags_) { return this.tags_; }
        for (let tag of Array.from(this.tagstr.split("\t"))) {
          var value;
          const val = tag.split(":");
          tag = val[0];
          const type = val[1];
          switch (type) {
            case "i":case "f": value = Number(val[2]); break;
            // when "B"
            //   value = val[2].split(",")
            //   subtype = value[0]
            //   if subtype in ["c","C","s","S","i","I","f"]
            //     value = (Number v for v in value)
            //     value[0] = subtype
            default:
              value = val[2];
          }
          this.tags_[tag] = {type, value};
        }
        return this.tags_;
      }
    }
    );
  }
  static createFromSAM(sam, reader){
    // mimics bam object
    const d = sam.split("\t");

    // native values
    // "ref_id" and "nref_id" are used for some getter properties
    const bam = {
      reader,
      qname : d[0],
      flag  : Number(d[1]),
      pos   : Number(d[3]),
      mapq  : Number(d[4]),
      pnext : Number(d[7]),
      tlen  : Number(d[8]),
      rname     : d[2] === "*" ? null : d[2],
      ref_id    : d[2] === "*" ? -1 : d[2],
      rnext     : d[6] === "*" ? null : d[6],
      nref_id   : d[6] === "*" ? -1 : d[2],
      cigar     : d[5] === "*" ? null : d[5],
      seq       : d[9],
      qual      : d[10],
      tagstr    : d.slice(11).join("\t"),
      length    : d[9].length,
      sam
    };

    bam.__proto__ = BAM.prototype;
    return bam;
  }

  constructor(buf, reader){
    this.reader = reader;
    this.bytesize = buf.readInt32LE(0, true) + 4;
    this.ref_id   = buf.readInt32LE(4, true);
    this.pos      = buf.readInt32LE(8, true) + 1;
    this.mapq     = buf.readUInt8(13, true);
    this.flag     = buf.readUInt16LE(18, true);
    this.nref_id  = buf.readInt32LE(24, true);
    this.pnext    = buf.readInt32LE(28, true) + 1;
    this.tlen     = buf.readInt32LE(32, true);
    //bin      = buf.readUInt16LE 14, true

    const l_qname = buf.readUInt8(12, true);
    this.qname = buf.slice(36, (36 + l_qname) - 1).toString("ascii");

    const l_cigar = buf.readUInt16LE(16, true);
    let cursor = 36 + l_qname;
    this.cigarbytes = buf.slice(cursor, cursor + (l_cigar * 4));
    this.l_cigar = l_cigar;

    const l_seq = buf.readInt32LE(20, true);
    cursor += l_cigar * 4;
    const b_seqlen = Math.floor((l_seq+1)/2);
    this.seqbytes = buf.slice(cursor, cursor + b_seqlen);
    this.length  = l_seq;

    cursor += b_seqlen;
 
    this.qualbytes = buf.slice(cursor, cursor+l_seq);
    cursor += l_seq;

    this.tagbytes = buf.slice(cursor);
  }
}
BAM.initClass();

module.exports.BAM = BAM;
