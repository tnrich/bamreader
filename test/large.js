/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const BAMReader = require(__dirname + "/../lib/bamreader.js");
let n = 0;

BAMReader.create(__dirname + "/arzedaexample.bam").on("bam", function(bam, dOffset, iOffset){
// BAMReader.create(__dirname + "/arzedaexamplesorted.bam").on("bam", function(bam, dOffset, iOffset){
// BAMReader.create(__dirname + "/large.bam").on("bam", function(bam, dOffset, iOffset){
console.log('bam.seq:',bam.seq)  
console.log('bam.cigar:',bam.cigar)  
// n++;
  // if (n !== 1) { return; }
  // console.assert(bam.qname === 'HS2000-903_160:5:1212:15649:87294');
  // console.assert(bam.flag === 99);
  // console.assert(bam.rname === "scaffold1");
  // console.assert(bam.pos === 1);
  // console.assert(bam.mapq === 49);
  // console.assert(bam.cigar.length === ("XXSXXM".length * 1024));
  // console.assert(bam.rnext === "scaffold1");
  // console.assert(bam.pnext === 474);
  // console.assert(bam.tlen === 571);
  // console.assert(bam.length === (100 * 1024));
  // console.assert(bam.qual.length === (100 * 1024));
  // console.assert(bam.multiple === true);
  // console.assert(bam.allmatches === true);
  // console.assert(bam.unmapped === false);
  // console.assert(bam.next_unmapped === false);
  // console.assert(bam.reversed === false);
  // console.assert(bam.next_reversed === true);
  // console.assert(bam.last === false);
  // console.assert(bam.secondary === false);
  // console.assert(bam.lowquality === false);
  // console.assert(bam.unique === true);
  // console.assert(bam.mismatch === 0);
  // console.assert(bam.duplicate === false);
  // console.assert(bam.supplementary === false);
  // // console.log(bam.seq, bam.qual);
  // // console.log(bam.pair); // pair bam object of the bam. To do this, indexing is needed.
  // return console.assert(bam.tagstr === "NM:i:0\tAS:i:87\tXS:i:80");
}).on("end", function() {
  console.log(n);
  // return console.assert(n === 101);
});
