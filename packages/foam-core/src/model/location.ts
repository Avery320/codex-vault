import { Range } from './range';
import { URI } from './uri';

/**
 * Represents a location inside a resource, such as a line
 * inside a text file.
 */
export interface Location<T> {
  /**
   * The resource identifier of this location.
   */
  uri: URI;
  /**
   * The document range of this locations.
   */
  range: Range;
  /**
   * The data associated to this location.
   */
  data: T;
}

export function locationForObjectWithRange<T extends { range: Range }>(
  uri: URI,
  data: T
): Location<T> {
  return { uri, range: data.range, data };
}
