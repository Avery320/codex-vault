import { LitElement, html, css } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { getDefaultStyle } from './lib/defaults';
import { createGraphModel, computeGraphStates } from './lib/graph-utils';
import {
  computeVisibleGraph,
  deriveNodeTypeFilters,
  type VisibleGraph,
} from './lib/graph-view-model';
import { resolveStyle } from './lib/style';
import type { GraphData, GraphStyle } from './protocol';
import type {
  GraphModel,
  ResolvedStyle,
  Forces,
  Labels,
  Selection,
  LinkAnimation,
  GraphStates,
} from './lib/types';
import type { GraphCanvas } from './components/graph-canvas';
import './components/graph-canvas';

@customElement('foam-graph')
export class FoamGraph extends LitElement {
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
  @property({ type: Number }) linkWidthMultiplier: number = 2;
  @property({ type: Object }) selection: Selection = {
    centerOnSelect: true,
    zoomOnSelect: true,
  };

  @query('foam-graph-canvas') private canvas!: GraphCanvas;

  // Internal app state
  @state() private graphModel: GraphModel | null = null;
  @state() private selectedNodeIds = new Set<string>();
  @state() private hoverNodeId: string | null = null;
  @state() private showNodesOfType: Record<string, boolean> = {
    placeholder: true,
    image: false,
    attachment: false,
    note: true,
    tag: true,
  };
  @state() private nodeFontSizeMultiplier: number = 1;
  @state() private nodeSizeMultiplier: number = 2;
  @state() private animateLinks: LinkAnimation = 'forward';
  // Pipeline: GraphData -> GraphModel -> VisibleGraph plus GraphStates for rendering.
  @state() private visibleGraph: VisibleGraph | null = null;
  @state() private graphStates: GraphStates | null = null;

  private get resolvedStyle(): ResolvedStyle {
    return resolveStyle(this.graphStyle, getDefaultStyle());
  }

  updated(changed: Map<string, unknown>) {
    let shouldRecomputeVisibleGraph = false;
    let shouldRecomputeGraphStates = false;

    if (changed.has('graphData')) {
      this.graphModel = this.graphData
        ? createGraphModel(this.graphData)
        : null;
      this._pruneInteractionState();
      shouldRecomputeVisibleGraph = true;
      shouldRecomputeGraphStates = true;
    }

    if (changed.has('graphStyle') && this.graphStyle?.showNodesOfType) {
      this.showNodesOfType = {
        ...this.showNodesOfType,
        ...this.graphStyle.showNodesOfType,
      };
      shouldRecomputeVisibleGraph = true;
    }

    if (
      (changed.has('graphData') || changed.has('graphStyle')) &&
      this.graphModel
    ) {
      this.showNodesOfType = deriveNodeTypeFilters(
        this.graphModel,
        this.resolvedStyle,
        this.showNodesOfType
      );
      shouldRecomputeVisibleGraph = true;
    }

    if (changed.has('selection') || changed.has('hoverNodeId')) {
      shouldRecomputeGraphStates = true;
    }

    if (shouldRecomputeVisibleGraph) {
      this._recomputeVisibleGraph();
    }
    if (shouldRecomputeGraphStates) {
      this._recomputeGraphStates();
    }
  }

  render() {
    return html`
      <foam-graph-canvas
        .visibleGraph=${this.visibleGraph}
        .graphStates=${this.graphStates}
        .style=${this.resolvedStyle}
        .forces=${this.forces}
        .labels=${this.labels}
        .nodeFontSizeMultiplier=${this.nodeFontSizeMultiplier}
        .nodeSizeMultiplier=${this.nodeSizeMultiplier}
        .linkWidthMultiplier=${this.linkWidthMultiplier}
        .animateLinks=${this.animateLinks}
        .maxFitZoom=${this.maxFitZoom}
        @canvas-node-click=${(e: CustomEvent) =>
          this._onCanvasNodeClick(e.detail)}
        @canvas-node-hover=${(e: CustomEvent) => (this.hoverNodeId = e.detail)}
        @canvas-background-click=${(e: CustomEvent) =>
          this._onCanvasBackgroundClick(e.detail)}
      ></foam-graph-canvas>
    `;
  }

  selectNote(noteId: string) {
    this._selectNode(noteId, false);
    if (!this.visibleGraph?.nodeInfo[noteId]) return;
    if (this.selection.centerOnSelect) {
      this.canvas?.centerOnNode(
        noteId,
        this.selection.zoomOnSelect ? 3 : undefined,
        300
      );
    } else if (this.selection.zoomOnSelect) {
      this.canvas?.zoom(3, 300);
    }
  }

  clearSelection() {
    this.selectedNodeIds = new Set();
    this._recomputeGraphStates();
  }

  private _onCanvasNodeClick(detail: { nodeId: string; append: boolean }) {
    this._selectNode(detail.nodeId, detail.append);
    this.dispatchEvent(
      new CustomEvent('node-click', {
        detail: detail.nodeId,
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onCanvasBackgroundClick(detail: { append: boolean }) {
    if (!detail.append) {
      this.clearSelection();
    }
  }

  private _selectNode(nodeId: string, append: boolean) {
    const next = append ? new Set(this.selectedNodeIds) : new Set<string>();
    next.add(nodeId);
    this.selectedNodeIds = next;
    this._recomputeGraphStates();
  }

  private _pruneInteractionState() {
    if (!this.graphModel) {
      this.selectedNodeIds = new Set();
      this.hoverNodeId = null;
      return;
    }
    this.selectedNodeIds = new Set(
      [...this.selectedNodeIds].filter(
        id => this.graphModel!.nodeInfo[id] != null
      )
    );
    if (this.hoverNodeId && !this.graphModel.nodeInfo[this.hoverNodeId]) {
      this.hoverNodeId = null;
    }
  }

  private _recomputeVisibleGraph() {
    this.visibleGraph = this.graphModel
      ? computeVisibleGraph(this.graphModel, this.showNodesOfType)
      : null;
  }

  private _recomputeGraphStates() {
    this.graphStates = this.graphModel
      ? computeGraphStates(
          this.graphModel,
          this.selectedNodeIds,
          this.hoverNodeId
        )
      : null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'foam-graph': FoamGraph;
  }
}
