import { Resolver } from './variable-resolver';

describe('Resolver', () => {
  it('substitutes title variables without touching unrelated variables', async () => {
    const resolver = new Resolver(
      new Date(2021, 9, 15, 1, 2, 3),
      'My/note#title'
    );
    expect(
      await resolver.resolveText(
        '$FOAM_TITLE|$FOAM_TITLE_SAFE|$FOAM_SLUG|$ANOTHER_VARIABLE'
      )
    ).toBe(
      'My/note#title|My-note-title|mynotetitle|$ANOTHER_VARIABLE'
    );
  });

  it('preserves TextMate placeholders while resolving Foam variables', async () => {
    const resolver = new Resolver(new Date(), 'My Note');
    expect(
      await resolver.resolveText('$1 :: $FOAM_SLUG :: ${1:$FOAM_TITLE}')
    ).toBe('$1 :: my-note :: ${1:My Note}');
  });

  it('resolves date variables from one supplied date', async () => {
    const date = new Date(2021, 9, 15, 1, 2, 3);
    const resolver = new Resolver(date, 'Note', 'en-US');
    const variables = [
      'FOAM_DATE_YEAR',
      'FOAM_DATE_YEAR_SHORT',
      'FOAM_DATE_MONTH',
      'FOAM_DATE_MONTH_NAME',
      'FOAM_DATE_MONTH_NAME_SHORT',
      'FOAM_DATE_DATE',
      'FOAM_DATE_DAY_ISO',
      'FOAM_DATE_WEEK',
      'FOAM_DATE_WEEK_YEAR',
      'FOAM_DATE_DAY_NAME',
      'FOAM_DATE_DAY_NAME_SHORT',
      'FOAM_DATE_HOUR',
      'FOAM_DATE_MINUTE',
      'FOAM_DATE_SECOND',
      'FOAM_DATE_SECONDS_UNIX',
    ];
    const input = variables.map(name => `$${name}`).join('|');
    const expected = [
      '2021',
      '21',
      '10',
      'October',
      'Oct',
      '15',
      '5',
      '41',
      '2021',
      'Friday',
      'Fri',
      '01',
      '02',
      '03',
      String(date.getTime() / 1000),
    ].join('|');
    expect(await resolver.resolveText(input)).toBe(expected);
  });

  it('supports custom date formats', async () => {
    const resolver = new Resolver(new Date(2021, 9, 15, 1, 2, 3), 'Note');
    expect(
      await resolver.resolveText(
        '${FOAM_DATE_FORMAT:YYYY-MM-DD-WW HH:mm:ss}'
      )
    ).toBe('2021-10-15-41 01:02:03');
  });

  it.each([
    [new Date(2025, 0, 1), '2025-01'],
    [new Date(2024, 11, 30), '2025-01'],
    [new Date(2023, 0, 1), '2022-52'],
  ])('uses ISO week years at year boundaries', async (date, expected) => {
    const resolver = new Resolver(date, 'Note');
    expect(
      await resolver.resolveText('$FOAM_DATE_WEEK_YEAR-$FOAM_DATE_WEEK')
    ).toBe(expected);
  });
});
