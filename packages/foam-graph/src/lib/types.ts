import type { NodeInfo } from '../protocol';

export type GraphModelNode = NodeInfo;

export interface GraphModelLink {
  source: string | GraphModelNode;
  target: string | GraphModelNode;
}

export const GraphModelLink = {
  getNodeId(endpoint: GraphModelLink['source']): string {
    return typeof endpoint === 'object' ? endpoint.id : endpoint;
  },

  getKey(link: GraphModelLink): string {
    return `${GraphModelLink.getNodeId(
      link.source
    )}->${GraphModelLink.getNodeId(link.target)}`;
  },
};

export interface GraphModel {
  nodeInfo: Record<string, GraphModelNode>;
  links: GraphModelLink[];
}

export interface ResolvedStyle {
  background: string;
  fontSize: number;
  fontFamily: string;
  lineColor: string;
  lineWidth: number;
  particleWidth: number;
  highlightedForeground: string;
  node: {
    note: string;
    placeholder: string;
    tag: string;
    [key: string]: string;
  };
  colorMode: 'none' | 'directory' | 'type';
}

export type NodeState = 'regular' | 'highlighted';
export type LinkState = 'regular' | 'highlighted';

export interface GraphStates {
  nodeStates: Map<string, NodeState>;
  /** Keyed by "sourceId->targetId" for identity-safe lookup across copied link objects. */
  linkStates: Map<string, LinkState>;
}

export interface Forces {
  collide: number;
  repel: number;
  link: number;
  velocityDecay: number;
}

export type LinkAnimation = 'forward' | 'off' | 'reverse';

export type Labels = 'always' | { fade: number };

export interface Selection {
  centerOnSelect: boolean;
  zoomOnSelect: boolean;
}
