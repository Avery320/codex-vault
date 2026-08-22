import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import isoWeekPlugin from 'dayjs/plugin/isoWeek';
import { CometError } from '../common/errors';
import { toSlug } from '../utils/slug';

dayjs.extend(isoWeekPlugin);
dayjs.extend(advancedFormat);

interface TemplateVariableContext {
  date: Date;
  title?: string;
  locale?: string;
}

const TEMPLATE_PATH = '.comet/templates/new-note.md';
const DEFAULT_DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ';
const UNALLOWED_TITLE_CHARS = '/\\#%&{}<>?*$!\'":@+`|=';
const KNOWN_VARIABLES = new Set([
  'COMET_TITLE',
  'COMET_TITLE_SAFE',
  'COMET_SLUG',
  'COMET_SELECTED_TEXT',
  'COMET_CURRENT_DIR',
  'COMET_DATE_FORMAT',
  'COMET_DATE_YEAR',
  'COMET_DATE_YEAR_SHORT',
  'COMET_DATE_MONTH',
  'COMET_DATE_MONTH_NAME',
  'COMET_DATE_MONTH_NAME_SHORT',
  'COMET_DATE_DATE',
  'COMET_DATE_DAY_ISO',
  'COMET_DATE_WEEK',
  'COMET_DATE_WEEK_YEAR',
  'COMET_DATE_DAY_NAME',
  'COMET_DATE_DAY_NAME_SHORT',
  'COMET_DATE_HOUR',
  'COMET_DATE_MINUTE',
  'COMET_DATE_SECOND',
  'COMET_DATE_SECONDS_UNIX',
]);

export function safeTemplateTitle(title: string): string {
  let safeTitle = title;
  for (const char of UNALLOWED_TITLE_CHARS) {
    safeTitle = safeTitle.split(char).join('-');
  }
  return safeTitle;
}

export function resolveTemplateVariables(
  text: string,
  context: TemplateVariableContext
): string {
  let result = '';

  for (let index = 0; index < text.length; ) {
    if (text[index] !== '$' || isEscaped(text, index)) {
      result += text[index++];
      continue;
    }

    if (text[index + 1] !== '{') {
      const nameEnd = readVariableName(text, index + 1);
      const name = text.slice(index + 1, nameEnd);
      if (!KNOWN_VARIABLES.has(name)) {
        result += text[index++];
        continue;
      }
      result += resolveCometVariable(name, undefined, context) ?? '';
      index = nameEnd;
      continue;
    }

    const nameStart = index + 2;
    const nameEnd = readVariableName(text, nameStart);
    const name = text.slice(nameStart, nameEnd);
    if (!KNOWN_VARIABLES.has(name)) {
      result += text[index++];
      continue;
    }

    const close = findClosingBrace(text, index + 1);
    if (close === -1) {
      result += text.slice(index);
      break;
    }

    const separator = text[nameEnd];
    if (separator !== '}' && separator !== ':') {
      const expression = text.slice(index, close + 1);
      throw new CometError(
        'invalid_input',
        `Unsupported TextMate expression in ${TEMPLATE_PATH}: ${expression}`,
        { expression, template: TEMPLATE_PATH }
      );
    }

    const argument =
      separator === ':'
        ? resolveTemplateVariables(text.slice(nameEnd + 1, close), context)
        : undefined;
    const value = resolveCometVariable(name, argument, context);
    result += value ?? argument ?? '';
    index = close + 1;
  }

  return result;
}

function resolveCometVariable(
  name: string,
  argument: string | undefined,
  { date, title, locale = 'default' }: TemplateVariableContext
): string | undefined {
  switch (name) {
    case 'COMET_TITLE':
      return title;
    case 'COMET_TITLE_SAFE':
      return title === undefined ? undefined : safeTemplateTitle(title);
    case 'COMET_SLUG':
      return title === undefined ? undefined : toSlug(title);
    case 'COMET_SELECTED_TEXT':
      return '';
    case 'COMET_CURRENT_DIR':
      return undefined;
    case 'COMET_DATE_FORMAT':
      return dayjs(date).format(argument || DEFAULT_DATE_FORMAT);
    case 'COMET_DATE_YEAR':
      return String(date.getFullYear());
    case 'COMET_DATE_YEAR_SHORT':
      return String(date.getFullYear()).slice(-2);
    case 'COMET_DATE_MONTH':
      return String(date.getMonth() + 1).padStart(2, '0');
    case 'COMET_DATE_MONTH_NAME':
      return date.toLocaleString(locale, { month: 'long' });
    case 'COMET_DATE_MONTH_NAME_SHORT':
      return date.toLocaleString(locale, { month: 'short' });
    case 'COMET_DATE_DATE':
      return String(date.getDate()).padStart(2, '0');
    case 'COMET_DATE_DAY_ISO':
      return String(((date.getDay() + 6) % 7) + 1);
    case 'COMET_DATE_WEEK':
      return isoWeek(date).week;
    case 'COMET_DATE_WEEK_YEAR':
      return isoWeek(date).year;
    case 'COMET_DATE_DAY_NAME':
      return date.toLocaleString(locale, { weekday: 'long' });
    case 'COMET_DATE_DAY_NAME_SHORT':
      return date.toLocaleString(locale, { weekday: 'short' });
    case 'COMET_DATE_HOUR':
      return String(date.getHours()).padStart(2, '0');
    case 'COMET_DATE_MINUTE':
      return String(date.getMinutes()).padStart(2, '0');
    case 'COMET_DATE_SECOND':
      return String(date.getSeconds()).padStart(2, '0');
    case 'COMET_DATE_SECONDS_UNIX':
      return String(date.getTime() / 1000).padStart(2, '0');
  }
}

function isoWeek(date: Date): { week: string; year: string } {
  const thursday = new Date(date);
  thursday.setDate(thursday.getDate() + 4 - (thursday.getDay() || 7));
  const year = String(thursday.getFullYear());
  const firstDay = new Date(thursday);
  firstDay.setMonth(0);
  firstDay.setDate(1);
  const days = Math.round((thursday.getTime() - firstDay.getTime()) / 86400000);
  return { week: String(Math.floor(days / 7) + 1).padStart(2, '0'), year };
}

function readVariableName(text: string, start: number): number {
  if (!/[A-Za-z_]/.test(text[start] ?? '')) return start;
  let end = start + 1;
  while (/[A-Za-z0-9_]/.test(text[end] ?? '')) end++;
  return end;
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  while (text[index - slashes - 1] === '\\') slashes++;
  return slashes % 2 === 1;
}

function findClosingBrace(text: string, open: number): number {
  let depth = 1;
  for (let index = open + 1; index < text.length; index++) {
    if (text[index] === '$' && text[index + 1] === '{') {
      depth++;
      index++;
    } else if (text[index] === '}' && --depth === 0) {
      return index;
    }
  }
  return -1;
}
