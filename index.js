"use strict";
var async = require('async');
var util = require('util');
var path = require('path');
require('colors');
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;
var qw = console.log;

function ModuleLoader() {
}
util.inherits(ModuleLoader, EventEmitter);
ModuleLoader.prototype.$configure = function (a) {
    this.$config = a;
    if (!this.$config.DEBUG) {//enable logging in debug mode only
        qw = function () {
        }
    }
    this.$config.App = this.$config.App || {};
    this.$config.App.classLoader = this.$config.App.classLoader || {};
    this.packages = [];
    this.modules = {};
    this.moduleAliases = this.$config.App.alias || {};
    console.log('alias:', this.moduleAliases);
};
ModuleLoader.prototype.setPackage = function (p) {
    this.packages.push(p);
};
ModuleLoader.prototype.$datasource = function () {
};
ModuleLoader.prototype.$run = function () {
    var self = this;
    var onAppLoadedCallback;
    async.eachSeries(arguments, function (i, cb) {
        //так как каждый модуль может тянуть зависимости, обходим их рекурсивно
        if (typeof i === "function") {
            onAppLoadedCallback = i;
            cb();
            return;
        }
        if (typeof i !== "string") {
            throw new Error('pass module names in $run method');
        }
        $resolve_recursive(i, cb);
    }, function (err) {
        console.log('load done'.greenBG, 'errors:', err ? err : 'none');
        console.log(self.getModulesNames());
        onAppLoadedCallback && onAppLoadedCallback(err);
    });

    function $resolve_recursive(curModuleName, onThisModuleInstatiatedCallback) {
        console.log('resolving', curModuleName);
        var module = self.modules[curModuleName];
        if (module) {    //if module is already instantiated
            console.log('resolving', curModuleName, 'already loaded');
            onThisModuleInstatiatedCallback(null, module);
            return;
        }
        //смотрим зависимости и грузим их
        var pth = self.$config.App.classLoader[curModuleName];
        var packagesDefined = self.packages;
        //iterate over packages
        var curPackage = packagesDefined[0];


        //проходим по каждой зависимости и если она еще не разрешена, грузим с учетом её зависимостей
        // console.log(indexPath);
        //если есть переопределение для модуля, заменяем класс
        var alias = self.moduleAliases[curModuleName];
        var moduleClassnameToLoad = curModuleName;
        if (alias) {
            moduleClassnameToLoad = alias;
        }
        //return from node_modules/module-loader
        var indexPath = pth ? path.join('../', pth) : "../../" + path.join(curPackage, moduleClassnameToLoad + '.js');
        var constructor;
        try {
            constructor = require(moduleClassnameToLoad);
        } catch (e) {
            //  console.log("loading from node_modules", e.code, curModuleName);
            constructor = require(indexPath);
        }
        var dependenciesNames = getParamNames(constructor);
        console.log(curModuleName, 'deps', dependenciesNames);
        var dependencies = [];
        var moduleConfig = {};
        async.eachSeries(dependenciesNames, function (dependencyName, onDependencyLoadedCallback) {
            console.log('processing dependency', dependencyName, 'of', curModuleName);
            if (dependencyName === '$config') {
                moduleConfig = self.$config[curModuleName];
                dependencies.push(moduleConfig);
                onDependencyLoadedCallback(null, moduleConfig);
            } else {
                $resolve_recursive(dependencyName, function (err, dependencyModule) {
                    self.modules[dependencyName] = dependencyModule;
                    dependencies.push(dependencyModule);
                    onDependencyLoadedCallback(null, dependencyModule);
                });
            }
        }, function () {
//готовы все зависимости текущего модуля
            var instance = applyToConstructor(constructor, dependencies);
            instance.$root = self;
            instance.$config = moduleConfig;
            self.modules[curModuleName] = instance;
            typeof instance.$run === "function" && instance.$run();
            console.log('module', curModuleName, 'prepared', self.getModulesNames());
            onThisModuleInstatiatedCallback(null, instance)
        });
    }
};

ModuleLoader.prototype.$module = function (name) {
    var m = this.modules[name];
    if (!m) {
        throw new Error('no module ' + name)
    }
    return m;
};
ModuleLoader.prototype.$addModule = function (instance, name) {
    var m = this.modules[name];
    if (!m) {
        qw('adding', name);
        this.modules[name] = instance;
    } else {
        qw('module', name, 'already loaded')
    }
};
ModuleLoader.prototype.getModulesNames = function () {
    return Object.keys(this.modules);
};
ModuleLoader.prototype.getConfig = function (module) {
    var config;
    if (typeof module === "string") {
        qw('getting config for ', module);
        return this.$config[module] || {};
    }
    //если передали модуль в качестве параметра
    return module.$config || {};
};

function applyToConstructor(constructor, argArray) {
    var args = [null].concat(argArray);
    var factoryFunction = constructor.bind.apply(constructor, args);
    return new factoryFunction();
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

module.exports = ModuleLoader;
