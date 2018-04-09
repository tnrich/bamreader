console.time("native");
require("bamreader").create(process.argv[2]).fork({
  num: 1,
  bam(bam){},
    // bam.unmapped
    // bam.seq
    // bam.qual
    // bam.cigar
    // bam.tagstr
    //bam.sam
  finish() {
    console.timeEnd("native");
    return plain();
  }
});

var plain = function() {
  console.time("plain");
  return require("bamreader").create(process.argv[2]).fork({
    num: 1,
    bam(bam){},
    finish() {
      return console.timeEnd("plain");
    }
  });
};

const samtools = function() {
  console.time("samtools");
  return require("bamreader").create(process.argv[2]).fork_samtools({
    num: 1,
    bam(bam){},
      // bam.qname
      // bam.unmapped
      // bam.seq
      // bam.qual
      // bam.sam
      //console.log bam.tagstr
    finish() {
      return console.timeEnd("samtools");
    }
  });
};
