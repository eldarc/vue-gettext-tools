import htmlTags from 'html-tags'

function adjustSelfclosingTags (str) {
  const regex = /<[^>]+?\/>/gmiu
  let m

  while ((m = regex.exec(str)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex) {
      regex.lastIndex++
    }

    // The result can be accessed through the `m`-variable.
    m.forEach(match => {
      htmlTags.forEach(tag => {
        if (match.startsWith(`<${tag}`)) {
          // If a normal html tag is detected which was self-closed in the template, rename it.
          // Once renamed the parser will detect the tag as a foreign element and parse the content.
          str = str.replace(match, `<gettext-x-${tag}${match.substring(tag.length + 1)}`)
        }
      })
    })
  }

  return str
}

// TODO: When a template contains nested template tags, translatable strings inside of those nested templates aren't parsed. Rename them, so that they can be parsed.
// function adjustSubTemplates (str) {
//   const regex = /<template>[\s\S]*?<\/template>/gmiu
//   let m
//
//   while ((m = regex.exec(str)) !== null) {
//     // This is necessary to avoid infinite loops with zero-width matches
//     if (m.index === regex.lastIndex) {
//       regex.lastIndex++
//     }
//
//     // The result can be accessed through the `m`-variable.
//     m.forEach(match => {
//       const originalMatch = match
//       const startTagRegex = /<template[\s\S]*?>/gmiu
//       let startM
//
//       while ((startM = startTagRegex.exec(match)) !== null) {
//         // This is necessary to avoid infinite loops with zero-width matches
//         if (startM.index === regex.lastIndex) {
//           regex.lastIndex++
//         }
//
//         // The result can be accessed through the `m`-variable.
//         startM.forEach(startMatch => {
//           match.replace
//         })
//       }
//
//       return str
//     })
//   }
//
//   return str
// }

const SanitizeTemplate = (input) => {
  input = adjustSelfclosingTags(input)
  return input
}

export { SanitizeTemplate }
