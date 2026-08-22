import { Resource } from '../model/note';
import { URI } from '../model/uri';
import { ResourceProvider } from '../model/provider';

const imageExtensions = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
];

export const defaultAttachmentExtensions = [
  '.pdf',
  '.mp3',
  '.webm',
  '.wav',
  '.m4a',
  '.mp4',
  '.avi',
  '.mov',
  '.rtf',
  '.txt',
  '.doc',
  '.docx',
  '.pages',
  '.xls',
  '.xlsx',
  '.numbers',
  '.ppt',
  '.pptm',
  '.pptx',
];

const asResource = (uri: URI): Resource => {
  const type = imageExtensions.includes(uri.getExtension())
    ? 'image'
    : 'attachment';
  return {
    uri: uri,
    title: uri.getBasename(),
    type: type,
    aliases: [],
    properties: { type: type },
    sections: [],
    links: [],
    tags: [],
  };
};

export class AttachmentResourceProvider implements ResourceProvider {
  public readonly attachmentExtensions: string[];

  constructor(attachmentExtensions: string[] = []) {
    this.attachmentExtensions = [...imageExtensions, ...attachmentExtensions];
  }

  supports(uri: URI) {
    return this.attachmentExtensions.includes(
      uri.getExtension().toLocaleLowerCase()
    );
  }

  async fetch(uri: URI) {
    return asResource(uri);
  }

  resolveLink(): URI {
    throw new Error('not supported');
  }
}
