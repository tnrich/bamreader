/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
class OutlierFilteredMeanDev {
  constructor(rate){
    this.values = {};
    this.rate = (typeof rate === "number") && (rate >= 0) && (rate < 1) ? rate : 0.05;
    this.n = 0;
  }

  add(v){
    if (!this.values[v]) { this.values[v] = 0; }
    this.values[v]++;
    return this.n++;
  }
    
  precalc() {
    let n;
    let sum = 0;
    const { rate } = this;
    const lower_limit = (this.n * rate);
    const upper_limit = (this.n - (this.n * rate));
    let total = 0;
    let valids = 0;
    let squared = 0;
    for (let v in this.values) {
      n = this.values[v];
      sum += n;
      if (sum < lower_limit) { continue; }
      if (sum > upper_limit) { break; }
      const val = v * n;
      total += val;
      valids += n;
      squared += val * v;
    }

    return {
      sum    : total,
      squared,
      n      : valids
    };
  }

  calc() {
    const {sum, squared, n } = this.precalc();
    const mean = sum / n;
    return {
      mean,
      dev  : (squared / n) - (mean * mean),
      n
    };
  }
}

// ofmd  = new OutlierFilteredMeanDev(0.05)
// rt = require("random-tools")
// i = 0
// 
// while i < 1000000
//   v = Math.round(rt.normalRandom(500, 50))
//   ofmd.add(v)
//   i++
// 
// console.log ofmd.calc()

module.exports.OutlierFilteredMeanDev = OutlierFilteredMeanDev;
