import { FoamError } from '../common/errors';
import { resolveTemplateVariables } from './variable-resolver';

const date = new Date(2021, 9, 15, 1, 2, 3);
const context = { date, title: 'My/note#title', locale: 'en-US' };

describe('resolveTemplateVariables', () => {
  it('resolves title, safe-title, slug, CJK, and fallback values', () => {
    expect(
      resolveTemplateVariables(
        '$FOAM_TITLE|$FOAM_TITLE_SAFE|$FOAM_SLUG|${FOAM_CURRENT_DIR:fallback}|$UNKNOWN',
        context
      )
    ).toBe('My/note#title|My-note-title|mynotetitle|fallback|$UNKNOWN');
    expect(
      resolveTemplateVariables('$FOAM_TITLE_SAFE|$FOAM_SLUG', {
        date,
        title: '中文/筆記',
      })
    ).toBe('中文-筆記|中文筆記');
  });

  it('resolves built-in and custom date formats from the supplied date', () => {
    expect(
      resolveTemplateVariables(
        '$FOAM_DATE_YEAR-$FOAM_DATE_MONTH-$FOAM_DATE_DATE $FOAM_DATE_HOUR:$FOAM_DATE_MINUTE:$FOAM_DATE_SECOND',
        context
      )
    ).toBe('2021-10-15 01:02:03');
    expect(
      resolveTemplateVariables(
        '${FOAM_DATE_FORMAT:YYYY}|${FOAM_DATE_FORMAT:MM}|${FOAM_DATE_FORMAT:WW}',
        context
      )
    ).toBe('2021|10|41');
  });

  it('preserves unsupported placeholders while resolving nested variables', () => {
    expect(
      resolveTemplateVariables(
        '$1|${1:default}|${UNKNOWN:$FOAM_TITLE}',
        context
      )
    ).toBe('$1|${1:default}|${UNKNOWN:My/note#title}');
  });

  it('respects escaping, variable boundaries, and malformed input', () => {
    expect(
      resolveTemplateVariables(
        '\\$FOAM_TITLE|$FOAM_TITLE_suffix|$FOAM_TITLE$FOAM_DATE_YEAR|${FOAM_TITLE',
        context
      )
    ).toBe(
      '\\$FOAM_TITLE|$FOAM_TITLE_suffix|My/note#title2021|${FOAM_TITLE'
    );
  });

  it('rejects legacy transforms on known variables', () => {
    for (const expression of [
      '${FOAM_TITLE/(.*)/<$1>/}',
      '${FOAM_TITLE|one,two|}',
    ]) {
      expect(() => resolveTemplateVariables(expression, context)).toThrowError(
        expect.objectContaining<Partial<FoamError>>({
          code: 'invalid_input',
          data: {
            expression,
            template: '.foam/templates/new-note.md',
          },
        })
      );
    }
  });
});
