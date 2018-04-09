/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
require("bamreader").create(process.argv[2]).samtools(function(bam){});
  //console.log bam.rname

require("bamreader").read(process.argv[2], bam=> console.log(bam.tlen));
