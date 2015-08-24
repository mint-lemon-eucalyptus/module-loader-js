"use strict";
var async = require('async');
var util = require('util');
var path = require('path');
var underscore = require('underscore');
var EventEmitter = require('events').EventEmitter;
var qw;

function Module() {
}
util.inherits(Module, EventEmitter);
Module.prototype.$configure = function (a) {
    this.$config = a;
    this.$config.App = this.$config.App || {};
    this.$config.App.classLoader = this.$config.App.classLoader || {};
}
Module.prototype.$run = function () {
    var self = this;
    var stack = [];
    this.modules = {};
    var constructors = {};
    var counter = 0;
    for (var i in arguments) {
        var depName = arguments[i];
        if (typeof depName === "string") {
            $resolve_recursive(depName);
        }
    }

    function $instantiate(depName) {
        var constructor = constructors[depName];
        var dependencies = getParamNames(constructor);
        var argsArray = dependencies.map(function (dep) {
            if (dep !== '$config') {
                return self.modules[dep];
            } else {
                return self.getConfig(depName);
            }
        });

        var instance = applyToConstructor(constructor, argsArray);
        instance.$root = self;
        instance.$config = self.getConfig(depName);
        self.modules[depName] = instance;

        instance.$run ? instance.$run() : false;
        instance.$test ? instance.$test() : false;
    };
    while (stack.length > 0) {
        $instantiate(stack.pop());
    }
    qw = self.modules['Qw'].log(this);
    qw('after processing', Object.keys(self.modules));

    function $resolve_recursive(curModuleName) {
//        qw('processing:', curModuleName);
        if (!underscore.find(stack, function (dep) {    //if this module was not defined
                return dep === curModuleName;
            })) {
            stack.push(curModuleName);//add it
        } else {//if defined as dependency in another module
            stack = underscore(stack).filter(function (item) {
                return item !== curModuleName;
            });
            stack.push(curModuleName);//add it to the end of dependency sequence
        }

        var pth = self.$config.App.classLoader[curModuleName];
        var indexPath = pth ? path.join('../', pth) : path.join('../modules/', curModuleName, 'index.js');
        var constructor = require(indexPath);
        constructors[curModuleName] = constructor;
        var dependenciesNames = getParamNames(constructor);
        //      qw(curModuleName, 'deps', dependenciesNames);
        dependenciesNames.forEach(function (i) {
            if (i === '$config') {
                return;
            }
            //        qw(i);
            ++counter;
            $resolve_recursive(i);
        });

    }

    function dummy() {
    }
}

Module.prototype.$module = function (name) {
    var m = this.modules[name];
    if (!m) {
        throw new Error('no module ' + name)
    }
    return m;
}
Module.prototype.getModulesNames = function () {
    return Object.keys(this.modules);
}
Module.prototype.getConfig = function (module) {
    var config;
    if (typeof module === "string") {
        return this.$config[module] || {};
    }
    var moduleName = getObjectClass(module);
    config = this.$config[moduleName];
    if (!config) {
        qw('warning! config entry is not found:'.yellow, moduleName);
        config = {};
    }
    return config;
}
Module.prototype.$logger = function (a) {//todo argument must be instance of module, not a function(aka Qw)!!!
    if (a) {
        this.$logger = a;
    } else {
        return this.$logger
    }
}


function applyToConstructor(constructor, argArray) {
    var args = [null].concat(argArray);
    var factoryFunction = constructor.bind.apply(constructor, args);
    return new factoryFunction();
}
function bindConstruct(fn) {
    // since constructor always accepts a static this value
    // so bindConstruct cannot specify this
    var extraArgs = [].slice.call(arguments, 1);

    // create a 'subclass' of fn
    function sub() {
        var args = extraArgs.concat([].slice.call(arguments));
        fn.apply(this, args);
    }

    sub.prototype = fn.prototype;
    sub.prototype.constructor = sub;

    return sub;
}
function getObjectClass(obj) {  //is used by identifying Caller class
    if (obj && obj.constructor && obj.constructor.toString) {
        var arr = obj.constructor.toString().match(
            /function\s*(\w+)/);
        if (arr && arr.length == 2) {
            return arr[1];
        }
    }
    return undefined;
}
function getParamNames(func) {
    var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
    var ARGUMENT_NAMES = /([^\s,]+)/g;
    var fnStr = func.toString().replace(STRIP_COMMENTS, '');
    var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
    if (result === null)
        result = [];
    return result;
}


/**
 * Gets the classname of an object or function if it can.  Otherwise returns the provided default.
 *
 * Getting the name of a function is not a standard feature, so while this will work in many
 * cases, it should not be relied upon except for informational messages (e.g. logging and Error
 * messages).
 *
 * @private
 */
function className(object, defaultName) {
    var nameFromToStringRegex = /^function\s?([^\s(]*)/;
    var result = "";
    if (typeof object === 'function') {
        result = object.name || object.toString().match(nameFromToStringRegex)[1];
    } else if (typeof object.constructor === 'function') {
        result = className(object.constructor, defaultName);
    }
    return result || defaultName;
}
Module.prototype.EVENT_BOOTSTRAP_DONE = 'EVENT_BOOTSTRAP_DONE';

module.exports = Module;
