import {
  mergeFrontmatter,
  addTagsToFrontmatter,
  removeTagsFromFrontmatter,
} from './frontmatter';

describe('addTagsToFrontmatter / removeTagsFromFrontmatter', () => {
  const seed = '---\ntitle: A\ntags: [project, urgent]\n---\n# A';

  it('appends new tags without duplicates', () => {
    const result = addTagsToFrontmatter(seed, ['project', 'new']);
    expect(result.tags.sort()).toEqual(['new', 'project', 'urgent']);
  });

  it('removes specified tags', () => {
    const result = removeTagsFromFrontmatter(seed, ['urgent']);
    expect(result.tags).toEqual(['project']);
  });

  it('removes tags after add (regression — gray-matter cache pollution)', () => {
    addTagsToFrontmatter(seed, ['x']);
    const result = removeTagsFromFrontmatter(seed, ['urgent']);
    expect(result.tags).toEqual(['project']);
  });
});

describe('mergeFrontmatter', () => {
  it('round-trips properties and body', () => {
    const merged = mergeFrontmatter('---\nstatus: draft\n---\nbody', {
      status: 'active',
    });
    expect(merged).toContain('status: active');
    expect(merged).toContain('body');
  });

  it('leaves a plain body unchanged when properties are empty', () => {
    expect(mergeFrontmatter('# body', {})).toBe('# body');
  });
});
