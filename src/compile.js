import fs from 'fs'
import upath from 'upath'
import deepmerge from 'deepmerge'
import deleteKey from 'key-del'
import gettextParser from 'gettext-parser'
import colors from 'colors'

const defaultConfiguration = {
  verbose: false,
  defaultLanguage: 'en',
  joinExisting: true,
  fuzzyStringsInJson: true,
  jsonOutputType: 'single'
}

let configuration = {}

const merge = (language, potFile, localesDir) => {
  let po, pot

  const potFilename = upath.normalizeSafe(potFile)
  const poFilename = upath.joinSafe(upath.normalizeSafe(localesDir), `${language}.po`)

  try {
    pot = gettextParser.po.parse(fs.readFileSync(potFilename))
  } catch (err) {
    console.log(colors.red(`[vue-gettext-tools] [compile-error] => POT file ${potFilename} not found. Cannot compile PO files.`))
    return
  }

  try {
    po = gettextParser.po.parse(fs.readFileSync(poFilename))
  } catch (err) {
    if (configuration.verbose) {
      console.log(colors.yellow(`[vue-gettext-tools] [compile-warning] => PO file for language "${language}" in directory ${upath.normalizeSafe(localesDir)} not found: Duplicating POT file to a new PO file.`))
    }
    fs.writeFileSync(poFilename, potFilename)
    po = gettextParser.po.parse(fs.readFileSync(poFilename))
  }

  const translations = po.translations
  const dictionary = pot.translations

  // Delete references and comments from translations (since that they could have been changed in the dictionary)
  const _updatedTranslations = deleteKey(translations, ['reference', 'extracted'])

  let _mergedDictionaryTranslations
  if (configuration.joinExisting) {
    // Merge updated translations from PO file to the dictionary POT file.
    _mergedDictionaryTranslations = deepmerge(dictionary, _updatedTranslations, { arrayMerge: (destination, source) => source })

    // Delete keys from the merged dictionary that weren't originally in the dictionary.
    // Those strings were deleted from the source files.
    _mergedDictionaryTranslations = ((_translations) => {
      const keysTopLevel = Object.keys(_translations)

      keysTopLevel.forEach((keyTopLevel) => {
        const keys = Object.keys(_translations[keyTopLevel])

        keys.forEach((key) => {
          if (!dictionary[keyTopLevel]) {
            delete _translations[keyTopLevel]
          } else if (!dictionary[keyTopLevel][key]) {
            delete _translations[keyTopLevel][key]
          }
        })
      })

      return _translations
    })(_mergedDictionaryTranslations)
  } else {
    _mergedDictionaryTranslations = dictionary
  }

  // Update temporary POT file with updated strings.
  pot.headers = po.headers
  pot.translations = _mergedDictionaryTranslations

  function generateJson (strings) {
    let _output = strings

    // Convert blank index on top level to `$$NOCONTEXT` key.
    if (_output && _output['']) {
      _output['$$NOCONTEXT'] = _output['']
      delete _output['']
    }

    // Delete the leftover header data.
    if (_output['$$NOCONTEXT'] && _output['$$NOCONTEXT']['']) {
      delete _output['$$NOCONTEXT']['']
    }

    // Delete fuzzy strings if required.
    if (!configuration.fuzzyStringsInJson) {
      const keysTopLevel = Object.keys(_output)

      keysTopLevel.forEach((keyTopLevel) => {
        const keys = Object.keys(_output[keyTopLevel])

        keys.forEach((key) => {
          let string
          if (_output[keyTopLevel] && _output[keyTopLevel][key]) {
            string = _output[keyTopLevel][key]
          }

          if (string && string.comments && string.comments.flag && string.comments.flag === 'fuzzy') {
            delete _output[keyTopLevel][key]
          }
        })
      })
    }

    // Delete comments data.
    _output = deleteKey(strings, 'comments')
    return _output
  }

  return {filename: poFilename, content: gettextParser.po.compile(pot), jsonContent: generateJson(pot.translations)}
}

const Compiler = (_configuration, potFile, localesDirectory, jsonDirectory, languages) => {
  const _outputPODir = upath.normalizeSafe(localesDirectory)
  if (!fs.existsSync(_outputPODir) || !fs.lstatSync(_outputPODir).isDirectory()) {
    console.log(colors.red(`[vue-gettext-tools] [compile-error] => Locales output directory "${_outputPODir}" not found.`))
    return
  }

  const _outputJSONDir = upath.normalizeSafe(jsonDirectory)
  if (!fs.existsSync(_outputJSONDir) || !fs.lstatSync(_outputJSONDir).isDirectory()) {
    console.log(colors.red(`[vue-gettext-tools] [compile-error] => Locales JSON output directory "${_outputJSONDir}" not found.`))
    return
  }

  configuration = deepmerge(defaultConfiguration, _configuration)

  if (configuration.jsonOutputType !== 'single' && configuration.jsonOutputType !== 'multiple' && configuration.jsonOutputType !== 'both' && configuration.jsonOutputType !== 'none') {
    configuration.jsonOutputType = 'single'
  }

  if (languages === undefined) {
    languages = [configuration.defaultLanguage]
  }

  let combinedJSONObject = {}

  languages.forEach((language) => {
    if (configuration.verbose) {
      console.log(colors.blue(`[vue-gettext-tools] [compile-info] => Compiling language: "${language}".`))
    }

    const po = merge(language, potFile, localesDirectory)

    try {
      fs.writeFileSync(po.filename, po.content)
      const jsonFilename = upath.joinSafe(upath.normalizeSafe(jsonDirectory), upath.parse(po.filename).name + '.json')

      if (configuration.jsonOutputType === 'multiple') {
        fs.writeFileSync(jsonFilename, JSON.stringify({[language]: po.jsonContent}, null, '\t'))
      } else if (configuration.jsonOutputType === 'single') {
        combinedJSONObject = deepmerge(combinedJSONObject, {[language]: po.jsonContent})
      } else if (configuration.jsonOutputType === 'both') {
        fs.writeFileSync(jsonFilename, JSON.stringify({[language]: po.jsonContent}, null, '\t'))
        combinedJSONObject = deepmerge(combinedJSONObject, {[language]: po.jsonContent})
      } else {
        // configuration.jsonOutputType === 'none'
      }
    } catch (err) {
      console.log(colors.red(`[vue-gettext-tools] [compile-error] => Couldn't write output files for language "${language}".`))
      console.log(err.stack)
    }
  })

  if (configuration.jsonOutputType === 'single' || configuration.jsonOutputType === 'both') {
    const singleJSONFilename = upath.joinSafe(upath.normalizeSafe(jsonDirectory), 'translations.json')

    if (configuration.verbose) {
      console.log(colors.blue(`[vue-gettext-tools] [compile-info] => Compiling single language file: "${singleJSONFilename}".`))
    }

    fs.writeFileSync(singleJSONFilename, JSON.stringify(combinedJSONObject, null, '\t'))
  }
}

export { Compiler }
