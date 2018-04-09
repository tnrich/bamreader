/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const BAMReader = module.exports;
const arrayize = function(v, empty) {
  if (Array.isArray(v)) { return v; } else if (empty && (v == null)) { return []; } else { return [v]; }
};

const parse_query = function(file, setting){
  // 1. initializing
  let e, file_setting, on_bam, reader;
  if (setting == null) { setting = {}; }
  try {
    file_setting = require(file);
  } catch (error) {
    e = error;
    console.error(`${file} : no such file.`);
    return;
  }

  if (!file_setting) {
    console.error(`${file} : invalid format.`);
    return;
  }

  setting.__proto__ = file_setting; // arg setting is prior to file setting

  try {
    reader = BAMReader.create(setting.file);
  } catch (error1) {
    e = error1;
    console.error(`${setting.file} : no such file.`);
    return;
  }

  // 2. preparing "on_bam" function
  if (typeof setting.query === "function") {
    const q = setting.query;
    on_bam = function(bam){ if (q(bam)) { return output(bam); } };
  } else if (setting.query != null) {
    let condition, k, v;
    const queries = arrayize(setting.query);
    const conditions = [];
    const conds = {};

    for (let query of Array.from(queries)) {
      condition = {};
      for (k in query) {
        v = query[k];
        if (typeof v === "object") {
          for (let cond_name in v) {
            const v_cond = v[cond_name];
            if (!conditions[cond_name]) { conditions[cond_name] = {}; }
            conditions[cond_name][k] = v_cond;
          }
        } else {
          if (!condition.equal) { condition.equal = {}; }
          condition.equal[k] = v;
        }
      }
      conditions.push(condition);
    }

    on_bam = function(bam){
      for (condition of Array.from(conditions)) {
        for (k in condition.equal) {
          v = condition.equal[k];
          if (bam[k] !== v) { break; }
        }
        for (k in condition.greater_than) {
          v = condition.greater_than[k];
          if (bam[k] <= v) { break; }
        }
        for (k in condition.greater_equal) {
          v = condition.greater_equal[k];
          if (bam[k] <  v) { break; }
        }
        for (k in condition.less_than) {
          v = condition.less_than[k];
          if (bam[k] >= v) { break; }
        }
        for (k in condition.less_equal) {
          v = condition.less_equal[k];
          if (bam[k] >  v) { break; }
        }
        for (k in condition.values) {
          v = condition.values[k];
          if (bam[k] >  v) { break; }
        }
        return output(bam);
      }
    };

  } else {
    console.error("query is required.");
    return;
  }

  // 3. output
  const outstream = process.stdout;
  if (!setting.output) { setting.output = "sam"; }
  switch (setting.output) {
    case "sam":
      var output = bam=> outstream.write(bam.sam + "\n");
      break;
    case "bam":
      var samtools = require("child_process").spawn("samtools", ["view", "-Sb", "-"]);
      var wstream = samtools.stdin;
      samtools.stdout.pipe(outstream);
      output = bam=> wstream.write(bam.sam + "\n");
      break;
    case "fastq":
      var dna = require("dna");
      output = bam=> dna.writeFastq(bam.qname, bam.seq, bam.qual, outstream);
      break;
    case "fastq":
      break;
    default:
      console.log(`unknown output type: ${setting.output}`);
      return;
  }
  
  // 4. native or samtools
  const method_name = setting.native ? "iterate" : "samtools";

  // 5. run
  let n_process = parseInt(setting.process);
  if (isNaN(n_process || (n_process < 1))) { n_process = 1; }

  return reader[method_name]({
    num: n_process,
    bam: on_bam
  });
};
