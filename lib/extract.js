'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Extractor = undefined;

var _defineProperty2 = require('babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var fs = require('fs');
var parse5 = require('parse5');

var _require = require('gettext-extractor'),
    GettextExtractor = _require.GettextExtractor,
    JsExtractors = _require.JsExtractors;

var gettextExtractor = new GettextExtractor();
var deepmerge = require('deepmerge');
var path = require('path');
var upath = require('upath');
var globby = require('globby');
var wait = require('wait-for-stuff');
var EventEmitter = require('events');
var colors = require('colors');
var Vue = require('vue/dist/vue.js');
var renderer = require('vue-server-renderer').createRenderer();

process.env.NODE_ENV = 'production';
Vue.config.silent = true;
/* eslint-disable no-new */
/* eslint-disable no-unused-vars */
var _vue = new Vue({
  template: '<div></div>'
});

var defaultConfiguration = {
  verbose: false,
  startDelim: '{{',
  endDelim: '}}',
  translateTag: 'translate',
  directiveName: 'v-translate',
  attributes: {
    plural: 't-plural',
    n: 't-n',
    context: 't-context',
    comment: 't-comment'
  },
  commentKeyword: 't',
  underscoreAlias: false,
  // JavaScript gettext extract expressions:
  // CONTEXT + STRING + PLURAL: npgettext( MSGCTXT, MSGID, MSGID_PLURAL, COUNT )
  // STRING + PLURAL: ngettext( MSGID, MSGID_PLURAL, COUNT )
  // CONTEXT + STRING: pgettext( MSGCTXT, MSGID )
  // STRING: gettext( MSGID )
  keywordSpec: {
    gettext: {
      text: 0,
      aliases: []
    },
    pgettext: {
      text: 1,
      context: 0,
      aliases: []
    },
    ngettext: {
      text: 0,
      textPlural: 1,
      aliases: []
    },
    npgettext: {
      text: 1,
      textPlural: 2,
      context: 0,
      aliases: []
    }
  },
  allowedTemplateFileExtensions: ['.vue'],
  allowedCodeFileExtensions: ['.js']
};

var stripVData = function stripVData(input) {
  return input.replace(/[\t-\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*data\-v\-[0-9A-Za-z\u017F\u212A]{8,}="(?:[\0-\t\x0B\f\x0E-\u2027\u202A-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])*?"/gi, '');
};

var stripHTMLWhitespace = function stripHTMLWhitespace(input) {
  return input.replace(/>[\t-\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*/gi, '>').replace(/[\t-\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*</gi, '<');
};

var _extractorFactory = function _extractorFactory(configuration) {
  // Prepare the list of supported tag attributes.
  var supportedTagAttributes = [configuration.directiveName];

  supportedTagAttributes.push(configuration.attributes.plural && configuration.attributes.plural !== defaultConfiguration.attributes.plural ? configuration.attributes.plural : defaultConfiguration.attributes.plural);
  supportedTagAttributes.push(configuration.attributes.n && configuration.attributes.n !== defaultConfiguration.attributes.n ? configuration.attributes.n : defaultConfiguration.attributes.n);
  supportedTagAttributes.push(configuration.attributes.context && configuration.attributes.context !== defaultConfiguration.attributes.context ? configuration.attributes.context : defaultConfiguration.attributes.context);
  supportedTagAttributes.push(configuration.attributes.comment && configuration.attributes.comment !== defaultConfiguration.attributes.comment ? configuration.attributes.comment : defaultConfiguration.attributes.comment);

  var parseVueFile = function parseVueFile(filename) {
    var content = fs.readFileSync(filename, {
      encoding: 'utf8'
    });

    // For parsing strings from components and HTML inside Single Page Components use the classic parser.
    var parsedSPC = parse5.parse(content, { locationInfo: true });

    // Parse SPC parts: <template> and <scripts>.
    var parseFile = function parseFile(childNodes, path, index) {
      if (index >= path.length) {
        return childNodes;
      } else if (childNodes) {
        var childNode = childNodes.find(function (node) {
          return node.nodeName === path[index];
        });

        if (childNode) {
          childNodes = childNode.childNodes || childNode;
        }

        return parseFile(childNodes, path, index + 1);
      } else {
        return childNodes;
      }
    };
    parsedSPC = parseFile(parsedSPC.childNodes || [], ['html', 'head'], 0);

    // Function to extract a specific part from the SPC.
    function extractSPCPart(part) {
      var _output = {};

      var _parsedSPC = parsedSPC.slice();
      var _templateNode = _parsedSPC.find(function (node) {
        return node.nodeName === part;
      });

      if (_templateNode) {
        _output.locationInfo = _templateNode['__location'];
        _output.attrs = _templateNode['attrs'] || [];
        _templateNode = _templateNode.content || null;
      }

      // For the <template> part child nodes are needed.
      // For the <script> part only location data is required (the scripts part will be extracted from unparsed content)
      if (_templateNode) {
        _output.childNodes = _templateNode.childNodes;
      }

      return _output;
    }

    // Get the contents of the `template` and `script` sections, if present.
    var template = extractSPCPart('template') || null;
    var script = extractSPCPart('script') || null;

    // If the `template` tag has an attribute value for `src` to an external .html file, try to load content of that file.
    // https://vue-loader.vuejs.org/en/start/spec.html
    if (template.attrs && template.attrs.length > 0) {
      var src = template.attrs.find(function (attr) {
        return attr.name === 'src';
      });

      try {
        src = upath.joinSafe(upath.parse(filename).dir, upath.normalizeSafe(src.value));

        var _content = fs.readFileSync(src, {
          encoding: 'utf8'
        });

        if (_content) {
          var _parsedContent = parse5.parse(_content, { locationInfo: true });
          _parsedContent = parseFile(_parsedContent.childNodes || [], ['html', 'body'], 0);

          template.locationInfo = _parsedContent['__location'] || null;
          template.attrs = _parsedContent['attrs'] || [];
          template.childNodes = _parsedContent;

          filename = src;
        }
      } catch (err) {}
    }

    // Save all findings into a snippets collection.
    var snippets = {
      jsSnippets: [],
      htmlSnippets: []

      // Parse main <script> part and push as a snippet.
    };if (script) {
      snippets.jsSnippets.push({
        filename: filename,
        code: content.substr(script.locationInfo.startTag.startOffset, script.locationInfo.endOffset),
        line: script.locationInfo.startTag.line
      });
    }

    // Look for interpolations in text contents.
    // {{}} are default delimiters for interpolations.
    // These delimiters could change using Vue's `delimiters` option.
    // https://vuejs.org/v2/api/#delimiters
    var templateTextHandler = function templateTextHandler(node) {
      var text = node.value;
      var expr = new RegExp(configuration.startDelim + '([\\s\\S]*?)' + configuration.startDelim, 'i');
      var exprMatch = text.match(expr);
      var lineOffset = 0;

      while (exprMatch) {
        var prevLines = text.substr(0, exprMatch.index).split(/\r\n|\r|\n/).length;
        var matchedLines = exprMatch[1].split(/\r\n|\r|\n/).length;

        lineOffset += prevLines - 1;

        snippets.jsSnippets.push({
          code: exprMatch[1],
          line: node.__location.line + lineOffset
        });

        text = text.substr(exprMatch.index + exprMatch[0].length);

        lineOffset += matchedLines - 1;

        exprMatch = text.match(expr);
      }
    };

    // Convert data extracted from HTML to a JS expression, parseable with the JSParser.
    var templateToJs = function templateToJs(node) {
      var isPlural = node.n && node.plural !== undefined;
      var _code = '';

      function _s(string) {
        return string.replace(/'/g, '\\\'');
      }

      if (isPlural && node.context) {
        _code = '$npgettext(\'' + _s(node.context) + '\', \'' + _s(node.text) + '\', \'' + _s(node.plural) + '\', ' + node.n + ')';
      } else if (isPlural) {
        _code = '$ngettext(\'' + _s(node.text) + '\', \'' + _s(node.plural) + '\', 2)';
      } else if (node.context) {
        _code = '$pgettext(\'' + _s(node.context) + '\', \'' + _s(node.text) + '\')';
      } else {
        _code = '$gettext(\'' + _s(node.text) + '\')';
      }

      return node.comment ? '/*$' + configuration.commentKeyword + ': ' + node.comment + '*/ ' + _code : _code;
    };

    // Convert HTML to an output that Vue will generate.
    function serilizeNode(content) {
      var TranslateEmulated = Vue.component('i18n-helper-component', {
        template: '<div class="emulated-translate-V9rNk0G5Rj">' + content + '</div>'
      });

      var component = new TranslateEmulated();
      var stream = renderer.renderToStream(component);
      var html = '';
      var waiter = new EventEmitter();

      stream.on('data', function (data) {
        html += data.toString();
      });

      stream.on('end', function () {
        waiter.emit('continue');
      });

      stream.on('error', function () {
        html = '';
        waiter.emit('continue');
      });

      wait.for.event(waiter, 'continue');

      // Set the string to be the innerHTML of the helper component, but striped of white spaces and Vue's automatically added data-v attributes.
      html = html.replace('<div data-server-rendered="true" class="emulated-translate-V9rNk0G5Rj">', '').slice(0, -'</div>'.length);
      return stripVData(stripHTMLWhitespace(html).trim());
    }

    // Look for JS expressions in tag attributes.
    var templateTagHandler = function templateTagHandler(node) {
      var translateAttrs = {};

      for (var i in node.attrs) {
        // We're only looking for data bindings, events and directives
        var _node = node.attrs[i];
        _node.normalizedName = _node.name.replace('v-bind', '').replace(':', '');

        if (_node.name.match(/^(:|@|v-)/) && !supportedTagAttributes.includes(_node.normalizedName)) {
          snippets.jsSnippets.push({
            filename: filename,
            code: _node.value,
            line: node.__location.attrs[_node.name].line
          });
        } else if (supportedTagAttributes.includes(_node.normalizedName)) {
          translateAttrs[_node.normalizedName] = _node.value;
        }
      }

      if (translateAttrs.hasOwnProperty(configuration.directiveName)) {
        snippets.htmlSnippets.push({
          filename: filename,
          text: serilizeNode(parse5.serialize(node)),
          plural: translateAttrs[configuration.attributes.plural],
          n: !!translateAttrs[configuration.attributes.n],
          context: translateAttrs[configuration.attributes.context],
          comment: translateAttrs[configuration.attributes.comment],
          get code() {
            return templateToJs(this);
          },
          line: node.__location.line
        });
      }
    };

    // Extract strings from the <translate> component.
    var templateTranslateComponentHandler = function templateTranslateComponentHandler(node) {
      var _attrs2;

      var _attrs = (_attrs2 = {}, (0, _defineProperty3.default)(_attrs2, configuration.attributes.plural, null), (0, _defineProperty3.default)(_attrs2, configuration.attributes.context, null), (0, _defineProperty3.default)(_attrs2, configuration.attributes.comment, null), _attrs2);

      node.attrs.forEach(function (attr) {
        var _normalizedAttrName = attr.name.replace('v-bind', '').replace(':', '');

        if (supportedTagAttributes.includes(_normalizedAttrName) && attr.name !== configuration.directiveName) {
          _attrs[_normalizedAttrName] = attr.value;
        }
      });

      snippets.htmlSnippets.push({
        filename: filename,
        text: serilizeNode(parse5.serialize(node)),
        plural: _attrs[configuration.attributes.plural],
        n: !!_attrs[configuration.attributes.n],
        context: _attrs[configuration.attributes.context],
        comment: _attrs[configuration.attributes.comment],
        get code() {
          return templateToJs(this);
        },
        line: node.__location.line
      });
    };

    // Walk through the parsed <template> part.
    (function parseNode(childNodes) {
      if (childNodes) {
        for (var i in childNodes) {
          var node = childNodes[i];

          if (node.nodeName === '#text') {
            templateTextHandler(node);
          } else if (node.nodeName === configuration.translateTag) {
            templateTranslateComponentHandler(node);
          } else {
            templateTagHandler(node);
          }

          parseNode(node.childNodes);
        }
      }
    })(template.childNodes);

    // Parsing finished.
    return { snippets: snippets, finalTemplateFilename: filename };
  };

  var generateExpression = function generateExpression(keyword) {
    // Make a list of expression for keyword.
    // Example: ['$gettext', '[this].$gettext']
    var _variants = ['$' + keyword, '[this].$' + keyword];

    configuration.keywordSpec[keyword].aliases.forEach(function (alias) {
      if (alias !== keyword) {
        _variants.push('$' + alias);
        _variants.push('[this].$' + alias);
      }
    });

    if (keyword === 'gettext' && configuration.underscoreAlias) {
      _variants.push('_');
      _variants.push('[this]._');
    }

    // Settings for handling comments.
    var _commentsSettings = {
      sameLineLeading: true,
      otherLineLeading: true,
      sameLineTrailing: true,
      regex: new RegExp('^\\s*\\$' + configuration.commentKeyword + '{1}:\\s*(.*)', 'i')

      // Prepare arguments positions.
    };var _arguments = {
      text: configuration.keywordSpec[keyword].text
    };

    if (configuration.keywordSpec[keyword].textPlural !== undefined && configuration.keywordSpec[keyword].textPlural !== null && configuration.keywordSpec[keyword].textPlural !== false) {
      _arguments.textPlural = configuration.keywordSpec[keyword].textPlural;
    }

    if (configuration.keywordSpec[keyword].context !== undefined && configuration.keywordSpec[keyword].context !== null && configuration.keywordSpec[keyword].context !== false) {
      _arguments.context = configuration.keywordSpec[keyword].context;
    }

    return JsExtractors.callExpression(_variants, {
      arguments: _arguments,
      comments: _commentsSettings
    });
  };

  // Prepare the gettextExtractor.
  var _supportedExpressions = [];
  var keywords = ['gettext', 'pgettext', 'ngettext', 'npgettext'];

  for (var i in keywords) {
    var keyword = keywords[i];
    _supportedExpressions.push(generateExpression(keyword));
  }

  var gettextParser = gettextExtractor.createJsParser(_supportedExpressions);

  // Export parsers.
  return {
    gettextParser: gettextParser,
    parseVueFile: parseVueFile
  };
};

var Extractor = function Extractor(_configuration, sourceFiles, outputDestination) {
  var configuration = deepmerge(defaultConfiguration, _configuration);

  if (!(sourceFiles instanceof Array)) {
    var _inputDir = upath.normalizeSafe(sourceFiles);

    if (!fs.existsSync(_inputDir) || !fs.lstatSync(_inputDir).isDirectory()) {
      console.log(colors.red('[vue-gettext-tools] [extract-error] => Input directory ' + _inputDir + ' not found.'));
      return;
    } else {
      var templateExtensions = [];
      var codeExtensions = [];

      configuration.allowedTemplateFileExtensions.forEach(function (extension) {
        if (extension.indexOf('.') === 0) {
          extension = extension.substr(1);
        }

        templateExtensions.push(extension);
      });

      configuration.allowedCodeFileExtensions.forEach(function (extension) {
        if (extension.indexOf('.') === 0) {
          extension = extension.substr(1);
        }

        codeExtensions.push(extension);
      });

      sourceFiles = [upath.joinSafe(_inputDir, '/**/*.{' + templateExtensions.join(',') + ',' + codeExtensions.join(',') + '}')];
    }
  }

  var _outputDir = upath.normalizeSafe(upath.parse(outputDestination).dir);
  if (!fs.existsSync(_outputDir) || !fs.lstatSync(_outputDir).isDirectory()) {
    console.log(colors.red('[vue-gettext-tools] [extract-error] => Output directory ' + _outputDir + ' not found.'));
    return;
  }

  var _extractor = _extractorFactory(configuration);

  try {
    var filePaths = globby.sync(sourceFiles);

    filePaths.forEach(function (filename) {
      if (configuration.allowedCodeFileExtensions.includes(path.extname(filename))) {
        _extractor.gettextParser.parseFile(filename);
      } else if (configuration.allowedTemplateFileExtensions.includes(path.extname(filename))) {
        var data = _extractor.parseVueFile(filename);

        data.snippets.jsSnippets.forEach(function (jsSnippet) {
          _extractor.gettextParser.parseString(jsSnippet.code, filename, {
            lineNumberStart: jsSnippet.line
          });
        });

        data.snippets.htmlSnippets.forEach(function (htmlSnippet) {
          _extractor.gettextParser.parseString(htmlSnippet.code, data.finalTemplateFilename, {
            lineNumberStart: htmlSnippet.line
          });
        });
      }
    });

    gettextExtractor.savePotFile(upath.normalize(outputDestination));

    if (configuration.verbose) {
      gettextExtractor.printStats();
    }
  } catch (error) {
    console.log(colors.red('[vue-gettext-tools] [extract-error] => Something went wrong:'));
    console.log(error.stack);
  }
};

exports.Extractor = Extractor;