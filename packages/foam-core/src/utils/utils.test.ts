import { extractHashtags } from './index';

describe('extractHashtags', () => {
  it.each([
    ['plain text', 'hello world', []],
    ['basic tags', 'hello #world on #this planet', ['world', 'this']],
    [
      'boundaries and separators',
      '#hello-world on #this_planet and #parent/child',
      ['hello-world', 'this_planet', 'parent/child'],
    ],
    ['numeric tags', '#123 #123four', ['123four']],
    [
      'Unicode tags',
      '#tag_with_unicode_letters_汉字 #纯中文标签 #标签1 #123四',
      ['tag_with_unicode_letters_汉字', '纯中文标签', '标签1', '123四'],
    ],
    [
      'emoji tags',
      '#⭐ #⭐⭐ #👍👍🏽👍🏿 #π🥧 #✅todo #urgent❗ #❗❗urgent #📥/🟥 #📥/🟢',
      [
        '⭐',
        '⭐⭐',
        '👍👍🏽👍🏿',
        'π🥧',
        '✅todo',
        'urgent❗',
        '❗❗urgent',
        '📥/🟥',
        '📥/🟢',
      ],
    ],
    [
      'emoji variant selectors',
      '#🗃️/37-Education #🔖/37/Learning #🟣HOUSE #🟠MONEY',
      ['🗃️/37-Education', '🔖/37/Learning', '🟣HOUSE', '🟠MONEY'],
    ],
    [
      'URL fragments',
      'https://site.com/#section [link](https://site.com/home#section) #control',
      ['control'],
    ],
    [
      'note section links',
      '[[#section1]] [[link#section2]] [link](#section3)',
      [],
    ],
  ])('handles %s', (_name, text, expected) => {
    expect(extractHashtags(text).map(tag => tag.label)).toEqual(expected);
  });

  it('reports tag offsets', () => {
    expect(extractHashtags('to #hello')).toEqual([
      { label: 'hello', offset: 3 },
    ]);
  });
});
