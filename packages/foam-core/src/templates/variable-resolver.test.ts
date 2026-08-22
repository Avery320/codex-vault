import { FoamError } from '../common/errors';
import {
  resolveTemplateVariables,
  safeTemplateTitle,
} from './variable-resolver';

const date = new Date(2021, 9, 15, 1, 2, 3);
const context = {
  date,
  title: 'My/note#title',
  locale: 'en-US',
};

describe('resolveTemplateVariables', () => {
  it('resolves title variables and preserves unknown variables', () => {
    expect(
      resolveTemplateVariables(
        '$FOAM_TITLE|${FOAM_TITLE}|$FOAM_TITLE_SAFE|$FOAM_SLUG|$UNKNOWN',
        context
      )
    ).toBe(
      'My/note#title|My/note#title|My-note-title|mynotetitle|$UNKNOWN'
    );
  });

  it('resolves all date variables from one supplied date', () => {
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
    ];
    expect(
      resolveTemplateVariables(
        variables.map(name => `$${name}`).join('|'),
        context
      )
    ).toBe(expected.join('|'));
  });

  it('resolves each custom date format independently', () => {
    expect(
      resolveTemplateVariables(
        '${FOAM_DATE_FORMAT:YYYY}|${FOAM_DATE_FORMAT:MM}|${FOAM_DATE_FORMAT:WW}',
        context
      )
    ).toBe('2021|10|41');
    expect(resolveTemplateVariables('$FOAM_DATE_FORMAT', context)).toMatch(
      /^2021-10-15T01:02:03[+-]\d{2}:\d{2}$/
    );
  });

  it.each([
    [new Date(2025, 0, 1), '2025-01'],
    [new Date(2024, 11, 30), '2025-01'],
    [new Date(2023, 0, 1), '2022-52'],
  ])('uses ISO week years at year boundaries', (value, expected) => {
    expect(
      resolveTemplateVariables('$FOAM_DATE_WEEK_YEAR-$FOAM_DATE_WEEK', {
        date: value,
      })
    ).toBe(expected);
  });

  it('preserves TextMate placeholders but resolves nested Foam variables', () => {
    expect(
      resolveTemplateVariables(
        '$1|${1:default}|${1|one,two|}|${UNKNOWN:$FOAM_TITLE}',
        context
      )
    ).toBe(
      '$1|${1:default}|${1|one,two|}|${UNKNOWN:My/note#title}'
    );
  });

  it('respects escaping, name boundaries, repetition, and malformed input', () => {
    expect(
      resolveTemplateVariables(
        '\\$FOAM_TITLE|\\\\$FOAM_TITLE|$FOAM_TITLE_suffix|$FOAM_TITLE$FOAM_DATE_YEAR|${FOAM_TITLE',
        context
      )
    ).toBe(
      '\\$FOAM_TITLE|\\\\My/note#title|$FOAM_TITLE_suffix|My/note#title2021|${FOAM_TITLE'
    );
  });

  it('uses defaults only for variables without a value', () => {
    expect(
      resolveTemplateVariables(
        '${FOAM_TITLE:fallback}|${FOAM_CURRENT_DIR:fallback}|$FOAM_CURRENT_DIR|${FOAM_SELECTED_TEXT:fallback}',
        { date }
      )
    ).toBe('fallback|fallback||');
  });

  it('supports CJK titles without changing unrelated text', () => {
    expect(
      resolveTemplateVariables('前綴 $FOAM_TITLE_SAFE / $FOAM_SLUG 後綴', {
        date,
        title: '中文/筆記',
      })
    ).toBe('前綴 中文-筆記 / 中文筆記 後綴');
    expect(safeTemplateTitle('a/b:c')).toBe('a-b-c');
  });

  it.each([
    '${FOAM_TITLE/(.*)/<$1>/}',
    '${FOAM_TITLE|one,two|}',
  ])('rejects TextMate syntax on known Foam variables', expression => {
    expect(() => resolveTemplateVariables(expression, context)).toThrowError(
      expect.objectContaining<Partial<FoamError>>({
        code: 'invalid_input',
        data: {
          expression,
          template: '.foam/templates/new-note.md',
        },
      })
    );
  });
});
