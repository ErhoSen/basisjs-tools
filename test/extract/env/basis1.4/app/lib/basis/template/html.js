
 /**
  * @namespace basis.template.html
  */

  var namespace = this.path;


  //
  // import names
  //

  var document = global.document;
  var Node = global.Node;
  var domEvent = require('basis.dom.event');
  var arrayFrom = basis.array.from;
  var camelize = basis.string.camelize;
  var basisL10n = require('basis.l10n');
  var getL10nToken = basisL10n.token;
  var L10nToken = basisL10n.Token;
  var getFunctions = require('basis.template.htmlfgen').getFunctions;

  var basisTemplate = require('basis.template');
  var getL10nTemplate = basisTemplate.getL10nTemplate;
  var TemplateSwitchConfig = basisTemplate.TemplateSwitchConfig;
  var TemplateSwitcher = basisTemplate.TemplateSwitcher;
  var Template = basisTemplate.Template;

  var consts = require('./const.js');
  var TYPE_ELEMENT = consts.TYPE_ELEMENT;
  var TYPE_ATTRIBUTE = consts.TYPE_ATTRIBUTE;
  var TYPE_ATTRIBUTE_CLASS = consts.TYPE_ATTRIBUTE_CLASS;
  var TYPE_ATTRIBUTE_STYLE = consts.TYPE_ATTRIBUTE_STYLE;
  var TYPE_ATTRIBUTE_EVENT = consts.TYPE_ATTRIBUTE_EVENT;

  var TYPE_TEXT = consts.TYPE_TEXT;
  var TYPE_COMMENT = consts.TYPE_COMMENT;

  var TOKEN_TYPE = consts.TOKEN_TYPE;
  var TOKEN_BINDINGS = consts.TOKEN_BINDINGS;
  var TOKEN_REFS = consts.TOKEN_REFS;

  var ATTR_NAME = consts.ATTR_NAME;
  var ATTR_VALUE = consts.ATTR_VALUE;
  var ATTR_NAME_BY_TYPE = consts.ATTR_NAME_BY_TYPE;
  var ATTR_VALUE_INDEX = consts.ATTR_VALUE_INDEX;

  var ELEMENT_NAME = consts.ELEMENT_NAME;

  var TEXT_VALUE = consts.TEXT_VALUE;
  var COMMENT_VALUE = consts.COMMENT_VALUE;

  var CLASS_BINDING_ENUM = consts.CLASS_BINDING_ENUM;
  var CLASS_BINDING_BOOL = consts.CLASS_BINDING_BOOL;


  //
  // main part
  //

  var eventAttr = /^event-(.+)+/;
  var basisTemplateIdMarker = 'basisTemplateId_' + basis.genUID();

  // dictionaries
  var tmplEventListeners = {};
  var templates = {};

  var namespaceURI = {
    svg: 'http://www.w3.org/2000/svg'
  };

  // events
  var afterEventAction = {};
  var insideElementEvent = {};
  var MOUSE_ENTER_LEAVE_SUPPORT = 'onmouseenter' in document.documentElement;
  var CAPTURE_FALLBACK = !document.addEventListener && '__basisTemplate' + parseInt(1e9 * Math.random());
  if (CAPTURE_FALLBACK)
    global[CAPTURE_FALLBACK] = function(eventName, event){
       // trigger global handlers proceesing
      domEvent.fireEvent(document, eventName);

      // prevent twice global handlers processing
      event.returnValue = true;

      var listener = tmplEventListeners[eventName];
      if (listener)
        listener(new domEvent.Event(event));
    };

  // test for browser (IE) normalize text nodes during cloning
  var CLONE_NORMALIZATION_TEXT_BUG = (function(){
    var element = document.createElement('div');
    element.appendChild(document.createTextNode('a'));
    element.appendChild(document.createTextNode('a'));
    return element.cloneNode(true).childNodes.length == 1;
  })();

  // test for class attribute set via setAttribute bug (IE7 and lower)
  var SET_CLASS_ATTRIBUTE_BUG = (function(){
    var element = document.createElement('div');
    element.setAttribute('class', 'a');
    return !element.className;
  })();

  // test for style attribute set via setAttribute bug (IE7 and lower)
  var SET_STYLE_ATTRIBUTE_BUG = (function(){
    var element = document.createElement('div');
    element.setAttribute('style', 'position:absolute');
    return element.style.position != 'absolute';
  })();

  // test set style properties doesn't throw an error (IE8 and lower)
  var IS_SET_STYLE_SAFE = !!(function(){
    try {
      return document.documentElement.style.color = 'x';
    } catch(e) {}
  })();

  // old Firefox has no Node#contains method (Firefox 8 and lower)
  if (Node && !Node.prototype.contains)
    Node.prototype.contains = function(child){  // TODO: don't extend Node, replace for function
      return !!(this.compareDocumentPosition(child) & 16); // Node.DOCUMENT_POSITION_CONTAINED_BY = 16
    };


  // l10n
  var l10nTemplates = {};

  function getSourceFromL10nToken(token){
    var dict = token.dictionary;
    var url = dict.resource ? dict.resource.url : '';
    var id = token.name + '@' + url;
    var result = token.as(function(value){
      return token.type == 'markup'
        ? '<span data-basisjs-l10n="' + id + '">' + String(value) + '</span>'
        : '';
    });

    result.id = '{l10n:' + id + '}';
    result.url = url + ':' + token.name;

    return result;
  }

  function getL10nHtmlTemplate(token){
    if (typeof token == 'string')
      token = getL10nToken(token);

    if (!token)
      return null;

    var id = token.basisObjectId;
    var htmlTemplate = l10nTemplates[id];

    if (!htmlTemplate)
      htmlTemplate = l10nTemplates[id] = new HtmlTemplate(getSourceFromL10nToken(token));

    return htmlTemplate;
  }


  //
  // Constructs dom structure
  //

 /**
  * @func
  */
  function createEventHandler(attrName){
   /**
    * @param {basis.dom.event.Event} event
    */
    return function(event){

      // don't process right click - generaly FF problem
      if (event.type == 'click' && event.which == 3)
        return;

      var bubble = insideElementEvent[event.type] || (event.type != 'mouseenter' && event.type != 'mouseleave');
      var attrCursor = event.sender;
      var attr;

      // search for nearest node with event-{eventName} attribute
      // Note: IE events may have no event source, nothing to do in this case
      while (attrCursor)
      {
        attr = attrCursor.getAttribute && attrCursor.getAttribute(attrName);

        if (!bubble || typeof attr == 'string')
          break;

        attrCursor = attrCursor.parentNode;
      }

      // attribute found
      if (typeof attr == 'string')
      {
        // search for nearest node with basis template marker
        var cursor = attrCursor;
        var actionTarget = cursor;
        var refId;
        var tmplRef;

        if (insideElementEvent[event.type])
        {
          var relTarget = event.relatedTarget;
          if (relTarget && (cursor === relTarget || cursor.contains(relTarget)))
            cursor = null;  // prevent action processing
        }

        while (cursor)
        {
          refId = cursor[basisTemplateIdMarker];
          if (typeof refId == 'number')
          {
            // if node found, return it
            if (tmplRef = resolveInstanceById(refId))
              break;
          }
          cursor = cursor.parentNode;
        }

        if (tmplRef && tmplRef.action)
        {
          var actions = attr.trim().split(/\s+/);
          event.actionTarget = actionTarget;
          for (var i = 0, actionName; actionName = actions[i++];)
            switch (actionName)
            {
              case 'prevent-default':
                event.preventDefault();
                break;
              case 'stop-propagation':
                event.stopPropagation();
                break;
              default:
                tmplRef.action.call(tmplRef.context, actionName, event);
            }
        }
      }

      if (event.type in afterEventAction)
        afterEventAction[event.type](event, attrCursor);
    };
  }


 /**
  * Creates dom structure by declaration.
  */
  var buildHtml = function(tokens, parent){
    function emulateEvent(origEventName, emulEventName){
      regEventHandler(emulEventName);
      insideElementEvent[origEventName] = true;
      afterEventAction[emulEventName] = function(event){
        event = new domEvent.Event(event);
        event.type = origEventName;
        tmplEventListeners[origEventName](event);
      };
      afterEventAction[origEventName] = function(event, cursor){
        cursor = cursor && cursor.parentNode;
        if (cursor)
        {
          event = new domEvent.Event(event);
          event.type = origEventName;
          event.sender = cursor;
          tmplEventListeners[origEventName](event);
        }
      };
    }

    function regEventHandler(eventName){
      if (!tmplEventListeners[eventName])
      {
        tmplEventListeners[eventName] = createEventHandler('event-' + eventName);

        if (!CAPTURE_FALLBACK)
        {
          if (!MOUSE_ENTER_LEAVE_SUPPORT && eventName == 'mouseenter')
            return emulateEvent(eventName, 'mouseover');
          if (!MOUSE_ENTER_LEAVE_SUPPORT && eventName == 'mouseleave')
            return emulateEvent(eventName, 'mouseout');

          for (var i = 0, names = domEvent.browserEvents(eventName), browserEventName; browserEventName = names[i]; i++)
            domEvent.addGlobalHandler(browserEventName, tmplEventListeners[eventName]);
        }
      }
    }

    function setEventAttribute(eventName, actions){
      regEventHandler(eventName);

      // hack for non-bubble events in IE<=8
      if (CAPTURE_FALLBACK)
        result.setAttribute('on' + eventName, CAPTURE_FALLBACK + '("' + eventName + '",event)');

      result.setAttribute('event-' + eventName, actions);
    }

    function setAttribute(name, value){
      if (SET_CLASS_ATTRIBUTE_BUG && name == 'class')
        name = 'className';

      if (SET_STYLE_ATTRIBUTE_BUG && name == 'style')
        return result.style.cssText = value;

      result.setAttribute(name, value);
    }


    var result = parent || document.createDocumentFragment();

    for (var i = parent ? 4 : 0, token; token = tokens[i]; i++)
    {
      switch (token[TOKEN_TYPE])
      {
        case TYPE_ELEMENT:
          var tagName = token[ELEMENT_NAME];
          var parts = tagName.split(/:/);

          var element = parts.length > 1
            ? document.createElementNS(namespaceURI[parts[0]], tagName)
            : document.createElement(tagName);

          // precess for children and attributes
          buildHtml(token, element);

          // add to result
          result.appendChild(element);

          break;

        case TYPE_ATTRIBUTE:
          if (!token[TOKEN_BINDINGS])
            setAttribute(token[ATTR_NAME], token[ATTR_VALUE] || '');
          break;

        case TYPE_ATTRIBUTE_CLASS:
          var value = token[ATTR_VALUE_INDEX[token[TOKEN_TYPE]]];
          value = value ? [value] : [];

          if (token[TOKEN_BINDINGS])
            for (var j = 0, binding; binding = token[TOKEN_BINDINGS][j]; j++)
            {
              var defaultValue = binding[4];
              if (defaultValue)
              {
                var prefix = binding[0];
                if (Array.isArray(prefix))
                {
                  // precomputed classes
                  // bool: [['prefix_name'],'binding',CLASS_BINDING_BOOL,'name',defaultValue]
                  // enum: [['prefix_foo','prefix_bar'],'binding',CLASS_BINDING_ENUM,'name',defaultValue,['foo','bar']]
                  value.push(binding[0][defaultValue - 1]);
                }
                else
                {
                  switch (binding[2])
                  {
                    case CLASS_BINDING_BOOL:
                      // ['prefix_','binding',CLASS_BINDING_BOOL,'name',defaultValue]
                      value.push(prefix + binding[3]);
                      break;
                    case CLASS_BINDING_ENUM:
                      // ['prefix_','binding',CLASS_BINDING_ENUM,'name',defaultValue,['foo','bar']]
                      value.push(prefix + binding[5][defaultValue - 1]);
                      break;
                  }
                }
              }
            }

          value = value.join(' ').trim();
          if (value)
            setAttribute('class', value);

          break;

        case TYPE_ATTRIBUTE_STYLE:
          var attrValue = token[ATTR_VALUE_INDEX[token[TOKEN_TYPE]]];

          if (attrValue)
            setAttribute('style', attrValue);

          break;

        case TYPE_ATTRIBUTE_EVENT:
          setEventAttribute(token[1], token[2] || token[1]);
          break;

        case TYPE_COMMENT:
          result.appendChild(document.createComment(token[COMMENT_VALUE] || (token[TOKEN_REFS] ? '{' + token[TOKEN_REFS].join('|') + '}' : '')));
          break;

        case TYPE_TEXT:
          // fix bug with normalize text node in IE8-
          if (CLONE_NORMALIZATION_TEXT_BUG && i && tokens[i - 1][TOKEN_TYPE] == TYPE_TEXT)
            result.appendChild(document.createComment(''));

          result.appendChild(document.createTextNode(token[TEXT_VALUE] || (token[TOKEN_REFS] ? '{' + token[TOKEN_REFS].join('|') + '}' : '') || (token[TOKEN_BINDINGS] ? '{' + token[TOKEN_BINDINGS] + '}' : '')));
          break;
      }
    }

    // if there is only one root node, document fragment isn't required
    if (!parent && tokens.length == 1)
      result = result.firstChild;

    return result;
  };

  function resolveTemplateById(refId){
    var templateId = refId & 0xFFF;
    var object = templates[templateId];

    return object && object.template;
  }

  function resolveInstanceById(refId){
    var templateId = refId & 0xFFF;
    var instanceId = refId >> 12;
    var object = templates[templateId];

    return object && object.instances[instanceId];
  }

  function resolveObjectById(refId){
    var templateRef = resolveInstanceById(refId);

    return templateRef && templateRef.context;
  }

  function resolveTmplById(refId){
    var templateRef = resolveInstanceById(refId);

    return templateRef && templateRef.tmpl;
  }

  function getDebugInfoById(refId){
    var templateRef = resolveInstanceById(refId);

    return templateRef && templateRef.debug && templateRef.debug();
  }


  //
  // html template
  //

 /**
  * Build functions for creating instance of template.
  */
  var builder = (function(){

    var WHITESPACE = /\s+/;
    var W3C_DOM_NODE_SUPPORTED = typeof Node == 'function' && document instanceof Node;
    var CLASSLIST_SUPPORTED = global.DOMTokenList && document && document.documentElement.classList instanceof global.DOMTokenList;
    /*var TRANSITION_SUPPORTED = !!(document && (function(){
      var properties = ['webkitTransition', 'MozTransition', 'msTransition', 'OTransition', 'transition'];
      var style = document.documentElement.style;
      for (var i = 0; i < properties.length; i++)
        if (properties[i] in style)
          return true;
      return false;
    })());*/


   /**
    * @func
    */
    var bind_node = W3C_DOM_NODE_SUPPORTED
      // W3C DOM way
      ? function(domRef, oldNode, newValue){
          var newNode = newValue && newValue instanceof Node ? newValue : domRef;

          if (newNode !== oldNode)
            oldNode.parentNode.replaceChild(newNode, oldNode);

          return newNode;
        }
      // Old browsers way (IE6-8 and other)
      : function(domRef, oldNode, newValue){
          var newNode = newValue && typeof newValue == 'object' ? newValue : domRef;

          if (newNode !== oldNode)
          {
            try {
              oldNode.parentNode.replaceChild(newNode, oldNode);
            } catch(e) {
              newNode = domRef;
              if (oldNode !== newNode)
                oldNode.parentNode.replaceChild(newNode, oldNode);
            }
          }

          return newNode;
        };

   /**
    * @func
    */
    var bind_element = function(domRef, oldNode, newValue){
      var newNode = bind_node(domRef, oldNode, newValue);

      if (newNode === domRef && typeof newValue == 'string')  // TODO: save inner nodes on first innerHTML and restore when newValue is not a string
        domRef.innerHTML = newValue;

      return newNode;
    };

   /**
    * @func
    */
    var bind_comment = bind_node;

   /**
    * @func
    */
    var bind_textNode = function(domRef, oldNode, newValue){
      var newNode = bind_node(domRef, oldNode, newValue);

      if (newNode === domRef)
        domRef.nodeValue = newValue;

      return newNode;
    };

   /**
    * @func
    */
    var bind_attrClass = CLASSLIST_SUPPORTED
      // classList supported
      ? function(domRef, oldClass, newValue, anim){
          var newClass = newValue ? newValue : '';

          if (newClass != oldClass)
          {
            if (oldClass)
              domRef.classList.remove(oldClass);

            if (newClass)
            {
              domRef.classList.add(newClass);

              if (anim)
              {
                domRef.classList.add(newClass + '-anim');
                basis.nextTick(function(){
                  domRef.classList.remove(newClass + '-anim');
                });
              }
            }
          }

          return newClass;
        }
      // old browsers are not support for classList
      : function(domRef, oldClass, newValue, anim){
          var newClass = newValue ? newValue : '';

          if (newClass != oldClass)
          {
            var className = domRef.className;
            var classNameIsObject = typeof className != 'string';
            var classList;

            if (classNameIsObject)
              className = className.baseVal;

            classList = className.split(WHITESPACE);

            if (oldClass)
              basis.array.remove(classList, oldClass);

            if (newClass)
            {
              classList.push(newClass);

              if (anim)
              {
                basis.array.add(classList, newClass + '-anim');
                basis.nextTick(function(){
                  var classList = (classNameIsObject ? domRef.className.baseVal : domRef.className).split(WHITESPACE);

                  basis.array.remove(classList, newClass + '-anim');

                  if (classNameIsObject)
                    domRef.className.baseVal = classList.join(' ');
                  else
                    domRef.className = classList.join(' ');
                });
              }
            }

            if (classNameIsObject)
              domRef.className.baseVal = classList.join(' ');
            else
              domRef.className = classList.join(' ');
          }

          return newClass;
        };

   /**
    * @func
    */
    var bind_attrStyle = IS_SET_STYLE_SAFE
      ? function(domRef, propertyName, oldValue, newValue){
          if (oldValue !== newValue)
            domRef.style[camelize(propertyName)] = newValue;

          return newValue;
        }
      : function(domRef, propertyName, oldValue, newValue){
          if (oldValue !== newValue)
          {
            try {
              domRef.style[camelize(propertyName)] = newValue;
            } catch(e){
            }
          }

          return newValue;
        };

   /**
    * @func
    */
    var bind_attr = function(domRef, attrName, oldValue, newValue){
      if (oldValue !== newValue)
      {
        if (newValue)
          domRef.setAttribute(attrName, newValue);
        else
          domRef.removeAttribute(attrName);
      }

      return newValue;
    };

   /**
    * @func
    */
    function updateAttach(){
      this.set(this.name, this.value);
    }

   /**
    * @func
    */
    function resolveValue(bindingName, value, Attaches){
      var bridge = value && value.bindingBridge;
      var oldAttach = this.attaches && this.attaches[bindingName];
      var tmpl = null;

      if (bridge || oldAttach)
      {
        if (bridge)
        {
          if (!oldAttach || value !== oldAttach.value)
          {
            if (oldAttach)
            {
              if (oldAttach.tmpl)
              {
                // FIX ME
                oldAttach.tmpl.element.toString = null;
                getL10nHtmlTemplate(oldAttach.value).clearInstance(oldAttach.tmpl);
              }

              oldAttach.value.bindingBridge.detach(oldAttach.value, updateAttach, oldAttach);
            }

            if (value.type == 'markup' && value instanceof L10nToken)
            {
              var template = getL10nHtmlTemplate(value);
              var context = this.context;
              var bindings = this.bindings;
              var bindingInterface = this.bindingInterface;
              tmpl = template.createInstance(context, null, function onRebuild(){
                tmpl = newAttach.tmpl = template.createInstance(context, null, onRebuild, bindings, bindingInterface);
                tmpl.element.toString = function(){
                  return value.value;
                };
                updateAttach.call(newAttach);
              }, bindings, bindingInterface);
              tmpl.element.toString = function(){
                return value.value;
              };
            }

            if (!this.attaches)
              this.attaches = new Attaches;

            var newAttach = this.attaches[bindingName] = {
              name: bindingName,
              value: value,
              tmpl: tmpl,
              set: this.tmpl.set
            };

            bridge.attach(value, updateAttach, newAttach);
          }
          else
            tmpl = value && value.type == 'markup' ? oldAttach.tmpl : null;

          if (tmpl)
            return tmpl.element;

          value = bridge.get(value);
        }
        else
        {
          if (oldAttach)
          {
            if (oldAttach.tmpl)
            {
              // FIX ME
              oldAttach.tmpl.element.toString = null;
              getL10nHtmlTemplate(oldAttach.value).clearInstance(oldAttach.tmpl);
            }

            oldAttach.value.bindingBridge.detach(oldAttach.value, updateAttach, oldAttach);
            this.attaches[bindingName] = null;
          }
        }
      }

      return value;
    }

   /**
    * @func
    */
    function createBindingUpdater(names, getters){
      var name1 = names[0];
      var name2 = names[1];
      var getter1 = getters[name1];
      var getter2 = getters[name2];

      switch (names.length) {
        case 1:
          return function bindingUpdater1(object){
            this(name1, getter1(object));
          };

        case 2:
          return function bindingUpdater2(object){
            this(name1, getter1(object));
            this(name2, getter2(object));
          };

        default:
          var getters_ = names.map(function(name){
            return getters[name];
          });
          return function bindingUpdaterN(object){
            for (var i = 0; i < names.length; i++)
              this(names[i], getters_[i](object));
          };
      };
    }

    function makeHandler(events, getters){
      for (var name in events)
        events[name] = createBindingUpdater(events[name], getters);

      return name ? events : null;
    }

   /**
    * @func
    */
    function createBindingFunction(keys){
      var bindingCache = {};

     /**
      * @param {object} bindings
      */
      return function getBinding(bindings, obj, set, bindingInterface){
        if (!bindings)
          return {};

        var cacheId = 'bindingId' in bindings ? bindings.bindingId : null;

        /** @cut */ if (!cacheId)
        /** @cut */   basis.dev.warn('basis.template.Template.getBinding: bindings has no bindingId property, cache is not used');

        var result = bindingCache[cacheId];

        if (!result)
        {
          var names = [];
          var getters = {};
          var events = {};

          for (var i = 0, bindingName; bindingName = keys[i]; i++)
          {
            var binding = bindings[bindingName];
            var getter = binding && binding.getter;

            if (getter)
            {
              getters[bindingName] = getter;
              names.push(bindingName);

              if (binding.events)
              {
                var eventList = String(binding.events).trim().split(/\s+|\s*,\s*/);

                for (var j = 0, eventName; eventName = eventList[j]; j++)
                {
                  if (events[eventName])
                    events[eventName].push(bindingName);
                  else
                    events[eventName] = [bindingName];
                }
              }
            }
          }

          result = {
            names: names,
            sync: createBindingUpdater(names, getters),
            handler: makeHandler(events, getters)
          };

          if (cacheId)
            bindingCache[cacheId] = result;
        }

        if (obj && set)
          result.sync.call(set, obj);

        if (!bindingInterface)
          return;

        if (result.handler)
          bindingInterface.attach(obj, result.handler, set);

        return result.handler;
      };
    }

    var tools = {
      bind_textNode: bind_textNode,
      bind_node: bind_node,
      bind_element: bind_element,
      bind_comment: bind_comment,
      bind_attr: bind_attr,
      bind_attrClass: bind_attrClass,
      bind_attrStyle: bind_attrStyle,
      resolve: resolveValue,
      l10nToken: getL10nToken,
      createBindingFunction: createBindingFunction
    };

    return function(tokens){
      var fn = getFunctions(tokens, true, this.source.url, tokens.source_, !CLONE_NORMALIZATION_TEXT_BUG, basisTemplateIdMarker);
      var createInstance;
      var instances = {};
      var l10nMap = {};
      var l10nLinks = [];
      var l10nMarkupTokens = [];
      var seed = 0;
      var proto = buildHtml(tokens);
      var id = this.templateId;

      templates[id] = {
        template: this,
        instances: instances
      };

      if (fn.createL10nSync)
      {
        var l10nProtoSync = fn.createL10nSync(proto, l10nMap, bind_attr, CLONE_NORMALIZATION_TEXT_BUG);

        if (fn.l10nKeys)
          for (var i = 0, key; key = fn.l10nKeys[i]; i++)
          {
            var token = getL10nToken(key);
            var link = {
              path: key,
              token: token,
              handler: function(value){
                var isMarkup = this.token.type == 'markup';

                if (isMarkup)
                  basis.array.add(l10nMarkupTokens, this);
                else
                  basis.array.remove(l10nMarkupTokens, this);

                l10nProtoSync(this.path, isMarkup ? null : value);
                for (var key in instances)
                  instances[key].tmpl.set(this.path, isMarkup ? this.token : value);
              }
            };
            link.token.attach(link.handler, link);
            l10nLinks.push(link);

            if (token.type == 'markup')
            {
              l10nMarkupTokens.push(link);
              l10nProtoSync(key, null);
            }
            else
            {
              l10nProtoSync(key, token.value);
            }

            link = null;
            token = null;
          }
      }

      createInstance = fn.createInstance(id, instances, proto, tools, l10nMap, CLONE_NORMALIZATION_TEXT_BUG);

      return {
        createInstance: function(obj, onAction, onRebuild, bindings, bindingInterface){
          var instanceId = seed++;
          var instance = createInstance(instanceId, obj, onAction, onRebuild, bindings, bindingInterface);

          for (var i = 0, len = l10nMarkupTokens.length; i < len; i++)
            instance.tmpl.set(l10nMarkupTokens[i].path, l10nMarkupTokens[i].token);

          instances[instanceId] = instance;

          return instance.tmpl;
        },
        destroyInstance: function(tmpl){
          var instanceId = tmpl.templateId_;
          var instance = instances[instanceId];

          if (instance)
          {
            // detach handler if any
            if (instance.handler)
              instance.bindingInterface.detach(instance.context, instance.handler, instance.tmpl.set);

            // detach attaches
            for (var key in instance.attaches)
              resolveValue.call(instance, key, null);

            delete instances[instanceId];
          }
        },

        keys: fn.keys,
        /** @cut */ instances_: instances,

        destroy: function(rebuild){
          for (var i = 0, link; link = l10nLinks[i]; i++)
            link.token.detach(link.handler, link);

          for (var key in instances)
          {
            var instance = instances[key];

            if (rebuild && instance.rebuild)
              instance.rebuild.call(instance.context);

            if (!rebuild || key in instances)
            {
              // detach handler if any
              if (instance.handler)
                instance.bindingInterface.detach(instance.context, instance.handler, instance.tmpl.set);

              // detach attaches
              for (var key in instance.attaches)
                resolveValue.call(key, null);
            }
          }

          if (templates[id] && templates[id].instances === instances)
            delete templates[id];

          fn = null;
          proto = null;
          l10nMap = null;
          l10nLinks = null;
          l10nProtoSync = null;
          instances = null;
        }
      };
    };
  })();

 /**
  * @class
  */
  var HtmlTemplate = Template.subclass({
    className: namespace + '.Template',

    __extend__: function(value){
      if (value instanceof HtmlTemplate)
        return value;

      if (value instanceof TemplateSwitchConfig)
        return new HtmlTemplateSwitcher(value);

      return new HtmlTemplate(value);
    },

    builder: builder
  });


 /**
  * @class
  */
  var HtmlTemplateSwitcher = TemplateSwitcher.subclass({
    className: namespace + '.TemplateSwitcher',

    templateClass: HtmlTemplate
  });


  //
  // exports name
  //

  module.exports = {
    marker: basisTemplateIdMarker,

    Template: HtmlTemplate,
    TemplateSwitcher: HtmlTemplateSwitcher
  };

  //
  // for backward capability
  // TODO: remove
  //
  basis.namespace('basis.template').extend({
    /** @cut using only in dev mode */ getDebugInfoById: getDebugInfoById,

    buildHtml: buildHtml,

    resolveTemplateById: resolveTemplateById,
    resolveObjectById: resolveObjectById,
    resolveTmplById: resolveTmplById
  });
