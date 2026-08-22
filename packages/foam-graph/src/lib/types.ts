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
  highlightedForeground: string;
  node: {
    note: string;
    placeholder: string;
    tag: string;
    [key: string]: string;
  };
}

export interface Forces {
  collide: number;
  repel: number;
  link: number;
  velocityDecay: number;
}

export type Labels = 'always' | { fade: number };
