import matter from 'gray-matter';

export function parseCometTemplate(contents: string): {
  filepath?: string;
  content: string;
} {
  // Passing options avoids gray-matter returning a cached object without its
  // non-enumerable parsing metadata.
  const parsed = matter(contents, {});
  const cometTemplate = parsed.data.comet_template;
  if (
    parsed.language !== 'yaml' ||
    !cometTemplate ||
    typeof cometTemplate !== 'object' ||
    Array.isArray(cometTemplate)
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
      /^[ \t]*comet_template:.*?\r?\n(?:[ \t]*(?:filepath|name|description):.*\r?\n)+/gm,
      ''
    );
  }

  return {
    filepath:
      typeof cometTemplate.filepath === 'string'
        ? cometTemplate.filepath
        : undefined,
    content,
  };
}
