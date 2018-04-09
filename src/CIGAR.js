/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const CIGAR_ARR = "MIDNSHP=X".split("");
const nullobj = {
  string: null,
  soft_clipped() { return null; },
  hard_clipped() { return null; },
  bpL() { return null; },
  bpR() { return null; },
  len() { return null; },
  indel() { return null; },
  fully_matched() { return null; }
};


class CIGAR {
  constructor(buf, l_cigar){
    if (buf && (buf.length === 0)) { return nullobj; }
    this._indel = false;
    if (buf === null) { return; }
    this.arr = new Array(l_cigar);
    let str = "";
    let i = 0;
    while (i < l_cigar) {
      let num  = buf.readUInt32LE(i * 4, true);
      const type = CIGAR_ARR[num & 0x0f];
      if (type.match(/[ID]/)) { this._indel = true; }
      num  = num>>4;
      this.arr[i] = {num, type};
      str += num + type;
      i++;
    }
    this.string = str;
  }

  static createFromString(str){
    if (!str || (str === "*")) { return nullobj; }
    const cigar = new CIGAR();
    const arr = [];
    const cigarr = str.split(/([A-Z=])/).slice(0, -1);
    const i = 0;
    const l_cigar = cigarr.length/2;
    while (i < l_cigar) {
      const i2 = i*2;
      const type = cigarr[i2+1];
      if (type.match(/[ID]/)) { cigar._indel = true; }
      arr.push({
        num  : Number(cigarr[i2]),
        type
      });
    }
    cigar.arr = arr;
    return cigar.string = str;
  }

  soft_clipped() { return (this.arr[0].type === "S") || (this.arr[this.arr.length-1].type === "S"); }
  hard_clipped() { return (this.arr[0].type === "H") || (this.arr[this.arr.length-1].type === "H"); }
  indel() { return this._indel; }
  fully_matched() {
    return (this.arr.length === 1) && (this.arr.type === "M");
  }

  // leftside breakpoint
  bpL(pos){ if (this.arr[0].type.match(/[SH]/)) { return pos; } else { return null; } }

  // rightside breakpoint
  bpR(pos){
    let matched = false;
    let ret = pos;
    for (let info of Array.from(this.arr)) {
      if (!matched && (info.type === "M")) {
        matched = true;
      }
      if (matched) {
        if (info.type.match(/[SH]/)) { return ret; }
        ret += info.num;
      }
    }
    return null;
  }

  len() {
    let ret = 0;
    for (let info of Array.from(this.arr)) { if (info.type.match(/[MS=XI]/)) { ret += info.num; } }
    return ret;
  }
}

module.exports.CIGAR = CIGAR;
