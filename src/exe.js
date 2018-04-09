/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path');
const fs   = require('fs');
const lib  = path.join(path.dirname(fs.realpathSync(__filename)), '../lib');
const BAMReader = require(lib + '/bamreader.js');

const main = function() {
  try {
    const ap = require("argparser")
      .nums("p")
      .nonvals("debug", "c", "help")
      .defaults({p: 2})
      .parse();

    if (ap.opt("help")) { return showUsage(true); }

    if (!ap.arg(0)) { throw {message: "bam file is required."}; }
    const bamfile = require("path").resolve(ap.arg(0));
    if (!fs.existsSync(bamfile)) { throw {message: `'${bamfile}': no such file.`}; }

    const debug = ap.opt("debug");
    // create index file
    if (ap.opt("c")) {
      const num = ap.opt("p");
      const reader = BAMReader.create(bamfile, {nodic: true});
      return reader.createDic({num, debug});
    } else {
      return BAMReader.parse_query(ap.arg(0), ap.opt());
    }

  } catch (e) {
    console.error(e.message);
    return showUsage();
  }
};

var showUsage = out=>
  console[out ? "log" : "error"](`\
[USAGE]
 [query]
\tbamreader <query file>

 [create dic]
\tbamreader [memory-size(MB)] -c <bam file> [-p #process] [--debug]
\tdefault of #process : 2
\t\t<examples>
\t\tbamreader -c foo.bam -p 14
\t\tbamreader 4000 -c bar.bam -p 8 --debug

 [show usage]
\tbamreader --help\
`
  )
;

main();
