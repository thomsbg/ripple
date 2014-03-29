var emitter = require('emitter');
var model = require('./model');
var Bindings = require('./bindings');
var each = require('each');

/**
 * Get a node using element the element itself
 * or a CSS selector
 *
 * @param {Element|String} node
 *
 * @return {Element}
 */
function getNode(node) {
  if(typeof node === 'string') {
    node = document.querySelector(node);
    if(!node) throw new Error('DOM node doesn\'t exist');
  }
  return node;
}

module.exports = function(template) {

  /**
   * Stores all of the directives, views,
   * filters etc. that we might want to share
   * between views.
   *
   * @type {Bindings}
   */
  var bindings = new Bindings();

  /**
   * Stores the state of the view.
   *
   * @type {Function}
   */
  var Model = model();

  /**
   * The default initialize function
   *
   * @param {Object} options
   *
   * @return {Object} The default state
   */
  var init = function(options) {
    return options.data;
  };

  /**
   * The view controls the lifecycle of the
   * element that it creates from a template.
   * Each element can only have one view and
   * each view can only have one element.
   */
  function View(options) {
    options = options || {};
    View.emit('construct', this, [options]);
    this.options = options;
    this.children = [];
    this.template = template;
    this.owner = options.owner;
    this.bindings = options.bindings || bindings;
    this.root = this;
    if(this.owner) {
      this.owner.children.push(this);
      this.root = this.owner.root;
    }
    this.scope = options.scope;
    this.scopeWatchers = {};
    this.model = new Model(init(options));
    this.data = this.model.props;
    View.emit('created', this);
    this.el = this.render();
    View.emit('ready', this);
  }

  /**
   * Mixins
   */
  emitter(View);
  emitter(View.prototype);

  /**
   * Add a directive
   *
   * @param {String|Regex} match
   * @param {Function} fn
   *
   * @return {View}
   */
  View.directive = function(match, fn) {
    bindings.directive(match, fn);
    return this;
  };

  /**
   * Add a component
   *
   * @param {String} match
   * @param {Function} fn
   *
   * @return {View}
   */
  View.compose = function(name, Child) {
    bindings.component(name, Child);
    return this;
  };

  /**
   * Add interpolation filter
   *
   * @param {String} name
   * @param {Function} fn
   *
   * @return {View}
   */
  View.filter = function(name, fn) {
    bindings.filter(name, fn);
    return this;
  };

  /**
   * Use a plugin
   *
   * @return {View}
   */
  View.use = function(fn, options){
    fn(View, options);
    return this;
  };

  /**
   * Create helper methods for binding to events
   */
  ['construct', 'created', 'ready', 'mounted', 'unmounted', 'destroy'].forEach(function(name){
    View[name] = function(fn){
      View.on(name, function(view, args){
        fn.apply(view, args);
      });
    };
  });

  /**
   * Set the initial state of the view. Accepts
   * a function that should return an object
   * that will be used for the initial state.
   */
  View.initialize = function(fn) {
    init = fn;
    return this;
  };

  /**
   * Set the state off the view. This will trigger
   * refreshes to the UI. If we were previously
   * watching the parent scope for changes to this
   * property, we will remove all of those watchers
   * and then bind them to our model instead.
   *
   * @param {Object} obj
   */
  View.prototype.set = function(key, value) {
    if( typeof key !== 'string' ) {
      for(var name in key) this.set(name, key[name]);
      return this;
    }
    if(this.scope && this.scopeWatchers[key]) {
      var self = this;
      this.scopeWatchers[key].forEach(function(callback){
        self.scope.unwatch(key, callback);
        self.model.watch(key, callback);
      });
      delete this.scopeWatchers[key];
    }
    this.model.set(key, value);
    return this;
  };

  /**
   * Get some data
   *
   * @param {String} key
   */
  View.prototype.get = function(key) {
    var value = this.model.get(key);
    if(value === undefined && this.scope) {
      return this.scope.get(key);
    }
    return value;
  };

  /**
   * Remove the element from the DOM
   *
   * @return {View}
   */
  View.prototype.destroy = function() {
    var self = this;
    this.emit('destroy');
    this.remove();
    this.model.destroy();
    this.off();
    this.children.forEach(function(child){
      child.destroy();
    });
    if(this.owner) {
      var index = this.owner.children.indexOf(this);
      this.owner.children.splice(index, 1);
    }
    each(this.scopeWatchers, function(key, callbacks){
      callbacks.forEach(function(callback){
        self.scope.unwatch(key, callback);
      });
    });
    this.scopeWatchers = null;
    this.scope = null;
    this.el = null;
    this.owner = null;
    this.root = null;
    this.data = null;
    View.emit('destroy', this);
  };

  /**
   * Is the view mounted in the DOM
   *
   * @return {Boolean}
   */
  View.prototype.isMounted = function(){
    return this.el != null && this.el.parentNode != null;
  };

  /**
   * Render the view to an element. This should
   * only ever render the element once.
   *
   * @return {View}
   */
  View.prototype.render = function(){
    return this.bindings.bind(this);
  };

  /**
   * Mount the view onto a node
   *
   * @param {Element|String} node An element or CSS selector
   *
   * @return {View}
   */
  View.prototype.appendTo = function(node) {
    getNode(node).appendChild(this.el);
    View.emit('mounted', this);
    return this;
  };

  /**
   * Replace an element in the DOM with this view
   *
   * @param {Element|String} node An element or CSS selector
   *
   * @return {View}
   */
  View.prototype.replace = function(node) {
    node.parentNode.replaceChild(this.el, getNode(node));
    View.emit('mounted', this);
    return this;
  };

  /**
   * Insert the view before a node
   *
   * @param {Element|String} node
   *
   * @return {View}
   */
  View.prototype.before = function(node) {
    node.parentNode.insertBefore(this.el, getNode(node));
    View.emit('mounted', this);
    return this;
  };

  /**
   * Insert the view after a node
   *
   * @param {Element|String} node
   *
   * @return {View}
   */
  View.prototype.after = function(node) {
    var target = getNode(node);
    if(target.nextSibling) {
      node.parentNode.insertBefore(this.el, target.nextSibling);
      View.emit('mounted', this);
    }
    else {
      this.mount(node.parentNode);
    }
    return this;
  };

  /**
   * Remove the view from the DOM
   *
   * @return {View}
   */
  View.prototype.remove = function(){
    if(this.isMounted() === false) return this;
    this.el.parentNode.removeChild(this.el);
    View.emit('unmounted', this);
    return this;
  };

  /**
   * Interpolate a string
   *
   * @param {String} str
   */
  View.prototype.interpolate = function(str) {
    return this.bindings.interpolator.value(str, {
      context: this,
      scope: this.data
    });
  };

  /**
   * Watch a property for changes
   *
   * @param {Strign} prop
   * @param {Function} callback
   */
  View.prototype.watch = function(prop, callback) {
    var self = this;
    if(Array.isArray(prop)) {
      return prop.forEach(function(name){
        self.watch(name, callback);
      });
    }
    var value = this.model.get(prop);
    if(value === undefined && this.scope) {
      this.scope.watch(prop, callback);
      if(!this.scopeWatchers[prop]) {
        this.scopeWatchers[prop] = [];
      }
      this.scopeWatchers[prop].push(callback);
      return;
    }
    return this.model.watch(prop, callback);
  };

  /**
   * Stop watching a property
   *
   * @param {Strign} prop
   * @param {Function} callback
   */
  View.prototype.unwatch = function(prop, callback) {
    var self = this;
    if(Array.isArray(prop)) {
      return prop.forEach(function(name){
        self.unwatch(name, callback);
      });
    }
    var value = this.model.get(prop);
    if(value === undefined && this.scope) {
      this.scope.unwatch(prop, callback);
      if(!this.scopeWatchers[prop]) return;
      var index = this.scopeWatchers[prop].indexOf(callback);
      this.scopeWatchers[prop].splice(index, 1);
      return;
    }
    return this.model.unwatch(prop, callback);
  };

  return View;
};