import { searchWorkspace } from './search';
import { createTestNote, createTestWorkspace } from '../../test/test-utils';

describe('searchWorkspace', () => {
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

  it('matches title and alias substrings', () => {
    expect(
      searchWorkspace(workspace, { query: 'alt' }).map(match => match.title)
    ).toEqual(['Alternative']);
    expect(
      searchWorkspace(workspace, { query: 'road' }).map(match => match.title)
    ).toEqual(['Project Plan']);
  });

  it('filters frontmatter properties', () => {
    expect(
      searchWorkspace(workspace, {
        properties: [{ key: 'status', value: 'active' }],
      }).map(match => match.title)
    ).toEqual(['Alternative']);
    expect(
      searchWorkspace(workspace, {
        properties: [{ key: 'status' }],
      })
        .map(match => match.title)
        .sort()
    ).toEqual(['Alternative', 'Project Plan']);
  });
});
