import { searchByProperty } from './search';
import { createTestNote, createTestWorkspace } from '../../test/test-utils';

describe('searchByProperty', () => {
  const workspace = createTestWorkspace()
    .set(
      createTestNote({
        uri: '/alternative.md',
        title: 'Alternative',
        properties: { status: 'active' },
      })
    )
    .set(
      createTestNote({
        uri: '/roadmap.md',
        title: 'Project Plan',
        aliases: ['Roadmap'],
        properties: { status: 'archived' },
      })
    );

  it('filters frontmatter properties', () => {
    expect(
      searchByProperty(workspace, 'status', 'active').map(match => match.title)
    ).toEqual(['Alternative']);
    expect(
      searchByProperty(workspace, 'status')
        .map(match => match.title)
        .sort()
    ).toEqual(['Alternative', 'Project Plan']);
  });
});
