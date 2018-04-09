/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
class Fifo {
  constructor(size_limit){
    if (size_limit == null) { size_limit = INFBUF_CACHE_SIZE; }
    this.size_limit = size_limit;
    this.hash = {};
    this.keys = [];
    this.total_size = 0;
  }

  get(k) { return this.hash[k]; }

  set(k, v){
    if (this.hash[k] != null) { return; }
    while (this.total_size > this.size_limit) {
      const key_to_del = this.keys.shift();
      this.total_size -= this.hash[key_to_del].length;
      delete this.hash[key_to_del];
    }

    this.keys.push(k);
    this.hash[k] = v;
    this.total_size += v.length;
  }

  clear() {
    while (this.keys.length) { delete this.hash[this.keys.shift()]; }
    this.total_size = 0;
  }
}

module.exports.Fifo = Fifo;
