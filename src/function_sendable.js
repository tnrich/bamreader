/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// make functions sendable
const BAMReader = module.exports;
const vm = require("vm");

var makeSendable = function(o){
  const objs = [];
  const funcs = [];
  for (let k in o) {
    const v = o[k];
    if ((typeof v === "object") && !Array.isArray(v && !Array.from(objs).includes(v))) {
      objs.push(v);
      makeSendable(v);
    } else if (typeof v === "function") {
      o[k] = v.toString();
      funcs.push(k);
    }
  }
  return o._funcs = funcs;
};
 
// parse sendable
var parseSendable = function(o, scope, context){
  let k, v;
  if (!context) {
    for (k in global) {
      v = global[k];
      scope[k] = v;
    }
    scope.BAMReader = BAMReader;
    scope.require = require;
    scope.fs = require("fs");
    context = vm.createContext(scope);
  }

  if (Array.isArray(o._funcs)) {
    for (k of Array.from(o._funcs)) {
      //o[k] = eval("(#{o[k]})")
      o[k] = vm.runInContext(`(${o[k]})`, context);
    }
    delete o._funcs;
  }
  return (() => {
    const result = [];
    for (k in o) {
      v = o[k];
      if (Array.isArray(v._funcs)) { result.push(parseSendable(v, null, context)); } else {
        result.push(undefined);
      }
    }
    return result;
  })();
};

BAMReader.makeSendable  = makeSendable;
BAMReader.parseSendable = parseSendable;
