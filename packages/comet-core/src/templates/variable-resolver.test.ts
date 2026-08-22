import { CometError } from '../common/errors';
import { resolveTemplateVariables } from './variable-resolver';

const date = new Date(2021, 9, 15, 1, 2, 3);
const context = { date, title: 'My/note#title', locale: 'en-US' };

describe('resolveTemplateVariables', () => {
  it('resolves title, safe-title, slug, CJK, and fallback values', () => {
    expect(
      resolveTemplateVariables(
        '$COMET_TITLE|$COMET_TITLE_SAFE|$COMET_SLUG|${COMET_CURRENT_DIR:fallback}|$UNKNOWN',
        context
      )
    ).toBe('My/note#title|My-note-title|mynotetitle|fallback|$UNKNOWN');
    expect(
      resolveTemplateVariables('$COMET_TITLE_SAFE|$COMET_SLUG', {
        date,
        title: '中文/筆記',
      })
    ).toBe('中文-筆記|中文筆記');
  });

  it('resolves built-in and custom date formats from the supplied date', () => {
    expect(
      resolveTemplateVariables(
        '$COMET_DATE_YEAR-$COMET_DATE_MONTH-$COMET_DATE_DATE $COMET_DATE_HOUR:$COMET_DATE_MINUTE:$COMET_DATE_SECOND',
        context
      )
    ).toBe('2021-10-15 01:02:03');
    expect(
      resolveTemplateVariables(
        '${COMET_DATE_FORMAT:YYYY}|${COMET_DATE_FORMAT:MM}|${COMET_DATE_FORMAT:WW}',
        context
      )
    ).toBe('2021|10|41');
  });

  it('preserves unsupported placeholders while resolving nested variables', () => {
    expect(
      resolveTemplateVariables(
        '$1|${1:default}|${UNKNOWN:$COMET_TITLE}',
        context
      )
    ).toBe('$1|${1:default}|${UNKNOWN:My/note#title}');
  });

  it('respects escaping, variable boundaries, and malformed input', () => {
    expect(
      resolveTemplateVariables(
        '\\$COMET_TITLE|$COMET_TITLE_suffix|$COMET_TITLE$COMET_DATE_YEAR|${COMET_TITLE',
        context
      )
    ).toBe(
      '\\$COMET_TITLE|$COMET_TITLE_suffix|My/note#title2021|${COMET_TITLE'
    );
  });

  it('rejects legacy transforms on known variables', () => {
    for (const expression of [
      '${COMET_TITLE/(.*)/<$1>/}',
      '${COMET_TITLE|one,two|}',
    ]) {
      expect(() => resolveTemplateVariables(expression, context)).toThrowError(
        expect.objectContaining<Partial<CometError>>({
          code: 'invalid_input',
          data: {
            expression,
            template: '.comet/templates/new-note.md',
          },
        })
      );
    }
  });
});
