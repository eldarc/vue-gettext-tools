'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Compiler = undefined;

var _defineProperty2 = require('babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _upath = require('upath');

var _upath2 = _interopRequireDefault(_upath);

var _deepmerge3 = require('deepmerge');

var _deepmerge4 = _interopRequireDefault(_deepmerge3);

var _keyDel = require('key-del');

var _keyDel2 = _interopRequireDefault(_keyDel);

var _gettextParser = require('gettext-parser');

var _gettextParser2 = _interopRequireDefault(_gettextParser);

var _colors = require('colors');

var _colors2 = _interopRequireDefault(_colors);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var defaultConfiguration = {
  verbose: false,
  defaultLanguage: 'en',
  joinExisting: true,
  fuzzyStringsInJson: true,
  jsonOutputType: 'single'
};

var configuration = {};

var merge = function merge(language, potFile, localesDir) {
  var po = void 0,
      pot = void 0;

  var potFilename = _upath2.default.normalizeSafe(potFile);
  var poFilename = _upath2.default.joinSafe(_upath2.default.normalizeSafe(localesDir), language + '.po');

  try {
    pot = _gettextParser2.default.po.parse(_fs2.default.readFileSync(potFilename));
  } catch (err) {
    console.log(_colors2.default.red('[vue-gettext-tools] [compile-error] => POT file ' + potFilename + ' not found. Cannot compile PO files.'));
    return;
  }

  try {
    po = _gettextParser2.default.po.parse(_fs2.default.readFileSync(poFilename));
  } catch (err) {
    if (configuration.verbose) {
      console.log(_colors2.default.yellow('[vue-gettext-tools] [compile-warning] => PO file for language "' + language + '" in directory ' + _upath2.default.normalizeSafe(localesDir) + ' not found: Duplicating POT file to a new PO file.'));
    }
    _fs2.default.writeFileSync(poFilename, potFilename);
    po = _gettextParser2.default.po.parse(_fs2.default.readFileSync(poFilename));
  }

  var translations = po.translations;
  var dictionary = pot.translations;

  // Delete references and comments from translations (since that they could have been changed in the dictionary)
  var _updatedTranslations = (0, _keyDel2.default)(translations, ['reference', 'extracted']);

  var _mergedDictionaryTranslations = void 0;
  if (configuration.joinExisting) {
    // Merge updated translations from PO file to the dictionary POT file.
    _mergedDictionaryTranslations = (0, _deepmerge4.default)(dictionary, _updatedTranslations, { arrayMerge: function arrayMerge(destination, source) {
        return source;
      } });

    // Delete keys from the merged dictionary that weren't originally in the dictionary.
    // Those strings were deleted from the source files.
    _mergedDictionaryTranslations = function (_translations) {
      var keysTopLevel = Object.keys(_translations);

      keysTopLevel.forEach(function (keyTopLevel) {
        var keys = Object.keys(_translations[keyTopLevel]);

        keys.forEach(function (key) {
          if (!dictionary[keyTopLevel]) {
            delete _translations[keyTopLevel];
          } else if (!dictionary[keyTopLevel][key]) {
            delete _translations[keyTopLevel][key];
          }
        });
      });

      return _translations;
    }(_mergedDictionaryTranslations);
  } else {
    _mergedDictionaryTranslations = dictionary;
  }

  // Update temporary POT file with updated strings.
  pot.headers = po.headers;
  pot.translations = _mergedDictionaryTranslations;

  function generateJson(strings) {
    var _output = strings;

    // Convert blank index on top level to `$$NOCONTEXT` key.
    if (_output && _output['']) {
      _output['$$NOCONTEXT'] = _output[''];
      delete _output[''];
    }

    // Delete the leftover header data.
    if (_output['$$NOCONTEXT'] && _output['$$NOCONTEXT']['']) {
      delete _output['$$NOCONTEXT'][''];
    }

    // Delete fuzzy strings if required.
    if (!configuration.fuzzyStringsInJson) {
      var keysTopLevel = Object.keys(_output);

      keysTopLevel.forEach(function (keyTopLevel) {
        var keys = Object.keys(_output[keyTopLevel]);

        keys.forEach(function (key) {
          var string = void 0;
          if (_output[keyTopLevel] && _output[keyTopLevel][key]) {
            string = _output[keyTopLevel][key];
          }

          if (string && string.comments && string.comments.flag && string.comments.flag === 'fuzzy') {
            delete _output[keyTopLevel][key];
          }
        });
      });
    }

    // Delete comments data.
    _output = (0, _keyDel2.default)(strings, 'comments');
    return _output;
  }

  return { filename: poFilename, content: _gettextParser2.default.po.compile(pot), jsonContent: generateJson(pot.translations) };
};

var Compiler = function Compiler(_configuration, potFile, localesDirectory, jsonDirectory, languages) {
  var _outputPODir = _upath2.default.normalizeSafe(localesDirectory);
  if (!_fs2.default.existsSync(_outputPODir) || !_fs2.default.lstatSync(_outputPODir).isDirectory()) {
    console.log(_colors2.default.red('[vue-gettext-tools] [compile-error] => Locales output directory "' + _outputPODir + '" not found.'));
    return;
  }

  var _outputJSONDir = _upath2.default.normalizeSafe(jsonDirectory);
  if (!_fs2.default.existsSync(_outputJSONDir) || !_fs2.default.lstatSync(_outputJSONDir).isDirectory()) {
    console.log(_colors2.default.red('[vue-gettext-tools] [compile-error] => Locales JSON output directory "' + _outputJSONDir + '" not found.'));
    return;
  }

  configuration = (0, _deepmerge4.default)(defaultConfiguration, _configuration);

  if (configuration.jsonOutputType !== 'single' && configuration.jsonOutputType !== 'multiple' && configuration.jsonOutputType !== 'both' && configuration.jsonOutputType !== 'none') {
    configuration.jsonOutputType = 'single';
  }

  if (languages === undefined) {
    languages = [configuration.defaultLanguage];
  }

  var combinedJSONObject = {};

  languages.forEach(function (language) {
    if (configuration.verbose) {
      console.log(_colors2.default.blue('[vue-gettext-tools] [compile-info] => Compiling language: "' + language + '".'));
    }

    var po = merge(language, potFile, localesDirectory);

    try {
      _fs2.default.writeFileSync(po.filename, po.content);
      var jsonFilename = _upath2.default.joinSafe(_upath2.default.normalizeSafe(jsonDirectory), _upath2.default.parse(po.filename).name + '.json');

      if (configuration.jsonOutputType === 'multiple') {
        _fs2.default.writeFileSync(jsonFilename, JSON.stringify((0, _defineProperty3.default)({}, language, po.jsonContent), null, '\t'));
      } else if (configuration.jsonOutputType === 'single') {
        combinedJSONObject = (0, _deepmerge4.default)(combinedJSONObject, (0, _defineProperty3.default)({}, language, po.jsonContent));
      } else if (configuration.jsonOutputType === 'both') {
        _fs2.default.writeFileSync(jsonFilename, JSON.stringify((0, _defineProperty3.default)({}, language, po.jsonContent), null, '\t'));
        combinedJSONObject = (0, _deepmerge4.default)(combinedJSONObject, (0, _defineProperty3.default)({}, language, po.jsonContent));
      } else {
        // configuration.jsonOutputType === 'none'
      }
    } catch (err) {
      console.log(_colors2.default.red('[vue-gettext-tools] [compile-error] => Couldn\'t write output files for language "' + language + '".'));
      console.log(err.stack);
    }
  });

  if (configuration.jsonOutputType === 'single' || configuration.jsonOutputType === 'both') {
    var singleJSONFilename = _upath2.default.joinSafe(_upath2.default.normalizeSafe(jsonDirectory), 'translations.json');

    if (configuration.verbose) {
      console.log(_colors2.default.blue('[vue-gettext-tools] [compile-info] => Compiling single language file: "' + singleJSONFilename + '".'));
    }

    _fs2.default.writeFileSync(singleJSONFilename, JSON.stringify(combinedJSONObject, null, '\t'));
  }
};

exports.Compiler = Compiler;