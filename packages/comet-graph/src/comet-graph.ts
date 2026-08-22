import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getDefaultStyle } from './lib/defaults';
import { createGraphModel } from './lib/graph-utils';
import { computeVisibleGraph, type VisibleGraph } from './lib/graph-view-model';
import { resolveStyle } from './lib/style';
import type { GraphData, GraphStyle } from './protocol';
import type {
  GraphModel,
  ResolvedStyle,
  Forces,
  Labels,
} from './lib/types';
import './components/graph-canvas';

const DEFAULT_NODE_TYPE_VISIBILITY: Record<string, boolean> = {
  placeholder: true,
  image: false,
  attachment: false,
  note: true,
  tag: true,
};

@customElement('comet-graph')
export class CometGraph extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
    }
  `;

  // Public API
  @property({ type: Object }) graphData: GraphData | null = null;
  @property({ type: Object }) graphStyle: GraphStyle | null = null;
  @property({ type: Number }) maxFitZoom: number | null = null;
  @property({ type: Object }) labels: Labels = { fade: 0 };
  @property({ type: Object }) forces: Forces = {
    collide: 1,
    repel: 10,
    link: 30,
    velocityDecay: 0.4,
  };
  @property({ type: Number }) nodeSizeMultiplier: number = 2;
  @property({ type: Number }) linkWidthMultiplier: number = 2;

  // Internal app state
  @state() private graphModel: GraphModel | null = null;
  @state() private selectedNodeId: string | null = null;
  @state() private hoverNodeId: string | null = null;
  // Pipeline: GraphData -> GraphModel -> VisibleGraph for rendering.
  @state() private visibleGraph: VisibleGraph | null = null;

  private get resolvedStyle(): ResolvedStyle {
    return resolveStyle(this.graphStyle, getDefaultStyle());
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('graphData') || changed.has('graphStyle')) {
      if (changed.has('graphData')) {
        this.selectedNodeId = null;
        this.hoverNodeId = null;
        this.graphModel = this.graphData
          ? createGraphModel(this.graphData)
          : null;
      }
      this.visibleGraph = this.graphModel
        ? computeVisibleGraph(this.graphModel, {
            ...DEFAULT_NODE_TYPE_VISIBILITY,
            ...this.graphStyle?.showNodesOfType,
          })
        : null;
    }
  }

  render() {
    return html`
      <comet-graph-canvas
        .visibleGraph=${this.visibleGraph}
        .selectedNodeId=${this.selectedNodeId}
        .hoverNodeId=${this.hoverNodeId}
        .graphStyle=${this.resolvedStyle}
        .forces=${this.forces}
        .labels=${this.labels}
        .nodeSizeMultiplier=${this.nodeSizeMultiplier}
        .linkWidthMultiplier=${this.linkWidthMultiplier}
        .maxFitZoom=${this.maxFitZoom}
        @canvas-node-click=${(e: CustomEvent<string>) =>
          this._onCanvasNodeClick(e.detail)}
        @canvas-node-hover=${(e: CustomEvent) => (this.hoverNodeId = e.detail)}
        @canvas-background-click=${() => this.clearSelection()}
      ></comet-graph-canvas>
    `;
  }

  selectNote(noteId: string) {
    this.selectedNodeId = noteId;
  }

  clearSelection() {
    this.selectedNodeId = null;
  }

  private _onCanvasNodeClick(nodeId: string) {
    this.selectedNodeId = nodeId;
    this.dispatchEvent(
      new CustomEvent('node-click', {
        detail: nodeId,
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'comet-graph': CometGraph;
  }
}
