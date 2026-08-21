import matter from 'gray-matter';

export function parseFoamTemplate(contents: string): {
  filepath?: string;
  content: string;
} {
  // Passing options avoids gray-matter returning a cached object without its
  // non-enumerable parsing metadata.
  const parsed = matter(contents, {});
  const foamTemplate = parsed.data.foam_template;
  if (
    parsed.language !== 'yaml' ||
    !foamTemplate ||
    typeof foamTemplate !== 'object' ||
    Array.isArray(foamTemplate)
  ) {
    return { content: contents };
  }

  let content: string;
  if (Object.keys(parsed.data).length === 1) {
    content = parsed.content;
    if (matter(content.trimStart()).matter !== '') {
      content = content.trimStart();
    }
  } else {
    content = contents.replace(
      /^[ \t]*foam_template:.*?\r?\n(?:[ \t]*(?:filepath|name|description):.*\r?\n)+/gm,
      ''
    );
  }

  return {
    filepath:
      typeof foamTemplate.filepath === 'string'
        ? foamTemplate.filepath
        : undefined,
    content,
  };
}
