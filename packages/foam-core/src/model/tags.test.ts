import { createTestNote, createTestWorkspace } from '../../test/test-utils';
import { FoamTags } from './tags';

function tagLocations(tags: FoamTags) {
  return Object.fromEntries(
    Array.from(tags.tags, ([label, locations]) => [
      label,
      locations.map(location => location.uri.path),
    ])
  );
}

describe('FoamTags', () => {
  it('indexes tags from workspace resources', () => {
    const first = createTestNote({
      uri: '/a.md',
      tags: ['primary', 'secondary'],
    });
    const second = createTestNote({
      uri: '/b.md',
      tags: ['primary', 'third'],
    });
    const workspace = createTestWorkspace().set(first).set(second);
    const tags = FoamTags.fromWorkspace(workspace);

    expect(tagLocations(tags)).toEqual({
      primary: ['/a.md', '/b.md'],
      secondary: ['/a.md'],
      third: ['/b.md'],
    });
    expect(tags.tags.get('secondary')?.[0]).toEqual({
      uri: first.uri,
      range: first.tags[1].range,
      data: first.tags[1],
    });
    tags.dispose();
    workspace.dispose();
  });

  it('tracks add, update, move, and delete events', () => {
    const workspace = createTestWorkspace().set(
      createTestNote({ uri: '/a.md', tags: ['primary'] })
    );
    const tags = FoamTags.fromWorkspace(workspace);

    workspace.set(createTestNote({ uri: '/b.md', tags: ['primary'] }));
    expect(tagLocations(tags)).toEqual({ primary: ['/a.md', '/b.md'] });

    workspace.set(createTestNote({ uri: '/a.md', tags: ['updated'] }));
    expect(tagLocations(tags)).toEqual({
      updated: ['/a.md'],
      primary: ['/b.md'],
    });

    workspace.delete(createTestNote({ uri: '/a.md' }).uri);
    workspace.set(createTestNote({ uri: '/moved/a.md', tags: ['updated'] }));
    expect(tagLocations(tags)).toEqual({
      primary: ['/b.md'],
      updated: ['/moved/a.md'],
    });

    workspace.delete(createTestNote({ uri: '/b.md' }).uri);
    workspace.delete(createTestNote({ uri: '/moved/a.md' }).uri);
    expect(tags.tags.size).toBe(0);
    tags.dispose();
    workspace.dispose();
  });
});
